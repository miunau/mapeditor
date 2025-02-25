import type { CustomBrush } from '../types/map';
import type { Point, Rect } from './coordinates';

// Generate a unique ID for a brush
export function generateBrushId(): string {
    return `brush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

// Create an empty brush pattern
export function createEmptyBrushPattern(width: number, height: number): number[][] {
    return Array(height).fill(null).map(() => Array(width).fill(-1));
}

// Draw a single tile preview with border
export function drawSingleTilePreview(
    ctx: CanvasRenderingContext2D,
    tile: HTMLCanvasElement,
    x: number,
    y: number,
    tileWidth: number,
    tileHeight: number,
    zoomLevel: number,
    alpha: number = 0.5
) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(tile, x, y);
    ctx.globalAlpha = 1.0;

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2 / zoomLevel;
    ctx.strokeRect(x, y, tileWidth, tileHeight);
}

// Draw a flood fill preview
export function drawFloodFillPreview(
    ctx: CanvasRenderingContext2D,
    points: { x: number, y: number }[],
    tileWidth: number,
    tileHeight: number,
    zoomLevel: number,
    mapToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number, tileW: number, tileH: number) => Point
) {
    if (points.length === 0) return;

    // Find the bounding box of all points
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    // Create a temporary canvas for the fill area
    const width = (maxX - minX + 1) * tileWidth;
    const height = (maxY - minY + 1) * tileHeight;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // Create a path for all points at once
    tempCtx.beginPath();
    for (const point of points) {
        const x = (point.x - minX) * tileWidth;
        const y = (point.y - minY) * tileHeight;
        tempCtx.rect(x, y, tileWidth, tileHeight);
    }

    // Fill all rectangles in one operation
    tempCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    tempCtx.fill();

    // Draw borders in one operation
    tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    tempCtx.lineWidth = 2 / zoomLevel;
    tempCtx.stroke();

    // Draw the temporary canvas to the main canvas in one operation
    const screenPos = mapToScreen(minX, minY, 0, 0, 1, tileWidth, tileHeight);
    ctx.drawImage(tempCanvas, screenPos.x, screenPos.y);
}

// Draw a rectangle preview with optional custom brush pattern
export function drawRectanglePreview(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    width: number,
    height: number,
    tileWidth: number,
    tileHeight: number,
    zoomLevel: number,
    mapToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number, tileW: number, tileH: number) => Point,
    options?: {
        fillStyle?: string;
        strokeStyle?: string;
        alpha?: number;
    }
) {
    const startPos = mapToScreen(startX, startY, 0, 0, 1, tileWidth, tileHeight);
    
    // Draw semi-transparent fill
    if (options?.fillStyle) {
        ctx.fillStyle = options.fillStyle;
        ctx.fillRect(
            startPos.x,
            startPos.y,
            width * tileWidth,
            height * tileHeight
        );
    }

    // Draw border
    ctx.strokeStyle = options?.strokeStyle || 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2 / zoomLevel;
    ctx.strokeRect(
        startPos.x,
        startPos.y,
        width * tileWidth,
        height * tileHeight
    );
}

// Draw a custom brush preview
export function drawCustomBrushPreview(
    ctx: CanvasRenderingContext2D,
    brush: CustomBrush,
    targetArea: Rect,
    getTile: (index: number) => HTMLCanvasElement | null,
    tileWidth: number,
    tileHeight: number,
    zoomLevel: number,
    mapToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number, tileW: number, tileH: number) => Point,
    useWorldAlignedRepeat: boolean,
    isInMapBounds: (x: number, y: number, dimensions: { width: number, height: number }) => boolean,
    mapDimensions: { width: number, height: number },
    filledPoints?: { x: number, y: number }[]
) {
    // If we have filled points, calculate the bounding box
    if (filledPoints && filledPoints.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const point of filledPoints) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        targetArea = {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    const pattern = calculateBrushPattern(
        targetArea,
        { width: brush.width, height: brush.height },
        useWorldAlignedRepeat
    );

    ctx.globalAlpha = 0.5;

    // If we have filled points, only draw at those positions
    if (filledPoints) {
        for (const point of filledPoints) {
            if (isInMapBounds(point.x, point.y, mapDimensions)) {
                const relX = point.x - targetArea.x;
                const relY = point.y - targetArea.y;
                const { sourceX, sourceY } = pattern[relY][relX];
                const tileIndex = brush.tiles[sourceY][sourceX];
                if (tileIndex !== -1) {
                    const tile = getTile(tileIndex);
                    if (tile) {
                        const screenPos = mapToScreen(
                            point.x,
                            point.y,
                            0,
                            0,
                            1,
                            tileWidth,
                            tileHeight
                        );
                        ctx.drawImage(tile, screenPos.x, screenPos.y);
                    }
                }
            }
        }
    } else {
        // Regular brush preview - draw all tiles in the target area
        for (let ty = 0; ty < targetArea.height; ty++) {
            for (let tx = 0; tx < targetArea.width; tx++) {
                const worldX = targetArea.x + tx;
                const worldY = targetArea.y + ty;

                if (isInMapBounds(worldX, worldY, mapDimensions)) {
                    const { sourceX, sourceY } = pattern[ty][tx];
                    const tileIndex = brush.tiles[sourceY][sourceX];
                    if (tileIndex !== -1) {
                        const tile = getTile(tileIndex);
                        if (tile) {
                            const screenPos = mapToScreen(
                                worldX,
                                worldY,
                                0,
                                0,
                                1,
                                tileWidth,
                                tileHeight
                            );
                            ctx.drawImage(tile, screenPos.x, screenPos.y);
                        }
                    }
                }
            }
        }
    }

    ctx.globalAlpha = 1.0;

    // Draw border around the entire brush area
    drawRectanglePreview(
        ctx,
        targetArea.x,
        targetArea.y,
        targetArea.width,
        targetArea.height,
        tileWidth,
        tileHeight,
        zoomLevel,
        mapToScreen
    );
} 