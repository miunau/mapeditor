/**
 * @file drawing.ts
 * @description Defines interfaces and utility functions for drawing operations in the map editor.
 * This file provides the core types and algorithms used for various drawing tools.
 */

/**
 * Unified interface for all drawing operations.
 * Provides a consistent structure for different drawing tools.
 */
export interface DrawOperation {
    /** The type of drawing operation being performed */
    type: 'brush' | 'rectangle' | 'ellipse' | 'fill' | 'line' | 'custom';
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
