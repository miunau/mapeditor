import type { MapData, MapMetadata } from './map';

// Pack map data into a binary format
export function packMapData(mapData: MapData): string {
    // Convert numbers to a more compact format
    const packLayers = mapData.map(layer => {
        const packed: number[] = [];
        let currentRun = {
            value: layer[0][0],
            count: 1
        };

        // Flatten the 2D layer and count runs
        for (let y = 0; y < layer.length; y++) {
            for (let x = 0; x < layer[y].length; x++) {
                // Skip the first cell since we already counted it
                if (y === 0 && x === 0) continue;
                
                const value = layer[y][x];
                if (value === currentRun.value && currentRun.count < 255) {
                    currentRun.count++;
                } else {
                    // Store runs as [count, value]
                    packed.push(currentRun.count, currentRun.value);
                    currentRun = { value, count: 1 };
                }
            }
        }
        // Push the last run
        packed.push(currentRun.count, currentRun.value);
        return packed;
    });

    // Convert to binary format
    const headerSize = 4; // 2 bytes each for width and height
    const totalSize = headerSize + packLayers.reduce((sum, layer) => sum + layer.length, 0);
    const buffer = new Int16Array(totalSize);

    // Write header (width and height)
    buffer[0] = mapData[0][0].length;  // width
    buffer[1] = mapData[0].length;     // height

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
export function unpackMapData(base64Data: string): MapData {
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
        const headerSize = 4;

        if (width <= 0 || height <= 0 || width > 1000 || height > 1000) {
            throw new Error('Invalid map dimensions');
        }

        // Read layer data
        const layers: MapData = [];
        let offset = headerSize;

        while (offset < data.length - 1) {  // Need at least 2 more values for a run
            // Start a new layer
            const layer: number[][] = Array(height).fill(null).map(() => Array(width).fill(-1));
            let x = 0, y = 0;
            let cellsInLayer = 0;
            const totalCells = width * height;

            // Read runs until layer is full
            while (cellsInLayer < totalCells && offset < data.length - 1) {
                const count = data[offset++];
                const value = data[offset++];

                if (count <= 0) continue;  // Skip invalid runs

                // Process this run
                for (let i = 0; i < count; i++) {
                    layer[y][x] = value;
                    x++;
                    if (x >= width) {
                        x = 0;
                        y++;
                    }
                    cellsInLayer++;
                }
            }

            layers.push(layer);

            // If we've read all the data, break
            if (offset >= data.length - 1) break;
        }

        return layers;
    } catch (error) {
        console.error('Error unpacking map data:', error);
        // Return a minimal valid map on error
        return [Array(10).fill(null).map(() => Array(10).fill(-1))];
    }
}

// Create map metadata for export
export function createMapMetadata(
    mapData: MapData,
    tilemapSettings: any,
    customBrushes: any[] | undefined,
    useCompression: boolean
): MapMetadata {
    if (useCompression) {
        return {
            version: 1,
            format: 'binary',
            mapData: packMapData(mapData),
            tilemap: tilemapSettings,
            customBrushes
        };
    } else {
        return {
            version: 1,
            format: 'json',
            mapData: {
                width: mapData[0][0].length,
                height: mapData[0].length,
                layers: mapData
            },
            tilemap: tilemapSettings,
            customBrushes
        };
    }
} 