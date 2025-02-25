import type { MapDimensions } from '../types/map';

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Convert screen coordinates to map coordinates
export function screenToMap(
    screenX: number,
    screenY: number,
    offsetX: number,
    offsetY: number,
    zoomLevel: number,
    tileWidth: number,
    tileHeight: number,
    evenBrushSize: boolean = false
): Point {
    // For even-sized brushes, offset by half a tile to center on intersection
    const halfTileX = evenBrushSize ? tileWidth / 2 : 0;
    const halfTileY = evenBrushSize ? tileHeight / 2 : 0;
    
    // Convert screen coordinates to world coordinates
    const worldX = (screenX - offsetX) / zoomLevel;
    const worldY = (screenY - offsetY) / zoomLevel;
    
    // Convert world coordinates to map coordinates (tile indices)
    const mapX = Math.floor((worldX - halfTileX) / tileWidth);
    const mapY = Math.floor((worldY - halfTileY) / tileHeight);
    
    return {
        x: mapX,
        y: mapY
    };
}

// Convert map coordinates to screen coordinates
export function mapToScreen(
    mapX: number,
    mapY: number,
    offsetX: number,
    offsetY: number,
    zoomLevel: number,
    tileWidth: number,
    tileHeight: number
): Point {
    // Convert map coordinates (tile indices) to world coordinates
    const worldX = mapX * tileWidth;
    const worldY = mapY * tileHeight;
    
    // Convert world coordinates to screen coordinates
    const screenX = (worldX * zoomLevel) + offsetX;
    const screenY = (worldY * zoomLevel) + offsetY;
    
    return {
        x: screenX,
        y: screenY
    };
}

// Check if map coordinates are within bounds
export function isInMapBounds(
    x: number,
    y: number,
    dimensions: MapDimensions
): boolean {
    return x >= 0 && x < dimensions.width && y >= 0 && y < dimensions.height;
}

// Get brush area based on brush size and position
export function getBrushArea(
    centerX: number,
    centerY: number,
    brushSize: number,
    brush: { width: number, height: number } | null = null,
    isCustomBrush: boolean = false
): Rect {
    const brushOffsetX = Math.floor((brushSize - 1) / 2);
    const brushOffsetY = Math.floor((brushSize - 1) / 2);
    
    return {
        x: centerX - brushOffsetX,
        y: centerY - brushOffsetY,
        width: isCustomBrush ? brushSize : (brush?.width ?? 1) * brushSize,
        height: isCustomBrush ? brushSize : (brush?.height ?? 1) * brushSize
    };
}

// Calculate target area for brush application
export function calculateBrushTargetArea(
    centerX: number,
    centerY: number,
    brushSize: number,
    brush: { width: number, height: number } | null,
    isCustomBrush: boolean = false
): Rect {
    const brushOffsetX = Math.floor((brushSize - 1) / 2);
    const brushOffsetY = Math.floor((brushSize - 1) / 2);

    return {
        x: centerX - brushOffsetX,
        y: centerY - brushOffsetY,
        width: isCustomBrush ? brushSize : (brush?.width ?? 1) * brushSize,
        height: isCustomBrush ? brushSize : (brush?.height ?? 1) * brushSize
    };
}

// Calculate center position for map
export function calculateMapCenter(
    canvasWidth: number,
    canvasHeight: number,
    mapWidth: number,
    mapHeight: number,
    tileWidth: number,
    tileHeight: number
): Point {
    const mapWidthPx = mapWidth * tileWidth;
    const mapHeightPx = mapHeight * tileHeight;
    
    return {
        x: (canvasWidth - mapWidthPx) / 2,
        y: (canvasHeight - mapHeightPx) / 2
    };
}

// Generate points in an oval using Bresenham's algorithm with fill
export function getEllipsePoints(centerX: number, centerY: number, radiusX: number, radiusY: number): { x: number, y: number }[] {
    // Use a Set to track unique points using string keys
    const pointSet = new Set<string>();
    const points: { x: number, y: number }[] = [];
    
    // Helper to add a point if it hasn't been added before
    const addPoint = (x: number, y: number) => {
        const key = `${x},${y}`;
        if (!pointSet.has(key)) {
            pointSet.add(key);
            points.push({ x, y });
        }
    };
    
    // Helper to add a horizontal line of points
    const addHorizontalLine = (startX: number, endX: number, y: number) => {
        for (let x = startX; x <= endX; x++) {
            addPoint(x, y);
        }
    };

    let x = 0;
    let y = radiusY;
    let d1 = (radiusY * radiusY) - (radiusX * radiusX * radiusY) + (0.25 * radiusX * radiusX);
    let dx = 2 * radiusY * radiusY * x;
    let dy = 2 * radiusX * radiusX * y;

    // First region
    while (dx < dy) {
        // Add horizontal lines for each quadrant
        addHorizontalLine(
            centerX - x, centerX + x,
            centerY + y
        );
        addHorizontalLine(
            centerX - x, centerX + x,
            centerY - y
        );

        x++;
        dx += 2 * radiusY * radiusY;
        d1 += dx + (radiusY * radiusY);

        if (d1 >= 0) {
            y--;
            dy -= 2 * radiusX * radiusX;
            d1 -= dy;
        }
    }

    // Second region
    let d2 = ((radiusY * radiusY) * ((x + 0.5) * (x + 0.5))) +
             ((radiusX * radiusX) * ((y - 1) * (y - 1))) -
             (radiusX * radiusX * radiusY * radiusY);

    while (y >= 0) {
        // Add horizontal lines for each quadrant
        addHorizontalLine(
            centerX - x, centerX + x,
            centerY + y
        );
        addHorizontalLine(
            centerX - x, centerX + x,
            centerY - y
        );

        y--;
        dy -= 2 * radiusX * radiusX;
        d2 -= dy;

        if (d2 <= 0) {
            x++;
            dx += 2 * radiusY * radiusY;
            d2 += dx;   
        }
    }

    return points;
}
