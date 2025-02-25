import type { Brush, BrushApplicationOptions, BrushApplicationResult } from '../types/brush';
import type { Tilemap } from '../tilemap';
import type { Rect } from '../utils/coordinates';
import { generateBrushId, createBrushPreview as createBrushPreviewUtil } from '../utils/brush';
import { calculateBrushPattern } from '../utils/brush';
import { isInMapBounds, calculateBrushTargetArea, mapToScreen, getBrushArea } from '../utils/coordinates';
import { SvelteMap } from 'svelte/reactivity';

export class BrushManager {
    private brushes: Map<string, Brush> = new SvelteMap();
    private selectedBrushId: string | null = null;
    private patternCache = new Map<string, HTMLCanvasElement>();
    private readonly MAX_PATTERN_CACHE = 20;
    
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

    applyBrush(
        layer: number[][],
        x: number,
        y: number,
        size: number,
        options: BrushApplicationOptions = {}
    ): BrushApplicationResult {
        console.log('BrushManager: Applying brush:', {
            selectedBrushId: this.selectedBrushId,
            x,
            y,
            size,
            options,
            layerDimensions: layer ? { height: layer.length, width: layer[0]?.length } : null
        });

        let selectedBrush = this.getSelectedBrush();
        if (!selectedBrush) {
            console.log('BrushManager: No brush selected, using default tile_0 brush');
            // Use the default tile_0 brush if no brush is selected
            selectedBrush = this.brushes.get('tile_0') || null;
            if (selectedBrush) {
                this.selectedBrushId = 'tile_0';
            } else {
                console.warn('BrushManager: Default brush not found, nothing to apply');
                return { modified: false };
            }
        }

        console.log('BrushManager: Selected brush details:', {
            id: selectedBrush.id,
            name: selectedBrush.name,
            isBuiltIn: selectedBrush.isBuiltIn,
            width: selectedBrush.width,
            height: selectedBrush.height
        });

        let modified = false;
        let modifiedArea: { x: number; y: number; width: number; height: number } | undefined;

        if (options.isErasing) {
            // Handle erasing
            const area = getBrushArea(x, y, size);
            modifiedArea = area;
            
            console.log('BrushManager: Erasing area:', area);
            
            for (let ty = area.y; ty < area.y + area.height; ty++) {
                for (let tx = area.x; tx < area.x + area.width; tx++) {
                    if (ty >= 0 && ty < layer.length && tx >= 0 && tx < layer[0].length) {
                        if (layer[ty][tx] !== -1) {
                            console.log('BrushManager: Erasing tile at', { tx, ty, oldValue: layer[ty][tx] });
                            layer[ty][tx] = -1;
                            modified = true;
                        }
                    }
                }
            }
        } else if (!selectedBrush.isBuiltIn) {
            // Handle custom brush
            const area = getBrushArea(x, y, size, selectedBrush, true);
            modifiedArea = area;
            
            console.log('BrushManager: Applying custom brush to area:', area);
            
            const pattern = calculateBrushPattern(
                area,
                { width: selectedBrush.width, height: selectedBrush.height },
                options.useWorldAlignedRepeat ?? false
            );

            for (let ty = 0; ty < area.height; ty++) {
                for (let tx = 0; tx < area.width; tx++) {
                    const worldX = area.x + tx;
                    const worldY = area.y + ty;

                    if (worldY >= 0 && worldY < layer.length && worldX >= 0 && worldX < layer[0].length) {
                        const { sourceX, sourceY } = pattern[ty][tx];
                        const tileIndex = selectedBrush.tiles[sourceY][sourceX];
                        if (tileIndex !== -1) {
                            if (layer[worldY][worldX] !== tileIndex) {
                                console.log('BrushManager: Setting tile at', { worldX, worldY, oldValue: layer[worldY][worldX], newValue: tileIndex });
                                layer[worldY][worldX] = tileIndex;
                                modified = true;
                            } else {
                                console.log('BrushManager: Tile already has the correct value:', { worldX, worldY, value: tileIndex });
                            }
                        }
                    }
                }
            }
        } else {
            // Handle single tile brush
            const area = getBrushArea(x, y, size);
            modifiedArea = area;
            
            const tileIndex = parseInt(selectedBrush.id.replace('tile_', ''));
            console.log('BrushManager: Using tile index:', tileIndex, 'for area:', area);
            
            // Ensure we have a valid tile index
            if (isNaN(tileIndex) || tileIndex < 0) {
                console.warn('BrushManager: Invalid tile index:', tileIndex);
                return { modified: false };
            }
            
            // Log the area we're checking
            console.log('BrushManager: Checking area for changes:', {
                area,
                tileIndex,
                sampleCurrentValue: layer[y][x]
            });
            
            // Special case for single tile for efficiency
            if (size === 1 && area.width === 1 && area.height === 1) {
                if (y >= 0 && y < layer.length && x >= 0 && x < layer[0].length) {
                    console.log('BrushManager: Checking single tile at', { x, y, currentValue: layer[y][x], newValue: tileIndex });
                    
                    // Restore normal behavior - only modify if the tile value actually changes
                    if (layer[y][x] !== tileIndex) {
                        console.log('BrushManager: Setting single tile at', { x, y, oldValue: layer[y][x], newValue: tileIndex });
                        layer[y][x] = tileIndex;
                        modified = true;
                    } else {
                        // Important: For debugging we'll conditionally force a modification
                        console.log('BrushManager: Tile already has the correct value:', { x, y, value: tileIndex });
                        
                        // Since we're facing rendering issues, force a modification to test
                        if (false && options.forceModification) { // Disable this for now
                            console.log('BrushManager: Forcing tile update for debugging');
                            layer[y][x] = tileIndex;
                            modified = true;
                        }
                    }
                } else {
                    console.warn('BrushManager: Single tile coordinates out of bounds:', { x, y, layerDimensions: { height: layer.length, width: layer[0]?.length } });
                }
            } else {
                // Handle larger brush sizes
                let modifiedCount = 0;
                let unchangedCount = 0;
                let outOfBoundsCount = 0;
                
                for (let ty = area.y; ty < area.y + area.height; ty++) {
                    for (let tx = area.x; tx < area.x + area.width; tx++) {
                        if (ty >= 0 && ty < layer.length && tx >= 0 && tx < layer[0].length) {
                            console.log('BrushManager: Checking tile at', { tx, ty, currentValue: layer[ty][tx], newValue: tileIndex });
                            
                            // Restore normal behavior - only modify if the tile value actually changes
                            if (layer[ty][tx] !== tileIndex) {
                                console.log('BrushManager: Setting tile at', { tx, ty, oldValue: layer[ty][tx], newValue: tileIndex });
                                layer[ty][tx] = tileIndex;
                                modified = true;
                                modifiedCount++;
                            } else {
                                // Important: For debugging we'll conditionally force a modification
                                console.log('BrushManager: Tile already has the correct value:', { tx, ty, value: tileIndex });
                                
                                // Since we're facing rendering issues, force a modification to test
                                if (false && options.forceModification) { // Disable this for now
                                    console.log('BrushManager: Forcing tile update for debugging');
                                    layer[ty][tx] = tileIndex;
                                    modified = true;
                                    modifiedCount++;
                                } else {
                                    unchangedCount++;
                                }
                            }
                        } else {
                            outOfBoundsCount++;
                        }
                    }
                }
                
                console.log('BrushManager: Brush application summary:', { 
                    modifiedCount, 
                    unchangedCount,
                    outOfBoundsCount,
                    totalTiles: area.width * area.height,
                    modified
                });
            }
        }

        console.log('BrushManager: Result:', { modified, modifiedArea });
        return { modified, modifiedArea };
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
            modifiedArea: modified ? targetArea : undefined
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

                if (isInMapBounds(worldX, worldY, { 
                    width: mapData[0].length, 
                    height: mapData.length,
                    layers: 1
                })) {
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
            modifiedArea: modified ? targetArea : undefined
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

    private getPatternKey(brush: Brush, useWorldAlignedRepeat: boolean): string {
        return `${brush.id}_${useWorldAlignedRepeat}`;
    }

    private createPatternCanvas(brush: Brush, getTile: (idx: number) => HTMLCanvasElement | null, tileWidth: number, tileHeight: number): HTMLCanvasElement {
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