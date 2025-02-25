/**
 * SharedMapData.ts - Manages map data using SharedArrayBuffer for efficient worker communication
 */

import type { MapData, MapDimensions } from './utils/map';

export class SharedMapData {
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
    constructor(width: number, height: number, layers: number, initialData?: MapData, tileWidth: number = 16, tileHeight: number = 16) {
        this.width = width;
        this.height = height;
        this.layers = layers;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        
        // Calculate total size needed for the tile buffer
        const totalSize = width * height * layers;
        
        console.log('SharedMapData: Creating buffers with dimensions:', {
            width,
            height,
            layers,
            tileWidth,
            tileHeight,
            totalSize,
            hasInitialData: !!initialData
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
        
        // If initial data is provided, copy it to the buffer
        if (initialData) {
            this.initializeFromMapData(initialData);
        }
    }
    
    // Initialize from map data
    private initializeFromMapData(mapData: MapData) {
        // Validate dimensions
        if (mapData.length !== this.layers) {
            console.warn(`SharedMapData: Initial data has ${mapData.length} layers, but buffer has ${this.layers} layers`);
        }
        
        const layerCount = Math.min(mapData.length, this.layers);
        
        for (let layer = 0; layer < layerCount; layer++) {
            if (mapData[layer].length !== this.height) {
                console.warn(`SharedMapData: Layer ${layer} has ${mapData[layer].length} rows, but buffer has ${this.height} rows`);
                continue;
            }
            
            for (let y = 0; y < this.height; y++) {
                if (mapData[layer][y].length !== this.width) {
                    console.warn(`SharedMapData: Layer ${layer}, row ${y} has ${mapData[layer][y].length} columns, but buffer has ${this.width} columns`);
                    continue;
                }
                
                for (let x = 0; x < this.width; x++) {
                    const index = this.getFlatIndex(layer, y, x);
                    this.dataView[index] = mapData[layer][y][x];
                }
            }
        }
        
        // Mark all layers as needing update
        for (let i = 0; i < this.layers; i++) {
            this.updateFlagsView[i] = 1;
        }
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
    toMapData(): MapData {
        const mapData: MapData = [];
        
        for (let layer = 0; layer < this.layers; layer++) {
            const layerData: number[][] = [];
            
            for (let y = 0; y < this.height; y++) {
                const row: number[] = [];
                
                for (let x = 0; x < this.width; x++) {
                    const index = this.getFlatIndex(layer, y, x);
                    row.push(this.dataView[index]);
                }
                
                layerData.push(row);
            }
            
            mapData.push(layerData);
        }
        
        return mapData;
    }
} 