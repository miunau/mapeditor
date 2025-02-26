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
    /** Whether the brush is using world-aligned repeat */
    worldAligned: boolean;
}

/**
 * Represents a 2D point with x and y coordinates.
 * Used for positioning elements on the canvas.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Represents a rectangle with position and dimensions.
 * Used for defining areas on the canvas.
 */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const TOOL_TYPES = {
    BRUSH: 'brush',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'ellipse',
    FILL: 'fill',
    LINE: 'line',
    CUSTOM: 'custom'
} as const;
export type ToolType = typeof TOOL_TYPES[keyof typeof TOOL_TYPES];

/**
 * Unified interface for all drawing operations.
 * Provides a consistent structure for different drawing tools.
 */
export interface DrawOperation {
    /** The type of drawing operation being performed */
    type: ToolType;
    /** The layer index where the operation is applied */
    layer: number;
    /** Starting X coordinate of the operation */
    startX: number;
    /** Starting Y coordinate of the operation */
    startY: number;
    /** Ending X coordinate (optional for some operations) */
    endX?: number;
    /** Ending Y coordinate (optional for some operations) */
    endY?: number;
    /** Index of the tile to be placed */
    tileIndex: number;
    /** Whether this operation is erasing rather than drawing */
    isErasing: boolean;
    /** Size of the brush in tiles (for brush operations) */
    brushSize?: number;
    /** Additional data for custom operations or future extensions */
    customData?: any;
}

/**
 * Defines the source coordinates for brush pattern calculations.
 * Used when applying brush patterns from a tileset.
 */
export interface BrushPatternSource {
    /** Source X coordinate in the tileset */
    sourceX: number;
    /** Source Y coordinate in the tileset */
    sourceY: number;
}

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

// Create a preview canvas for a brush
export function createBrushPreview(
    brush: Omit<CustomBrush, 'preview' | 'id'>,
    getTile: (index: number) => HTMLCanvasElement | null,
    tileWidth: number,
    tileHeight: number
): HTMLCanvasElement {
    const preview = document.createElement('canvas');
    preview.width = brush.width * tileWidth;
    preview.height = brush.height * tileHeight;
    const ctx = preview.getContext('2d');
    
    if (ctx) {
        ctx.imageSmoothingEnabled = false;
        // Draw each tile in the brush
        for (let y = 0; y < brush.height; y++) {
            for (let x = 0; x < brush.width; x++) {
                const tileIndex = brush.tiles[y][x];
                if (tileIndex === -1) continue;
                
                const tile = getTile(tileIndex);
                if (tile) {
                    ctx.drawImage(
                        tile,
                        x * tileWidth,
                        y * tileHeight
                    );
                }
            }
        }
    }

    return preview;
}

// Calculate brush pattern coordinates for 9-slice scaling
export function calculateBrushPattern(
    targetArea: Rect,
    brushDimensions: { width: number; height: number },
    useWorldAlignedRepeat: boolean
): { sourceX: number; sourceY: number; }[][] {
    const { width: brushWidth, height: brushHeight } = brushDimensions;
    const { width: targetWidth, height: targetHeight } = targetArea;

    // Calculate region sizes for 9-slice scaling
    const leftWidth = Math.min(brushWidth, 1);
    const rightWidth = Math.min(brushWidth - leftWidth, 1);
    const centerWidth = Math.max(1, brushWidth - leftWidth - rightWidth);

    const topHeight = Math.min(brushHeight, 1);
    const bottomHeight = Math.min(brushHeight - topHeight, 1);
    const centerHeight = Math.max(1, brushHeight - topHeight - bottomHeight);

    // Calculate repeat origin based on world position or brush position
    const repeatOriginX = useWorldAlignedRepeat ? 
        ((targetArea.x % centerWidth) + centerWidth) % centerWidth :
        0;
    const repeatOriginY = useWorldAlignedRepeat ? 
        ((targetArea.y % centerHeight) + centerHeight) % centerHeight :
        0;

    const pattern: { sourceX: number; sourceY: number; }[][] = [];

    // Calculate source coordinates for each target position
    for (let ty = 0; ty < targetHeight; ty++) {
        pattern[ty] = [];
        for (let tx = 0; tx < targetWidth; tx++) {
            let sourceX: number;
            let sourceY: number;

            // Map x position to source region
            if (tx < leftWidth) {
                // Left region
                sourceX = tx;
            } else if (tx >= targetWidth - rightWidth) {
                // Right region
                sourceX = brushWidth - (targetWidth - tx);
            } else {
                // Center region - tile the middle section with offset
                const centerX = tx - leftWidth;
                sourceX = leftWidth + ((centerX + repeatOriginX) % centerWidth);
            }

            // Map y position to source region
            if (ty < topHeight) {
                // Top region
                sourceY = ty;
            } else if (ty >= targetHeight - bottomHeight) {
                // Bottom region
                sourceY = brushHeight - (targetHeight - ty);
            } else {
                // Center region - tile the middle section with offset
                const centerY = ty - topHeight;
                sourceY = topHeight + ((centerY + repeatOriginY) % centerHeight);
            }

            // Ensure we stay within brush dimensions
            sourceX = Math.min(Math.max(0, sourceX), brushWidth - 1);
            sourceY = Math.min(Math.max(0, sourceY), brushHeight - 1);

            pattern[ty][tx] = { sourceX, sourceY };
        }
    }

    return pattern;
}
