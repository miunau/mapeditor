export type LayerData = number[][];
export type MapData = LayerData[];

export interface MapDimensions {
    width: number;
    height: number;
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
    return Array(layers).fill(0).map(() => 
        Array(height).fill(0).map(() => Array(width).fill(-1))
    );
}

// Deep clone map data
export function cloneMapData(mapData: MapData): MapData {
    return mapData.map(layer => layer.map(row => [...row]));
}

// Validate map dimensions
export function validateMapDimensions(width: number, height: number): boolean {
    return width > 0 && height > 0 && width <= 1000 && height <= 1000;
}

// Get map dimensions from map data
export function getMapDimensions(mapData: MapData): MapDimensions {
    if (!mapData.length || !mapData[0].length) {
        throw new Error('Invalid map data');
    }
    return {
        width: mapData[0][0].length,
        height: mapData[0].length
    };
} 