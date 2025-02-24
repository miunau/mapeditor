import type { Brush, BrushApplicationOptions, BrushApplicationResult } from '../types/brush';
import type { Tilemap } from '../tilemap';
import type { Rect } from '../utils/coordinates';
import { generateBrushId, createBrushPreview as createBrushPreviewUtil } from '../utils/brush';
import { calculateBrushPattern } from '../utils/brush';
import { isInMapBounds, calculateBrushTargetArea } from '../utils/coordinates';
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

    private applyBrushPattern(
        mapData: number[][],
        brush: Brush,
        targetArea: Rect,
        options: BrushApplicationOptions = {}
    ): BrushApplicationResult {
        const pattern = calculateBrushPattern(
            targetArea,
            { 
                width: brush.width,
                height: brush.height
            },
            options.useWorldAlignedRepeat || false
        );

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