import type { MapData, MapMetadata, MapDimensions } from '$lib/managers/MapDataManager.svelte.js';

// Pack map data into a binary format
export function packMapData(mapData: MapData, dimensions: MapDimensions): string {
    const { width, height, layers } = dimensions;
    
    // Convert flat Int32Array to run-length encoding for compression
    const packLayers: number[][] = [];
    
    // Process each layer
    for (let layer = 0; layer < layers; layer++) {
        const packed: number[] = [];
        const layerOffset = layer * width * height;
        
        // Start with the first value
        let currentRun = {
            value: mapData[layerOffset],
            count: 1
        };
        
        // Process the rest of the layer
        for (let i = 1; i < width * height; i++) {
            const value = mapData[layerOffset + i];
            
            if (value === currentRun.value && currentRun.count < 255) {
                currentRun.count++;
            } else {
                // Store runs as [count, value]
                packed.push(currentRun.count, currentRun.value);
                currentRun = { value, count: 1 };
            }
        }
        
        // Push the last run
        packed.push(currentRun.count, currentRun.value);
        packLayers.push(packed);
    }

    // Convert to binary format
    const headerSize = 6; // 2 bytes each for width, height, and layers
    const totalSize = headerSize + packLayers.reduce((sum, layer) => sum + layer.length, 0);
    const buffer = new Int16Array(totalSize);

    // Write header (width, height, and layers)
    buffer[0] = width;
    buffer[1] = height;
    buffer[2] = layers;

    // Write layer data
    let offset = headerSize;
    packLayers.forEach(layer => {
        layer.forEach(value => {
            buffer[offset++] = value;
        });
    });

    // Convert to base64
    const bytes = new Uint8Array(buffer.buffer);
    return btoa(String.fromCharCode(...bytes));
}

// Unpack binary map data
export function unpackMapData(base64Data: string): { mapData: MapData; dimensions: MapDimensions } {
    try {
        // Convert from base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const data = new Int16Array(bytes.buffer);

        // Read header
        const width = data[0];
        const height = data[1];
        const layers = data[2];
        const headerSize = 6;

        if (width <= 0 || height <= 0 || layers <= 0 || width > 1000 || height > 1000 || layers > 10) {
            throw new Error('Invalid map dimensions');
        }

        // Create the MapData Int32Array
        const totalSize = width * height * layers;
        const mapData = new Int32Array(totalSize);
        mapData.fill(-1); // Initialize with empty tiles
        
        let offset = headerSize;
        
        // Process each layer
        for (let layer = 0; layer < layers; layer++) {
            let index = layer * width * height;
            
            // Read runs until layer is full
            while (index < (layer + 1) * width * height && offset < data.length - 1) {
                const count = data[offset++];
                const value = data[offset++];

                if (count <= 0) continue;  // Skip invalid runs

                // Process this run
                for (let i = 0; i < count && index < (layer + 1) * width * height; i++) {
                    mapData[index++] = value;
                }
            }
        }

        return {
            mapData,
            dimensions: { width, height, layers }
        };
    } catch (error) {
        console.error('Error unpacking map data:', error);
        // Return a minimal valid map on error
        const width = 10;
        const height = 10;
        const layers = 1;
        const mapData = new Int32Array(width * height * layers);
        mapData.fill(-1);
        
        return {
            mapData,
            dimensions: { width, height, layers }
        };
    }
}

// Create map metadata for export
export function createMapMetadata(
    mapData: MapData,
    dimensions: MapDimensions,
    tilemapSettings: any,
    customBrushes: any[] | undefined,
): MapMetadata {
    return {
        version: 1,
        mapData: packMapData(mapData, dimensions),
        tilemap: tilemapSettings,
        customBrushes
    };
} 