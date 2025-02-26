import type { Point } from './drawing';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.125;

// Generate zoom levels
export const ZOOM_LEVELS = Array.from(
    { length: Math.floor((MAX_ZOOM - MIN_ZOOM) / ZOOM_STEP) + 1 }, 
    (_, i) => MIN_ZOOM + i * ZOOM_STEP
) as readonly number[];

export type ZoomLevel = number;  // Allow any number for continuous zoom
export type SnapZoomLevel = typeof ZOOM_LEVELS[number];

// Find the closest zoom level in a given direction
export function findClosestZoomLevel(
    currentZoom: number,
    direction: 'up' | 'down',
    mode: 'fine' | 'coarse' = 'fine'
): SnapZoomLevel {
    // For coarse mode, only use levels that are either whole numbers or half numbers
    const levels = mode === 'coarse' 
        ? ZOOM_LEVELS.filter(z => Math.round(z * 2) === z * 2) // Keep only .0 and .5 values
        : ZOOM_LEVELS;
    
    // Find the closest zoom level
    let closestLevel = levels[0];
    let minDiff = Math.abs(currentZoom - closestLevel);
    
    for (const level of levels) {
        const diff = Math.abs(currentZoom - level);
        if (diff < minDiff) {
            minDiff = diff;
            closestLevel = level;
        }
    }
    
    // If we're already very close to a zoom level, move to the next one
    if (Math.abs(currentZoom - closestLevel) < 0.01) {
        const currentIndex = levels.indexOf(closestLevel);
        if (direction === 'up' && currentIndex < levels.length - 1) {
            return levels[currentIndex + 1];
        }
        if (direction === 'down' && currentIndex > 0) {
            return levels[currentIndex - 1];
        }
    }
    
    // Otherwise, move to the closest level in the desired direction
    const currentIndex = levels.indexOf(closestLevel);
    if (direction === 'up' && currentZoom > closestLevel && currentIndex < levels.length - 1) {
        return levels[currentIndex + 1];
    }
    if (direction === 'down' && currentZoom < closestLevel && currentIndex > 0) {
        return levels[currentIndex - 1];
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
    return {
        zoom: newZoom,
        offset: {
            x: focusPoint.x - (focusPoint.x - offset.x) * (newZoom / currentZoom),
            y: focusPoint.y - (focusPoint.y - offset.y) * (newZoom / currentZoom)
        }
    };
}

// Format zoom level as percentage string
export function formatZoomLevel(zoom: number): string {
    return `${Math.round(zoom * 100)}%`;
} 