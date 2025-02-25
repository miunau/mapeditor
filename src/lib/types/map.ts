export type LayerData = number[][];
export type MapData = number[][][];

export interface MapDimensions {
    width: number;
    height: number;
    layers: number;
}

export interface TilemapSettings {
    url: string;
    tileWidth: number;
    tileHeight: number;
    spacing: number;
}

// Alignment options for resizing
export const ALIGNMENTS = ['top-left', 'top-center', 'top-right',
                   'middle-left', 'middle-center', 'middle-right',
                   'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type ResizeAlignment = typeof ALIGNMENTS[number];

export interface UncompressedMapData {
    width: number;
    height: number;
    layers: MapData;
}

export interface MapMetadata {
    version: number;
    format: 'json' | 'binary';
    mapData: UncompressedMapData | string; // string for binary format
    tilemap: TilemapSettings;
    customBrushes?: CustomBrush[];
}

export interface CustomBrush {
    id: string;
    name: string | null;
    tiles: number[][];
    width: number;
    height: number;
    preview: HTMLCanvasElement | null;
}

// Create an empty map with given dimensions
export function createEmptyMap(width: number, height: number, layers: number): MapData {
    return Array(layers).fill(null)
        .map(() => Array(height).fill(null)
            .map(() => Array(width).fill(-1)));
}

// Fast clone using TypedArrays for better performance
export function cloneMapData(mapData: MapData): MapData {
    const layers = mapData.length;
    const height = mapData[0].length;
    const width = mapData[0][0].length;
    const totalSize = width * height;
    
    return mapData.map(layer => {
        const flatArray = new Int32Array(totalSize);
        layer.forEach((row, y) => {
            flatArray.set(row, y * width);
        });
        const clonedArray = new Int32Array(flatArray);
        return Array(height).fill(null)
            .map((_, y) => Array.from(clonedArray.subarray(y * width, (y + 1) * width)));
    });
}

// Validate map dimensions
export function validateMapDimensions(width: number, height: number): boolean {
    return width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height);
}

// Get map dimensions from map data
export function getMapDimensions(mapData: MapData): MapDimensions {
    if (!mapData.length || !mapData[0].length) {
        throw new Error('Invalid map data');
    }
    return {
        width: mapData[0][0].length,
        height: mapData[0].length,
        layers: mapData.length
    };
} 