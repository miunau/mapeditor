import type { Point } from './coordinates';

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export type ZoomLevel = number;  // Allow any number for continuous zoom
export type SnapZoomLevel = typeof ZOOM_LEVELS[number];  // Use for toolbar snapping

// Find the closest zoom level in a given direction
export function findClosestZoomLevel(
    currentZoom: number,
    direction: 'up' | 'down'
): SnapZoomLevel {
    // Find the closest zoom level
    let closestLevel: SnapZoomLevel = ZOOM_LEVELS[0];
    let minDiff = Math.abs(currentZoom - closestLevel);
    
    for (const level of ZOOM_LEVELS) {
        const diff = Math.abs(currentZoom - level);
        if (diff < minDiff) {
            minDiff = diff;
            closestLevel = level;
        }
    }
    
    // If we're already very close to a zoom level, move to the next one
    if (Math.abs(currentZoom - closestLevel) < 0.01) {
        const currentIndex = ZOOM_LEVELS.indexOf(closestLevel);
        if (direction === 'up' && currentIndex < ZOOM_LEVELS.length - 1) {
            return ZOOM_LEVELS[currentIndex + 1];
        }
        if (direction === 'down' && currentIndex > 0) {
            return ZOOM_LEVELS[currentIndex - 1];
        }
    }
    
    // Otherwise, move to the closest level in the desired direction
    const currentIndex = ZOOM_LEVELS.indexOf(closestLevel);
    if (direction === 'up' && currentZoom > closestLevel && currentIndex < ZOOM_LEVELS.length - 1) {
        return ZOOM_LEVELS[currentIndex + 1];
    }
    if (direction === 'down' && currentZoom < closestLevel && currentIndex > 0) {
        return ZOOM_LEVELS[currentIndex - 1];
    }
    
    return closestLevel;
}

// Calculate new zoom level and offset to maintain focus point
export function calculateZoomTransform(
    newZoom: number,
    currentZoom: number,
    focusPoint: Point,
    offset: Point
): { zoom: number; offset: Point } {
    // Calculate world position before zoom
    const worldX = (focusPoint.x - offset.x) / currentZoom;
    const worldY = (focusPoint.y - offset.y) / currentZoom;

    // Calculate new offset to keep the focus point fixed
    return {
        zoom: newZoom,
        offset: {
            x: focusPoint.x - worldX * newZoom,
            y: focusPoint.y - worldY * newZoom
        }
    };
}

// Format zoom level as percentage string
export function formatZoomLevel(zoom: number): string {
    return `${Math.round(zoom * 100)}%`;
} 