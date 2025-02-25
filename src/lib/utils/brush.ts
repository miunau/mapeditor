import type { CustomBrush } from './map';
import type { Point, Rect } from './coordinates';

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
