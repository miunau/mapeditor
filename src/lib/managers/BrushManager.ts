import type { Brush } from '../utils/drawing';
import type { Tilemap } from '../utils/tilemap';
import { createBrushPreview as createBrushPreviewUtil } from '../utils/drawing';
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
                    name: `Tile ${tileIndex}`,
                    worldAligned: true
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
                    name: name || `${tiles[0].length}x${tiles.length} Brush`,
                    worldAligned: true
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
                    name: name || brush.name,
                    worldAligned: true
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

} 