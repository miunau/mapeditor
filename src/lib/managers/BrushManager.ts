import type { Brush, BrushApplicationOptions, BrushApplicationResult } from '../types/brush';
import type { Tilemap } from '../tilemap';
import type { Rect } from '../utils/coordinates';
import { generateBrushId, createBrushPreview as createBrushPreviewUtil } from '../utils/brush';
import { calculateBrushPattern } from '../utils/brush';
import { isInMapBounds, calculateBrushTargetArea, mapToScreen } from '../utils/coordinates';
import { SvelteMap } from 'svelte/reactivity';

export class BrushManager {
    private brushes: Map<string, Brush> = new SvelteMap();
    private selectedBrushId: string | null = null;
    
    constructor(tilemap: Tilemap) {
        // Convert each tile into a 1x1 brush
        this.initializeBuiltInBrushes(tilemap);
    }

    private initializeBuiltInBrushes(tilemap: Tilemap) {
        for (let i = 0; i < tilemap.width * tilemap.height; i++) {
            const brush = this.createBuiltInBrush(i, tilemap);
            this.brushes.set(brush.id, brush);
        }
    }

    private createBuiltInBrush(tileIndex: number, tilemap: Tilemap): Brush {
        return {
            id: `tile_${tileIndex}`,
            name: `Tile ${tileIndex}`,
            tiles: [[tileIndex]],
            width: 1,
            height: 1,
            preview: createBrushPreviewUtil(
                { 
                    tiles: [[tileIndex]], 
                    width: 1, 
                    height: 1,
                    name: `Tile ${tileIndex}`
                },
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
            ),
            isBuiltIn: true
        };
    }

    createCustomBrush(name: string, tiles: number[][], tilemap: Tilemap): Brush {
        const brush: Brush = {
            id: generateBrushId(),
            name: name || `${tiles[0].length}x${tiles.length} Brush`,
            tiles,
            width: tiles[0].length,
            height: tiles.length,
            preview: createBrushPreviewUtil(
                { 
                    tiles, 
                    width: tiles[0].length, 
                    height: tiles.length,
                    name: name || `${tiles[0].length}x${tiles.length} Brush`
                },
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
            )
        };
        
        this.brushes.set(brush.id, brush);
        return brush;
    }

    updateBrush(brushId: string, name: string, tiles: number[][], tilemap: Tilemap): Brush | null {
        const brush = this.brushes.get(brushId);
        if (!brush || brush.isBuiltIn) return null;

        const updatedBrush: Brush = {
            ...brush,
            name: name || brush.name,
            tiles,
            width: tiles[0].length,
            height: tiles.length,
            preview: createBrushPreviewUtil(
                { 
                    tiles, 
                    width: tiles[0].length, 
                    height: tiles.length,
                    name: name || brush.name
                },
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
            )
        };

        this.brushes.set(brushId, updatedBrush);
        return updatedBrush;
    }

    deleteBrush(brushId: string): boolean {
        const brush = this.brushes.get(brushId);
        if (!brush || brush.isBuiltIn) return false;

        if (this.selectedBrushId === brushId) {
            this.selectedBrushId = null;
        }

        return this.brushes.delete(brushId);
    }

    selectBrush(brushId: string | null) {
        if (brushId === null || this.brushes.has(brushId)) {
            this.selectedBrushId = brushId;
        }
    }

    getSelectedBrush(): Brush | null {
        return this.selectedBrushId ? this.brushes.get(this.selectedBrushId) || null : null;
    }

    getBrush(brushId: string): Brush | null {
        return this.brushes.get(brushId) || null;
    }

    getAllBrushes(): Brush[] {
        return Array.from(this.brushes.values());
    }

    getBuiltInBrushes(): Brush[] {
        return Array.from(this.brushes.values()).filter(brush => brush.isBuiltIn);
    }

    getCustomBrushes(): Brush[] {
        return Array.from(this.brushes.values()).filter(brush => !brush.isBuiltIn);
    }

    applyBrush(
        mapData: number[][],
        x: number,
        y: number,
        brushSize: number = 1,
        options: BrushApplicationOptions = {}
    ): BrushApplicationResult {
        const brush = this.getSelectedBrush();
        if (!brush || options.isErasing) {
            // Handle erasing or no brush selected
            return this.applyErase(mapData, x, y, brushSize);
        }

        const targetArea = calculateBrushTargetArea(x, y, brushSize, brush, options.isCustomBrush);
        return this.applyBrushPattern(mapData, brush, targetArea, options);
    }

    applyBrushToPoints(
        mapData: number[][],
        points: { x: number, y: number }[],
        brush: Brush,
        options: BrushApplicationOptions = {}
    ): BrushApplicationResult {
        if (!brush || options.isErasing || points.length === 0) {
            return { modified: false };
        }

        const { targetArea, pattern } = this.calculatePatternForPoints(points, brush, options.useWorldAlignedRepeat || false);
        let modified = false;

        // Apply the pattern to each point
        for (const point of points) {
            const relX = point.x - targetArea.x;
            const relY = point.y - targetArea.y;
            const { sourceX, sourceY } = pattern[relY][relX];
            const tileIndex = brush.tiles[sourceY][sourceX];
            
            if (tileIndex !== -1) {
                if (mapData[point.y][point.x] !== tileIndex) {
                    mapData[point.y][point.x] = tileIndex;
                    modified = true;
                }
            }
        }

        return {
            modified,
            affectedArea: modified ? targetArea : undefined
        };
    }

    private applyBrushPattern(
        mapData: number[][],
        brush: Brush,
        targetArea: Rect,
        options: BrushApplicationOptions = {}
    ): BrushApplicationResult {
        const pattern = this.calculatePatternForArea(targetArea, brush, options.useWorldAlignedRepeat || false);

        let modified = false;
        for (let ty = 0; ty < targetArea.height; ty++) {
            for (let tx = 0; tx < targetArea.width; tx++) {
                const worldX = targetArea.x + tx;
                const worldY = targetArea.y + ty;

                if (isInMapBounds(worldX, worldY, { width: mapData[0].length, height: mapData.length })) {
                    const { sourceX, sourceY } = pattern[ty][tx];
                    const tileIndex = brush.tiles[sourceY][sourceX];
                    
                    if (tileIndex !== -1 && mapData[worldY][worldX] !== tileIndex) {
                        mapData[worldY][worldX] = tileIndex;
                        modified = true;
                    }
                }
            }
        }

        return {
            modified,
            affectedArea: modified ? targetArea : undefined
        };
    }

    private calculatePatternForArea(
        targetArea: Rect,
        brush: Brush,
        useWorldAlignedRepeat: boolean
    ): { sourceX: number, sourceY: number }[][] {
        return calculateBrushPattern(
            targetArea,
            { width: brush.width, height: brush.height },
            useWorldAlignedRepeat
        );
    }

    private calculatePatternForPoints(
        points: { x: number, y: number }[],
        brush: Brush,
        useWorldAlignedRepeat: boolean
    ): { targetArea: Rect, pattern: { sourceX: number, sourceY: number }[][] } {
        // Find the bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const point of points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        const targetArea = {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };

        return {
            targetArea,
            pattern: this.calculatePatternForArea(targetArea, brush, useWorldAlignedRepeat)
        };
    }

    drawBrushPreview(
        ctx: CanvasRenderingContext2D,
        brush: Brush,
        targetArea: Rect,
        getTile: (idx: number) => HTMLCanvasElement | null,
        tileWidth: number,
        tileHeight: number,
        useWorldAlignedRepeat: boolean = false
    ) {
        const pattern = this.calculatePatternForArea(targetArea, brush, useWorldAlignedRepeat);

        ctx.globalAlpha = 0.5;
        for (let ty = 0; ty < targetArea.height; ty++) {
            for (let tx = 0; tx < targetArea.width; tx++) {
                const worldX = targetArea.x + tx;
                const worldY = targetArea.y + ty;

                const { sourceX, sourceY } = pattern[ty][tx];
                const tileIndex = brush.tiles[sourceY][sourceX];
                
                if (tileIndex !== -1) {
                    const tile = getTile(tileIndex);
                    if (tile) {
                        const screenPos = mapToScreen(
                            worldX,
                            worldY,
                            0,
                            0,
                            1,
                            tileWidth,
                            tileHeight
                        );
                        ctx.drawImage(tile, screenPos.x, screenPos.y);
                    }
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    drawBrushPreviewOnPoints(
        ctx: CanvasRenderingContext2D,
        brush: Brush,
        points: { x: number, y: number }[],
        getTile: (idx: number) => HTMLCanvasElement | null,
        tileWidth: number,
        tileHeight: number,
        useWorldAlignedRepeat: boolean = false
    ) {
        if (points.length === 0) return;

        const { targetArea, pattern } = this.calculatePatternForPoints(points, brush, useWorldAlignedRepeat);

        ctx.globalAlpha = 0.5;
        for (const point of points) {
            const relX = point.x - targetArea.x;
            const relY = point.y - targetArea.y;
            const { sourceX, sourceY } = pattern[relY][relX];
            const tileIndex = brush.tiles[sourceY][sourceX];
            
            if (tileIndex !== -1) {
                const tile = getTile(tileIndex);
                if (tile) {
                    const screenPos = mapToScreen(
                        point.x,
                        point.y,
                        0,
                        0,
                        1,
                        tileWidth,
                        tileHeight
                    );
                    ctx.drawImage(tile, screenPos.x, screenPos.y);
                }
            }
        }
        ctx.globalAlpha = 1.0;
    }

    private applyErase(
        mapData: number[][],
        x: number,
        y: number,
        size: number
    ): BrushApplicationResult {
        const targetArea = calculateBrushTargetArea(x, y, size, null);
        let modified = false;

        for (let ty = 0; ty < targetArea.height; ty++) {
            for (let tx = 0; tx < targetArea.width; tx++) {
                const worldX = targetArea.x + tx;
                const worldY = targetArea.y + ty;

                if (isInMapBounds(worldX, worldY, { width: mapData[0].length, height: mapData.length })) {
                    if (mapData[worldY][worldX] !== -1) {
                        mapData[worldY][worldX] = -1;
                        modified = true;
                    }
                }
            }
        }

        return {
            modified,
            affectedArea: modified ? targetArea : undefined
        };
    }
} 