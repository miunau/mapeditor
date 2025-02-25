export interface Brush {
    id: string;
    name: string;
    tiles: number[][];  // For a single tile, this would be a 1x1 array
    width: number;
    height: number;
    preview: HTMLCanvasElement | null;
    isBuiltIn: boolean;  // To distinguish tilemap tiles from custom brushes
}

// Options for applying brushes
export interface BrushApplicationOptions {
    isErasing?: boolean;
    useWorldAlignedRepeat?: boolean;
    isCustomBrush?: boolean;  // Whether this is a custom brush that should be repeated based on brush size
    forceModification?: boolean; // Force modification even if the tile value doesn't change (for debugging)
}

// Result of applying a brush
export interface BrushApplicationResult {
    modified: boolean;
    modifiedArea?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
} 