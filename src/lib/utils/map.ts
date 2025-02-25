/**
 * Represents a single layer in a tilemap as a 2D array of tile indices.
 * Each number corresponds to a tile in the tileset (-1 typically means empty).
 * Format: [row][column]
 */
export type LayerData = number[][];

/**
 * Represents the complete map data as a 3D array of tile indices.
 * Format: [layer][row][column]
 * - First dimension: Layers (z-index, from bottom to top)
 * - Second dimension: Rows (y-axis, from top to bottom)
 * - Third dimension: Columns (x-axis, from left to right)
 * 
 * A value of -1 typically indicates an empty/transparent tile.
 */
export type MapData = number[][][];

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
 * Configuration for the tilemap/tileset used by the map.
 */
export interface TilemapSettings {
    /** URL to the tileset image */
    url: string;
    /** Width of each tile in pixels */
    tileWidth: number;
    /** Height of each tile in pixels */
    tileHeight: number;
    /** Spacing between tiles in the tileset image (in pixels) */
    spacing: number;
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
    /** Format of the stored map data */
    format: 'json' | 'binary';
    /** The actual map data, either as an object or as a binary string */
    mapData: UncompressedMapData | string; // string for binary format
    /** Settings for the tileset used by this map */
    tilemap: TilemapSettings;
    /** Optional array of custom brushes saved with this map */
    customBrushes?: CustomBrush[];
}

/**
 * Represents a custom multi-tile brush that can be saved and reused.
 */
export interface CustomBrush {
    /** Unique identifier for the brush */
    id: string;
    /** Optional user-defined name for the brush */
    name: string | null;
    /** 2D array of tile indices that make up the brush pattern */
    tiles: number[][];
    /** Width of the brush in tiles */
    width: number;
    /** Height of the brush in tiles */
    height: number;
    /** Cached preview image of the brush */
    preview: HTMLCanvasElement | null;
}

/**
 * Creates an empty map with the specified dimensions.
 * All tiles are initialized with value -1 (empty).
 * 
 * @param width - Width of the map in tiles
 * @param height - Height of the map in tiles
 * @param layers - Number of layers in the map
 * @returns A new MapData structure with the specified dimensions
 */
export function createEmptyMap(width: number, height: number, layers: number): MapData {
    return Array(layers).fill(null)
        .map(() => Array(height).fill(null)
            .map(() => Array(width).fill(-1)));
}

/**
 * Creates a deep copy of the provided map data.
 * Uses TypedArrays for better performance when dealing with large maps.
 * 
 * @param mapData - The source map data to clone
 * @returns A new MapData structure with the same content as the input
 */
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

/**
 * Validates that the provided map dimensions are positive integers.
 * 
 * @param width - Width to validate
 * @param height - Height to validate
 * @returns True if dimensions are valid, false otherwise
 */
export function validateMapDimensions(width: number, height: number): boolean {
    return width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height);
}

/**
 * Extracts the dimensions from a MapData structure.
 * 
 * @param mapData - The map data to analyze
 * @returns An object containing the width, height, and number of layers
 * @throws Error if the map data is invalid or empty
 */
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