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
    
    const worldX = (screenX - offsetX) / zoomLevel;
    const worldY = (screenY - offsetY) / zoomLevel;
    
    return {
        x: Math.floor((worldX - halfTileX) / tileWidth),
        y: Math.floor((worldY - halfTileY) / tileHeight)
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
    return {
        x: (mapX * tileWidth * zoomLevel) + offsetX,
        y: (mapY * tileHeight * zoomLevel) + offsetY
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
    brushSize: number
): Rect {
    const brushOffsetX = Math.floor((brushSize - 1) / 2);
    const brushOffsetY = Math.floor((brushSize - 1) / 2);
    
    return {
        x: centerX - brushOffsetX,
        y: centerY - brushOffsetY,
        width: brushSize,
        height: brushSize
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