import type { Brush, BrushApplicationOptions, BrushApplicationResult } from '../utils/brush';
import type { Tilemap } from '../tilemap';
import type { Rect } from '../utils/coordinates';
import { createBrushPreview as createBrushPreviewUtil } from '../utils/brush';
import { calculateBrushPattern } from '../utils/brush';
import { isInMapBounds, calculateBrushTargetArea, mapToScreen, getBrushArea } from '../utils/coordinates';
import { SvelteMap } from 'svelte/reactivity';

export class BrushManager {
    brushes: Map<string, Brush> = new SvelteMap();
    selectedBrushId: string | null = null;
    patternCache = new Map<string, HTMLCanvasElement>();
    readonly MAX_PATTERN_CACHE = 20;
    
    constructor(tilemap: Tilemap) {
        this.initializeBuiltInBrushes(tilemap);
    }

    initializeBuiltInBrushes(tilemap: Tilemap) {
        for (let i = 0; i < tilemap.width * tilemap.height; i++) {
            const brush = this.createBuiltInBrush(i, tilemap);
            this.brushes.set(brush.id, brush);
        }
    }

    createBuiltInBrush(tileIndex: number, tilemap: Tilemap): Brush {
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

    generateId() {
        return `brush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    createCustomBrush(name: string, tiles: number[][], tilemap: Tilemap): Brush {
        const brush: Brush = {
            id: this.generateId(),
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
            ),
            isBuiltIn: false
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

    getPatternKey(brush: Brush, useWorldAlignedRepeat: boolean): string {
        return `${brush.id}_${useWorldAlignedRepeat}`;
    }

    createPatternCanvas(brush: Brush, getTile: (idx: number) => HTMLCanvasElement | null, tileWidth: number, tileHeight: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = brush.width * tileWidth;
        canvas.height = brush.height * tileHeight;
        const ctx = canvas.getContext('2d')!;
        
        for (let y = 0; y < brush.height; y++) {
            for (let x = 0; x < brush.width; x++) {
                const tileIndex = brush.tiles[y][x];
                if (tileIndex !== -1) {
                    const tile = getTile(tileIndex);
                    if (tile) {
                        ctx.drawImage(tile, x * tileWidth, y * tileHeight);
                    }
                }
            }
        }
        
        return canvas;
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
        const pattern = calculateBrushPattern(targetArea, brush, useWorldAlignedRepeat);

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

        // Find the bounding box of all points
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
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

        // Create or get cached pattern
        const patternKey = this.getPatternKey(brush, useWorldAlignedRepeat);
        let patternCanvas = this.patternCache.get(patternKey);
        
        if (!patternCanvas) {
            patternCanvas = this.createPatternCanvas(brush, getTile, tileWidth, tileHeight);
            
            // Maintain cache size
            if (this.patternCache.size >= this.MAX_PATTERN_CACHE) {
                const firstKey = Array.from(this.patternCache.keys())[0];
                this.patternCache.delete(firstKey);
            }
            this.patternCache.set(patternKey, patternCanvas);
        }

        // Create a temporary canvas for the preview
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetArea.width * tileWidth;
        tempCanvas.height = targetArea.height * tileHeight;
        const tempCtx = tempCanvas.getContext('2d')!;

        // Create pattern from the brush canvas
        const pattern = tempCtx.createPattern(patternCanvas, 'repeat')!;
        tempCtx.fillStyle = pattern;

        // If using world-aligned repeat, adjust pattern offset
        if (useWorldAlignedRepeat) {
            tempCtx.save();
            const offsetX = -(targetArea.x % brush.width) * tileWidth;
            const offsetY = -(targetArea.y % brush.height) * tileHeight;
            tempCtx.translate(offsetX, offsetY);
        }

        // Create a path for all points
        tempCtx.beginPath();
        for (const point of points) {
            const x = (point.x - targetArea.x) * tileWidth;
            const y = (point.y - targetArea.y) * tileHeight;
            tempCtx.rect(x, y, tileWidth, tileHeight);
        }
        tempCtx.fill();

        if (useWorldAlignedRepeat) {
            tempCtx.restore();
        }

        // Apply alpha for preview
        tempCtx.globalCompositeOperation = 'destination-in';
        tempCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw the temporary canvas to the main canvas in one operation
        const screenPos = mapToScreen(targetArea.x, targetArea.y, 0, 0, 1, tileWidth, tileHeight);
        ctx.drawImage(tempCanvas, screenPos.x, screenPos.y);
    }

    applyErase(
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

                if (isInMapBounds(worldX, worldY, { 
                    width: mapData[0].length, 
                    height: mapData.length,
                    layers: 1
                })) {
                    if (mapData[worldY][worldX] !== -1) {
                        mapData[worldY][worldX] = -1;
                        modified = true;
                    }
                }
            }
        }

        return {
            modified,
            modifiedArea: modified ? targetArea : undefined
        };
    }
} 