import type { Brush } from '$lib/types/drawing';
import type { TilemapSettings } from '$lib/utils/settings';
import type { Tilemap } from '../utils/tilemap';

/**
 * Represents the complete map data as an Int32Array, which is a flat array of tile indices.
 * - The array is a flat representation of a 2D grid, with indices calculated as (y * width + x).
 * - A value of -1 typically indicates an empty/transparent tile.
 */
export type MapData = Int32Array;

/**
 * Describes the dimensions of a map.
 */
export interface MapDimensions {
    /** Width of the map in tiles */
    width: number;
    /** Height of the map in tiles */
    height: number;
    /** Number of layers in the map */
    layers: number;
}

/**
 * Possible alignment options when resizing a map.
 * Determines how the existing map content is positioned within the new dimensions.
 */
export const ALIGNMENTS = ['top-left', 'top-center', 'top-right',
                   'middle-left', 'middle-center', 'middle-right',
                   'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type ResizeAlignment = typeof ALIGNMENTS[number];

/**
 * Uncompressed map data structure with dimensions and layer data.
 */
export interface UncompressedMapData {
    /** Width of the map in tiles */
    width: number;
    /** Height of the map in tiles */
    height: number;
    /** Array of layer data */
    layers: MapData;
}

/**
 * Complete metadata for a map, including the map data and tileset information.
 */
export interface MapMetadata {
    /** Version number of the map format */
    version: number;
    /** The actual map data, either as an object or as a binary string */
    mapData: UncompressedMapData | string; // string for binary format
    /** Settings for the tileset used by this map */
    tilemap: TilemapSettings;
    /** Optional array of custom brushes saved with this map */
    customBrushes?: Brush[];
}


export class MapDataManager {
    // The shared buffer that contains all map data
    private sharedBuffer: SharedArrayBuffer;
    
    // View into the shared buffer
    private dataView: Int32Array;
    
    // Update flags for synchronization
    private updateFlags: SharedArrayBuffer;
    private updateFlagsView: Int32Array;
    
    // Map dimensions
    private width: number;
    private height: number;
    private layers: number;
    private tileWidth: number;
    private tileHeight: number;
    
    /**
     * Create a new SharedMapData instance
     * @param width Map width in tiles
     * @param height Map height in tiles
     * @param layers Number of layers
     * @param initialData Optional initial map data
     * @param tileWidth Tile width in pixels
     * @param tileHeight Tile height in pixels
     */
    constructor(width: number, height: number, layers: number, tilemap: Tilemap) {
        this.width = width;
        this.height = height;
        this.layers = layers;
        this.tileWidth = tilemap.tileWidth;
        this.tileHeight = tilemap.tileHeight;
        
        // Calculate total size needed for the tile buffer
        const totalSize = width * height * layers;
        
        console.log('SharedMapData: Creating buffers with dimensions:', {
            width,
            height,
            layers,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            totalSize,
        });
        
        // Create the shared tile buffer
        this.sharedBuffer = new SharedArrayBuffer(totalSize * Int32Array.BYTES_PER_ELEMENT);
        
        // Create a view into the buffer
        this.dataView = new Int32Array(this.sharedBuffer);
        
        // Initialize with empty data (-1 represents empty tiles)
        this.dataView.fill(-1);
        
        // Create update flags buffer (one flag per layer)
        this.updateFlags = new SharedArrayBuffer(layers * Int32Array.BYTES_PER_ELEMENT);
        this.updateFlagsView = new Int32Array(this.updateFlags);
        this.updateFlagsView.fill(0);
        
    }

    createEmptyMapData(): Int32Array {
        return new Int32Array(this.width * this.height * this.layers);
    }
    
    // Get the tile buffer
    getBuffer(): SharedArrayBuffer {
        return this.sharedBuffer;
    }
    
    // Get the update flags buffer
    getUpdateFlagsBuffer(): SharedArrayBuffer {
        return this.updateFlags;
    }
    
    // Mark a layer as needing update
    markLayerForUpdate(layer: number) {
        if (layer < 0 || layer >= this.layers) {
            console.error(`SharedMapData: Invalid layer index ${layer}`);
            return;
        }
        this.updateFlagsView[layer] = 1;
    }
    
    // Mark all layers as needing update
    markAllLayersForUpdate() {
        for (let i = 0; i < this.layers; i++) {
            this.updateFlagsView[i] = 1;
        }
    }
    
    // Convert 3D coordinates to flat index in the shared buffer
    private getFlatIndex(layer: number, y: number, x: number): number {
        return (layer * this.height * this.width) + (y * this.width) + x;
    }
    
    // Get a tile value from the shared buffer
    getTile(layer: number, y: number, x: number): number {
        if (layer < 0 || layer >= this.layers || y < 0 || y >= this.height || x < 0 || x >= this.width) {
            return -1;
        }
        
        const index = this.getFlatIndex(layer, y, x);
        return this.dataView[index];
    }
    
    // Set a tile value in the shared buffer
    setTile(layer: number, y: number, x: number, value: number) {
        if (layer < 0 || layer >= this.layers || y < 0 || y >= this.height || x < 0 || x >= this.width) {
            console.error(`SharedMapData: Invalid coordinates: layer=${layer}, y=${y}, x=${x}`);
            return;
        }
        
        const index = this.getFlatIndex(layer, y, x);
        const oldValue = this.dataView[index];
        this.dataView[index] = value;
        
        console.log('SharedMapData: Set tile', {
            layer,
            y,
            x,
            oldValue,
            newValue: value,
            index
        });
        
        // Mark the layer as needing update
        this.updateFlagsView[layer] = 1;
    }
    
    // Update a region of tiles
    updateRegion(layer: number, x: number, y: number, tiles: number[][]) {
        if (layer < 0 || layer >= this.layers) {
            console.error(`SharedMapData: Invalid layer index ${layer}`);
            return;
        }
        
        const height = tiles.length;
        const width = height > 0 ? tiles[0].length : 0;
        
        console.log('SharedMapData: Updating region', {
            layer,
            startX: x,
            startY: y,
            width,
            height,
            mapWidth: this.width,
            mapHeight: this.height,
            tilesData: `${height}x${width} array`
        });
        
        // Check if region is completely outside map bounds
        if (x >= this.width || y >= this.height || x + width <= 0 || y + height <= 0) {
            console.error(`SharedMapData: Region is completely outside map bounds`);
            return;
        }
        
        let updatedTiles = 0;
        
        for (let ty = 0; ty < height; ty++) {
            for (let tx = 0; tx < width; tx++) {
                const worldY = y + ty;
                const worldX = x + tx;
                
                if (worldY >= 0 && worldY < this.height && worldX >= 0 && worldX < this.width) {
                    const index = this.getFlatIndex(layer, worldY, worldX);
                    const oldValue = this.dataView[index];
                    const newValue = tiles[ty][tx];
                    this.dataView[index] = newValue;
                    
                    if (oldValue !== newValue) {
                        updatedTiles++;
                    }
                } else {
                    console.warn(`SharedMapData: Tile coordinates out of bounds: worldX=${worldX}, worldY=${worldY}, mapWidth=${this.width}, mapHeight=${this.height}`);
                }
            }
        }
        
        console.log(`SharedMapData: Updated ${updatedTiles} tiles in region`);
        
        // Mark the layer as needing update
        this.updateFlagsView[layer] = 1;
    }
    
    // Get the dimensions of the map
    getDimensions(): MapDimensions {
        return {
            width: this.width,
            height: this.height,
            layers: this.layers
        };
    }
    
    // Convert the shared buffer to a regular MapData array
    cloneMapData(): MapData {
        const mapData = new Int32Array(this.width * this.height * this.layers);
        // Copy the dataView to the new mapData
        mapData.set(this.dataView);
        return mapData;
    }
} 