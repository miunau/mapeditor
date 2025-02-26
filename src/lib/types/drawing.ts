/**
 * Represents a custom multi-tile brush that can be saved and reused.
 */
export type Brush = {
    /** Unique identifier for the brush */
    id: string;
    type: 'custom' | 'tile';
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
export type Point = {
    x: number;
    y: number;
}

/**
 * Represents a rectangle with position and dimensions.
 * Used for defining areas on the canvas.
 */
export type Rect = {
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
    LINE: 'line'
} as const;

export type ToolType = typeof TOOL_TYPES[keyof typeof TOOL_TYPES];

export type DrawOperationType = 'start' | 'continue' | 'end';

/**
 * Unified type for all drawing operations.
 */
export type DrawOperation = {
    type: DrawOperationType;
    /** The type of drawing operation being performed */
    tool: ToolType;
    /** The brush being used for the operation */
    brush: Omit<Brush, 'preview'>;
    /** The layer index where the operation is applied */
    layer: number;
    /** Starting X coordinate of the operation */
    x: number;
    /** Starting Y coordinate of the operation */
    y: number;
    /** Whether this operation is erasing rather than drawing */
    isErasing: boolean;
    /** Size of the brush in tiles (for brush operations) */
    brushSize: number;
}
