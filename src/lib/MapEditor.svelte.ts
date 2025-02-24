import { Tilemap } from './tilemap';
import { BrushManager } from './managers/BrushManager';
import { PaletteManager } from './managers/PaletteManager';
import type { Brush } from './types/brush';
import { floodFill } from './floodfill';
import type { MapData, MapDimensions, CustomBrush } from './types/map';
import { createEmptyMap, cloneMapData, validateMapDimensions } from './types/map';
import type { Point, Rect } from './utils/coordinates';
import { screenToMap, mapToScreen, isInMapBounds, getBrushArea, calculateMapCenter, getEllipsePoints } from './utils/coordinates';
import { 
    generateBrushId, 
    createBrushPreview, 
    calculateBrushPattern,
    drawFloodFillPreview,
    drawCustomBrushPreview,
    drawRectanglePreview,
    drawSingleTilePreview,
    createBrushPreview as createBrushPreviewUtil
} from './utils/brush';
import { 
    findClosestZoomLevel, 
    calculateZoomTransform, 
    type ZoomLevel,
    type SnapZoomLevel,
    ZOOM_LEVELS 
} from './utils/zoom';
import { createMapMetadata, unpackMapData } from './utils/serialization';
import type { ResizeAlignment } from './types/map';

import { toolFSM } from './state/ToolState.svelte';
import { layerFSM } from './state/LayerState.svelte';
import { editorStore } from './state/EditorStore.svelte';

// The singleton editor instance
let editor: ReactiveMapEditor | undefined = $state();

// The editor class that integrates with FSMs
export class ReactiveMapEditor {
    // Canvas and rendering context
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    // Map data
    mapData: MapData;
    tilemap: Tilemap;
    brushManager: BrushManager | null = null;
    paletteManager: PaletteManager | null = null;

    // Constants
    readonly MAX_LAYERS = 10;
    readonly minZoom = ZOOM_LEVELS[0];
    readonly maxZoom = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

    // For panning
    isPanning = $state(false);
    lastPanX = $state(0);
    lastPanY = $state(0);
    panVelocityX = $state(0);
    panVelocityY = $state(0);
    isKeyPanning = $state(false);
    keyPanState = $state({
        left: false,
        right: false,
        up: false,
        down: false
    });

    // For first-time help message
    hasShownHelpMessage = $state(false);

    // For painting
    isPainting = $state(false);
    paintTile = $state<number | null>(null);
    hasModifiedDuringPaint = $state(false);
    rectangleStartX = $state<number | null>(null);
    rectangleStartY = $state<number | null>(null);
    isDrawingRectangle = $state(false);

    // For brush preview
    hoverX = $state(-1);
    hoverY = $state(-1);

    // For number selection
    private numberBuffer = '';
    private numberTimeout: number | null = null;

    // For undo/redo
    private undoBuffer: MapData | null = null;
    undoStack = $state<MapData[]>([]);
    redoStack = $state<MapData[]>([]);
    maxUndoSteps = 50;

    // For custom brushes
    isCustomBrushMode = $state(false);
    useWorldAlignedRepeat = $state(false);

    // For tile selection
    isSelectingTiles = $state(false);
    selectionStartX = $state<number | null>(null);
    selectionStartY = $state<number | null>(null);
    selectionEndX = $state<number | null>(null);
    selectionEndY = $state<number | null>(null);

    // For tilemap settings
    private tilemapUrl = $state('/tilemap.png');
    private tileWidth = $state(16);
    private tileHeight = $state(16);
    private tileSpacing = $state(1);

    // View state
    showGrid = $state(true);
    zoomLevel = $state<ZoomLevel>(1);
    offsetX = $state(0);
    offsetY = $state(0);

    // Performance metrics
    fps = $state(0);
    private lastFrameTime = 0;
    private frameTimeHistory: number[] = [];
    private readonly FPS_SAMPLE_SIZE = 60; // Increased to 60 frames
    private readonly FPS_SMOOTHING = 0.98; // Exponential smoothing factor (higher = smoother)
    private smoothedFps = 0;

    // Add to class properties
    private ellipseStartX = $state<number | null>(null);
    private ellipseStartY = $state<number | null>(null);
    private isDrawingEllipse = $state(false);
    private isShiftPressed = $state(false);

    constructor(canvas: HTMLCanvasElement, width: number = 20, height: number = 15) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.ctx.imageSmoothingEnabled = false;

        // Initialize tilemap
        this.tilemap = new Tilemap(
            this.tilemapUrl, 
            this.tileWidth, 
            this.tileHeight, 
            this.tileSpacing
        );

        // Initialize map data
        this.mapData = createEmptyMap(width, height, this.MAX_LAYERS);
        this.undoStack = [cloneMapData(this.mapData)];

        // Set up event listeners
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

        // Store the instance
        editor = this;

        // Set up reactivity
        this.setupReactivity();

        // Start single animation loop
        requestAnimationFrame(this.animationLoop.bind(this));
    }

    private setupReactivity() {
        // Sync tool state
        $effect(() => {
            this.isFloodFillMode = toolFSM.context.currentTool === 'fill';
            this.setBrushSize(toolFSM.context.brushSize);
        });

        // Sync layer state
        $effect(() => {
            this.currentLayer = layerFSM.context.currentLayer;
            layerFSM.context.layerVisibility.forEach((visible, i) => {
                if (this.isLayerVisible(i) !== visible) {
                    this.toggleLayerVisibility(i);
                }
            });
        });
    }

    // Getters and setters that sync with FSMs
    get currentLayer() { return layerFSM.context.currentLayer; }
    set currentLayer(value: number) { layerFSM.send('selectLayer', value); }

    get brushSize() { return toolFSM.context.brushSize; }
    set brushSize(value: number) { toolFSM.send('setBrushSize', value); }

    get isFloodFillMode() { return toolFSM.context.currentTool === 'fill'; }
    set isFloodFillMode(value: boolean) {
        toolFSM.send('selectTool', value ? 'fill' : 'brush');
    }

    // Layer visibility methods
    isLayerVisible(layer: number): boolean {
        return layerFSM.context.layerVisibility[layer];
    }

    toggleLayerVisibility(layer: number) {
        layerFSM.send('toggleLayerVisibility', layer);
    }

    // Grid methods
    toggleGrid() {
        this.showGrid = !this.showGrid;
        // Notify editor store of the change
        editorStore.setShowGrid(this.showGrid);
    }

    // Brush size methods
    setBrushSize(size: number) {
        this.brushSize = Math.max(1, size);
    }

    // Handle mouse wheel for zooming
    handleWheel(e: WheelEvent) {
        e.preventDefault();

        // Get mouse position before zoom
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Find the next zoom level based on scroll direction
        const direction = e.deltaY < 0 ? 'up' : 'down';
        const newZoom = findClosestZoomLevel(this.zoomLevel, direction, 'fine');

        // Only proceed if zoom actually changed
        if (newZoom !== this.zoomLevel) {
            this.setZoom(newZoom, { x: mouseX, y: mouseY });
        }
    }

    // Set zoom level with focus point
    setZoom(newZoom: SnapZoomLevel, focusPoint: Point) {
        const transform = calculateZoomTransform(
            newZoom,
            this.zoomLevel,
            focusPoint,
            { x: this.offsetX, y: this.offsetY }
        );
        
        this.zoomLevel = transform.zoom as ZoomLevel;
        this.offsetX = transform.offset.x;
        this.offsetY = transform.offset.y;
    }

    // Core rendering methods
    private animationLoop(timestamp: number) {
        // Calculate FPS with rolling average and exponential smoothing
        if (this.lastFrameTime) {
            const frameTime = timestamp - this.lastFrameTime;
            this.frameTimeHistory.push(frameTime);
            
            // Keep only the last N frames
            if (this.frameTimeHistory.length > this.FPS_SAMPLE_SIZE) {
                this.frameTimeHistory.shift();
            }
            
            // Calculate average frame time
            const averageFrameTime = this.frameTimeHistory.reduce((sum, time) => sum + time, 0) / this.frameTimeHistory.length;
            const currentFps = 1000 / averageFrameTime;
            
            // Apply exponential smoothing
            if (this.smoothedFps === 0) {
                this.smoothedFps = currentFps; // Initialize on first frame
            } else {
                this.smoothedFps = this.FPS_SMOOTHING * this.smoothedFps + (1 - this.FPS_SMOOTHING) * currentFps;
            }
            
            this.fps = Math.round(this.smoothedFps);
        }
        this.lastFrameTime = timestamp;

        // Update panning first
        this.updatePanning();
        
        // Then update rendering
        this.update();
        
        // Continue the loop
        requestAnimationFrame(this.animationLoop.bind(this));
    }

    private updatePanning() {
        const friction = 0.85;
        const acceleration = 2.0;
        const maxVelocity = 20;

        if (this.isKeyPanning) {
            // Apply acceleration based on key states
            if (this.keyPanState.left) this.panVelocityX = Math.min(this.panVelocityX + acceleration, maxVelocity);
            if (this.keyPanState.right) this.panVelocityX = Math.max(this.panVelocityX - acceleration, -maxVelocity);
            if (this.keyPanState.up) this.panVelocityY = Math.min(this.panVelocityY + acceleration, maxVelocity);
            if (this.keyPanState.down) this.panVelocityY = Math.max(this.panVelocityY - acceleration, -maxVelocity);
        } else {
            // Apply friction when no keys are pressed
            this.panVelocityX *= friction;
            this.panVelocityY *= friction;

            // Stop completely if velocity is very small
            if (Math.abs(this.panVelocityX) < 0.01) this.panVelocityX = 0;
            if (Math.abs(this.panVelocityY) < 0.01) this.panVelocityY = 0;
        }

        // Apply velocities to offset
        if (this.panVelocityX !== 0 || this.panVelocityY !== 0) {
            this.offsetX += this.panVelocityX;
            this.offsetY += this.panVelocityY;
        }
    }

    private update() {
        if (!this.tilemap.isLoaded()) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.drawMap();
        this.drawGrid();
        this.paletteManager?.drawPalette(this.ctx);
    }

    private drawBackground() {
        this.ctx.fillStyle = "#4a4a4a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawMap() {
        if (!this.tilemap.isLoaded()) return;

        // Apply zoom and offset transformation
        this.ctx.save();
        this.ctx.translate(Math.round(this.offsetX), Math.round(this.offsetY));
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Calculate visible area in map coordinates (add a small buffer for smooth scrolling)
        const viewportBounds = {
            left: -this.offsetX / this.zoomLevel - this.tilemap.tileWidth,
            top: -this.offsetY / this.zoomLevel - this.tilemap.tileHeight,
            right: (this.canvas.width - this.offsetX) / this.zoomLevel + this.tilemap.tileWidth,
            bottom: (this.canvas.height - this.offsetY) / this.zoomLevel + this.tilemap.tileHeight
        };

        // Convert to tile coordinates and clamp to map bounds
        const dimensions = this.getMapDimensions();
        const startTileX = Math.max(0, Math.floor(viewportBounds.left / this.tilemap.tileWidth));
        const startTileY = Math.max(0, Math.floor(viewportBounds.top / this.tilemap.tileHeight));
        const endTileX = Math.min(dimensions.width - 1, Math.ceil(viewportBounds.right / this.tilemap.tileWidth));
        const endTileY = Math.min(dimensions.height - 1, Math.ceil(viewportBounds.bottom / this.tilemap.tileHeight));

        // Draw each layer from bottom to top, but only for visible tiles
        for (let layer = 0; layer < this.MAX_LAYERS; layer++) {
            // Skip hidden layers
            if (!this.isLayerVisible(layer)) continue;

            // If showing all layers or this is the current layer, use full opacity
            this.ctx.globalAlpha = this.currentLayer === -1 || layer === this.currentLayer ? 1.0 : 0.3;
            
            for (let y = startTileY; y <= endTileY; y++) {
                for (let x = startTileX; x <= endTileX; x++) {
                    const tileIndex = this.mapData[layer][y][x];
                    if (tileIndex === -1) continue; // Skip empty tiles
                    
                    const tile = this.tilemap.getTile(tileIndex);
                    if (tile) {
                        const screenPos = mapToScreen(x, y, 0, 0, 1, this.tilemap.tileWidth, this.tilemap.tileHeight);
                        // Round the position to prevent sub-pixel rendering
                        this.ctx.drawImage(tile, Math.round(screenPos.x), Math.round(screenPos.y));
                    }
                }
            }
        }
        
        // Reset alpha
        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
    }

    private drawGrid() {
        if (!this.showGrid) {
            // Still draw brush preview even if grid is hidden
            this.drawBrushPreview();
            return;
        }

        const dimensions = this.getMapDimensions();
        const mapWidthPx = dimensions.width * this.tilemap.tileWidth;
        const mapHeightPx = dimensions.height * this.tilemap.tileHeight;

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1 / this.zoomLevel; // Keep grid line width constant

        // Vertical lines
        for (let x = 0; x <= dimensions.width; x++) {
            const screenPos = mapToScreen(x, 0, 0, 0, 1, this.tilemap.tileWidth, this.tilemap.tileHeight);
            this.ctx.beginPath();
            this.ctx.moveTo(screenPos.x, 0);
            this.ctx.lineTo(screenPos.x, mapHeightPx);
            this.ctx.stroke();
        }

        // Horizontal lines
        for (let y = 0; y <= dimensions.height; y++) {
            const screenPos = mapToScreen(0, y, 0, 0, 1, this.tilemap.tileWidth, this.tilemap.tileHeight);
            this.ctx.beginPath();
            this.ctx.moveTo(0, screenPos.y);
            this.ctx.lineTo(mapWidthPx, screenPos.y);
            this.ctx.stroke();
        }

        this.ctx.restore();
        
        // Draw brush preview after grid
        this.drawBrushPreview();
    }

    private drawBrushPreview() {
        if (this.hoverX < 0 || this.hoverY < 0 || this.currentLayer === -1) return;

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        if (this.isFloodFillMode) {
            // Draw flood fill preview
            const targetValue = this.mapData[this.currentLayer][this.hoverY][this.hoverX];
            const previewLayer = this.mapData[this.currentLayer].map(row => [...row]);
            const filledPoints = floodFill(previewLayer, this.hoverX, this.hoverY, targetValue, -2);
            
            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush) {
                // Preview brush pattern on filled points
                this.brushManager?.drawBrushPreviewOnPoints(
                    this.ctx,
                    selectedBrush,
                    filledPoints,
                    (idx) => this.tilemap.getTile(idx),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.useWorldAlignedRepeat
                );
            }
            
            // Draw highlight around filled area
            drawFloodFillPreview(
                this.ctx,
                filledPoints,
                this.tilemap.tileWidth,
                this.tilemap.tileHeight,
                this.zoomLevel,
                mapToScreen
            );
        } else if (this.isDrawingEllipse && this.ellipseStartX !== null && this.ellipseStartY !== null) {
            // Calculate initial radii
            let radiusX = Math.abs(this.hoverX - this.ellipseStartX);
            let radiusY = Math.abs(this.hoverY - this.ellipseStartY);

            // If shift is pressed, make it a perfect circle by using the larger radius
            if (this.isShiftPressed) {
                const maxRadius = Math.max(radiusX, radiusY);
                radiusX = maxRadius;
                radiusY = maxRadius;
            }

            const ellipsePoints = getEllipsePoints(
                this.ellipseStartX,
                this.ellipseStartY,
                radiusX,
                radiusY
            );
            
            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush) {
                // Preview brush pattern on ellipse points
                this.brushManager?.drawBrushPreviewOnPoints(
                    this.ctx,
                    selectedBrush,
                    ellipsePoints,
                    (idx) => this.tilemap.getTile(idx),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.useWorldAlignedRepeat
                );
            } else {
                // Regular ellipse preview for erasing
                drawRectanglePreview(
                    this.ctx,
                    this.ellipseStartX - radiusX,
                    this.ellipseStartY - radiusY,
                    radiusX * 2 + 1,
                    radiusY * 2 + 1,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.zoomLevel,
                    mapToScreen,
                    { fillStyle: 'rgba(255, 255, 255, 0.1)' }
                );
            }
        } else if (this.isDrawingRectangle && this.rectangleStartX !== null && this.rectangleStartY !== null) {
            // Draw rectangle preview
            const startX = Math.min(this.rectangleStartX, this.hoverX);
            const startY = Math.min(this.rectangleStartY, this.hoverY);
            const endX = Math.max(this.rectangleStartX, this.hoverX);
            const endY = Math.max(this.rectangleStartY, this.hoverY);
            
            const width = endX - startX + 1;
            const height = endY - startY + 1;

            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush) {
                // Preview brush pattern in rectangle
                const targetArea = {
                    x: startX,
                    y: startY,
                    width,
                    height
                };
                this.brushManager?.drawBrushPreview(
                    this.ctx,
                    selectedBrush,
                    targetArea,
                    (idx) => this.tilemap.getTile(idx),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.useWorldAlignedRepeat
                );
            } else {
                // Regular rectangle preview for erasing
                drawRectanglePreview(
                    this.ctx,
                    startX,
                    startY,
                    width,
                    height,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.zoomLevel,
                    mapToScreen,
                    { fillStyle: 'rgba(255, 255, 255, 0.1)' }
                );
            }
        } else {
            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush) {
                // Regular brush preview
                const targetArea = getBrushArea(
                    this.hoverX,
                    this.hoverY,
                    toolFSM.context.currentTool === 'rectangle' ? 1 : this.brushSize,  // Use size 1 if in rectangle mode
                    selectedBrush,
                    this.isCustomBrushMode
                );
                this.brushManager?.drawBrushPreview(
                    this.ctx,
                    selectedBrush,
                    targetArea,
                    (idx) => this.tilemap.getTile(idx),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.useWorldAlignedRepeat
                );
            } else {
                // Erase preview
                const brushArea = getBrushArea(
                    this.hoverX,
                    this.hoverY,
                    toolFSM.context.currentTool === 'rectangle' ? 1 : this.brushSize  // Use size 1 if in rectangle mode
                );
                drawRectanglePreview(
                    this.ctx,
                    brushArea.x,
                    brushArea.y,
                    brushArea.width,
                    brushArea.height,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.zoomLevel,
                    mapToScreen,
                    { fillStyle: 'rgba(255, 255, 255, 0.1)' }
                );
            }
        }

        this.ctx.restore();
    }

    // Mouse event handlers
    handleMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Middle click is always for panning
        if (e.button === 1) {
            e.preventDefault();
            this.isPanning = true;
            this.lastPanX = mouseX;
            this.lastPanY = mouseY;
            return;
        }

        // Check if clicking in the palette area
        if (this.paletteManager?.isWithinPalette(mouseX, mouseY) === true) {
            if (e.button === 0) { // Left click for palette selection
                this.paletteManager.handlePaletteClick(mouseX, mouseY);
            } else if (e.button === 2) { // Right click for brush settings
                this.paletteManager?.handlePaletteRightClick(mouseX, mouseY);
            }
            return;
        }

        // Don't allow painting in "all layers" mode
        if (this.currentLayer === -1) {
            return;
        }

        // Convert mouse coordinates to map coordinates
        const mapPos = screenToMap(
            mouseX,
            mouseY,
            this.offsetX,
            this.offsetY,
            this.zoomLevel,
            this.tilemap.tileWidth,
            this.tilemap.tileHeight,
            this.brushSize % 2 === 0
        );

        if (isInMapBounds(mapPos.x, mapPos.y, this.getMapDimensions())) {
            if (e.button === 0 || e.button === 2) { // Left or right click
                // Store the initial state before painting
                if (!this.undoBuffer) {
                    this.undoBuffer = cloneMapData(this.mapData);
                }
                
                if (toolFSM.context.currentTool === 'ellipse') {
                    this.ellipseStartX = mapPos.x;
                    this.ellipseStartY = mapPos.y;
                    this.isDrawingEllipse = true;
                    toolFSM.send('startEllipse');
                    return; // Don't set isPainting while sizing the ellipse
                }

                this.isPainting = true;
                this.paintTile = e.button === 2 ? -1 : toolFSM.context.selectedTile;

                if (this.isFloodFillMode && e.button === 0) {
                    // Get the target value (the tile we're replacing)
                    const targetValue = this.mapData[this.currentLayer][mapPos.y][mapPos.x];
                    
                        // Create a copy of the current layer for undo
                        const layerCopy = this.mapData[this.currentLayer].map(row => [...row]);
                        
                        // Perform flood fill with a temporary value
                        const filledPoints = floodFill(
                            this.mapData[this.currentLayer],
                            mapPos.x,
                            mapPos.y,
                            targetValue,
                            -2  // Use a temporary value that won't conflict with tile indices
                        );
                        
                        if (filledPoints.length > 0) {
                        const selectedBrush = this.brushManager?.getSelectedBrush();
                        if (selectedBrush) {
                            // Find the bounding box of filled points
                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            for (const point of filledPoints) {
                                minX = Math.min(minX, point.x);
                                minY = Math.min(minY, point.y);
                                maxX = Math.max(maxX, point.x);
                                maxY = Math.max(maxY, point.y);
                            }

                            // Apply brush to each filled point
                            for (const point of filledPoints) {
                                this.brushManager?.applyBrush(
                            this.mapData[this.currentLayer],
                                    point.x,
                                    point.y,
                                    1,  // Use size 1 for flood fill
                                    { useWorldAlignedRepeat: this.useWorldAlignedRepeat }
                                );
                            }
                            this.hasModifiedDuringPaint = true;
                        }
                    }
                } else if (toolFSM.context.currentTool === 'rectangle') {
                    this.rectangleStartX = mapPos.x;
                    this.rectangleStartY = mapPos.y;
                    this.isDrawingRectangle = true;
                    toolFSM.send('startRectangle');
                } else {
                    this.applyBrush(mapPos.x, mapPos.y, e.button === 2);
                }
            }
        }
    }

    handleMouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Handle tile selection in palette
        if (this.selectionStartX !== null && this.selectionStartY !== null) {
            const tilePos = this.paletteManager?.getTileFromPaletteCoords(mouseX, mouseY);
            if (tilePos) {
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;

                // Only enter selection mode if we're selecting more than one tile
                const width = Math.abs((this.selectionEndX || 0) - this.selectionStartX) + 1;
                const height = Math.abs((this.selectionEndY || 0) - this.selectionStartY) + 1;
                if (width > 1 || height > 1) {
                    this.isSelectingTiles = true;
                    // Clear the single tile selection when entering drag mode
                    this.brushManager?.selectBrush(null);
                } else {
                    this.isSelectingTiles = false;
                    // Update the single tile selection
                    const tileIndex = tilePos.tileY * this.tilemap.width + tilePos.tileX;
                    const brushId = `tile_${tileIndex}`;
                    this.brushManager?.selectBrush(brushId);
                    toolFSM.send('selectTile', tileIndex);
                }
            }
            return;
        }

        // Handle panning
        if (this.isPanning) {
            const deltaX = mouseX - this.lastPanX;
            const deltaY = mouseY - this.lastPanY;
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            this.lastPanX = mouseX;
            this.lastPanY = mouseY;
            return;
        }

        // Always update last known mouse position
        this.lastPanX = mouseX;
        this.lastPanY = mouseY;

        // Convert mouse coordinates to map coordinates
        const mapPos = screenToMap(
            mouseX,
            mouseY,
            this.offsetX,
            this.offsetY,
            this.zoomLevel,
            this.tilemap.tileWidth,
            this.tilemap.tileHeight,
            this.brushSize % 2 === 0
        );

        // Update hover position for brush preview
        if (isInMapBounds(mapPos.x, mapPos.y, this.getMapDimensions())) {
            this.hoverX = mapPos.x;
            this.hoverY = mapPos.y;
        } else {
            this.hoverX = -1;
            this.hoverY = -1;
        }

        // Handle painting
        if (this.isPainting) {
            if (this.isFloodFillMode || toolFSM.context.currentTool === 'rectangle') {
                // Skip during flood fill and rectangle drawing
                return;
            }
            
            this.applyBrush(mapPos.x, mapPos.y, this.paintTile === -1);
        }
    }

    handleMouseUp() {
        // Handle tile selection completion
        if (this.selectionStartX !== null && this.selectionStartY !== null) {
            if (this.isSelectingTiles) {
                // If we were selecting (dragging), create a brush
                console.log('Completing tile selection');
                this.createTemporaryBrushFromSelection();
            } else {
                // If we just clicked (no drag), select the tile
                const tileIndex = this.selectionStartY * this.tilemap.width + this.selectionStartX;
                const brushId = `tile_${tileIndex}`;
                this.brushManager?.selectBrush(brushId);
                toolFSM.send('selectTile', tileIndex);
            }
            // Reset selection state
            this.isSelectingTiles = false;
            this.selectionStartX = null;
            this.selectionStartY = null;
            this.selectionEndX = null;
            this.selectionEndY = null;
            return;
        }

        // Handle rectangle drawing completion
        if (this.isDrawingRectangle && 
            this.rectangleStartX !== null && 
            this.rectangleStartY !== null && 
            this.hoverX >= 0 && 
            this.hoverY >= 0) {
            
            const startX = Math.min(this.rectangleStartX, this.hoverX);
            const startY = Math.min(this.rectangleStartY, this.hoverY);
            const endX = Math.max(this.rectangleStartX, this.hoverX);
            const endY = Math.max(this.rectangleStartY, this.hoverY);
            
            const width = endX - startX + 1;
            const height = endY - startY + 1;

            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (this.isCustomBrushMode && selectedBrush && !selectedBrush.isBuiltIn) {
                // Apply custom brush pattern to rectangle
                const { tiles, width: brushWidth, height: brushHeight } = selectedBrush;
                const pattern = calculateBrushPattern(
                    { x: startX, y: startY, width, height },
                    { width: brushWidth, height: brushHeight },
                    this.useWorldAlignedRepeat
                );

                for (let ty = 0; ty < height; ty++) {
                    for (let tx = 0; tx < width; tx++) {
                        const worldX = startX + tx;
                        const worldY = startY + ty;

                        if (isInMapBounds(worldX, worldY, this.getMapDimensions())) {
                            const { sourceX, sourceY } = pattern[ty][tx];
                            const tileIndex = tiles[sourceY][sourceX];
                            if (tileIndex !== -1) {
                                if (this.mapData[this.currentLayer][worldY][worldX] !== tileIndex) {
                                    this.mapData[this.currentLayer][worldY][worldX] = tileIndex;
                                    this.hasModifiedDuringPaint = true;
                                }
                            }
                        }
                    }
                }
            } else {
                // Fill rectangle with selected tile
                const selectedBrush = this.brushManager?.getSelectedBrush();
                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        if (isInMapBounds(x, y, this.getMapDimensions())) {
                            const newTile = this.paintTile === -1 ? -1 : 
                                (selectedBrush?.isBuiltIn ? parseInt(selectedBrush.id.replace('tile_', '')) : toolFSM.context.selectedTile);
                            if (this.mapData[this.currentLayer][y][x] !== newTile) {
                                this.mapData[this.currentLayer][y][x] = newTile;
                                this.hasModifiedDuringPaint = true;
                            }
                        }
                    }
                }
            }

            this.isDrawingRectangle = false;
            toolFSM.send('stopRectangle');
        }

        // Reset rectangle drawing state
        this.rectangleStartX = null;
        this.rectangleStartY = null;

        // Handle ellipse drawing completion
        if (this.isDrawingEllipse && 
            this.ellipseStartX !== null && 
            this.ellipseStartY !== null && 
            this.hoverX >= 0 && 
            this.hoverY >= 0) {
            
            let radiusX = Math.abs(this.hoverX - this.ellipseStartX);
            let radiusY = Math.abs(this.hoverY - this.ellipseStartY);

            // If shift is pressed, make it a perfect circle by using the larger radius
            if (this.isShiftPressed) {
                const maxRadius = Math.max(radiusX, radiusY);
                radiusX = maxRadius;
                radiusY = maxRadius;
            }

            const ellipsePoints = getEllipsePoints(
                this.ellipseStartX,
                this.ellipseStartY,
                radiusX,
                radiusY
            );
            
            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush) {
                if (this.isCustomBrushMode && !selectedBrush.isBuiltIn) {
                    // Apply brush pattern to all ellipse points
                    const result = this.brushManager?.applyBrushToPoints(
                        this.mapData[this.currentLayer],
                        ellipsePoints,
                        selectedBrush,
                        { useWorldAlignedRepeat: this.useWorldAlignedRepeat }
                    );
                    if (result?.modified) {
                        this.hasModifiedDuringPaint = true;
                    }
                } else {
                    // Regular brush application for built-in brushes
                    for (const point of ellipsePoints) {
                        if (isInMapBounds(point.x, point.y, this.getMapDimensions())) {
                            this.brushManager?.applyBrush(
                                this.mapData[this.currentLayer],
                                point.x,
                                point.y,
                                1,  // Use size 1 for ellipse points
                                { useWorldAlignedRepeat: this.useWorldAlignedRepeat }
                            );
                            this.hasModifiedDuringPaint = true;
                        }
                    }
                }
            } else {
                // Erase ellipse points
                for (const point of ellipsePoints) {
                    if (isInMapBounds(point.x, point.y, this.getMapDimensions())) {
                        this.mapData[this.currentLayer][point.y][point.x] = -1;
                        this.hasModifiedDuringPaint = true;
                    }
                }
            }

            this.isDrawingEllipse = false;
            toolFSM.send('stopEllipse');
        }

        // Reset ellipse drawing state
        this.ellipseStartX = null;
        this.ellipseStartY = null;

        // If we modified anything during this paint operation, save the state
        if (this.hasModifiedDuringPaint && this.undoBuffer) {
            // Push the state that was captured at the start of painting
            this.undoStack.push(this.undoBuffer);
            
            // Trim undo stack if it's too long
            if (this.undoStack.length > this.maxUndoSteps) {
                this.undoStack.shift();
            }
            
            // Clear redo stack when new state is saved
            this.redoStack = [];
            
            this.undoBuffer = null;
            this.hasModifiedDuringPaint = false;
        }
        
        this.isPanning = false;
        this.isPainting = false;
        this.paintTile = null;
    }

    cancelRectangleDrawing() {
        if (this.isDrawingRectangle) {
            this.rectangleStartX = null;
            this.rectangleStartY = null;
            this.isDrawingRectangle = false;
            this.isPainting = false;
            this.paintTile = null;
            toolFSM.send('stopRectangle');
        }
    }

    cancelEllipseDrawing() {
        if (this.isDrawingEllipse) {
            this.ellipseStartX = null;
            this.ellipseStartY = null;
            this.isDrawingEllipse = false;
            this.isPainting = false;
            this.paintTile = null;
            toolFSM.send('stopEllipse');
        }
    }

    // Brush application
    private applyBrush(mapX: number, mapY: number, isErasing: boolean = false) {
        if (!this.brushManager) return;
        const result = this.brushManager.applyBrush(
            this.mapData[this.currentLayer],
            mapX,
            mapY,
            this.brushSize,
            {
                isErasing,
                useWorldAlignedRepeat: this.useWorldAlignedRepeat,
                isCustomBrush: this.isCustomBrushMode
            }
        );

        if (result?.modified) {
            this.hasModifiedDuringPaint = true;
        }
    }

    // Keyboard event handlers
    handleKeyDown(e: KeyboardEvent) {
        // Skip handling if target is an input element
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Handle shift key state
        if (e.key === 'Shift') {
            e.preventDefault();
            this.isShiftPressed = true;
            return;  // Return early for shift key
        }

        // Handle arrow keys for panning
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.keyPanState.left = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.keyPanState.right = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.keyPanState.up = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.keyPanState.down = true;
                this.isKeyPanning = true;
                break;
        }

        // Check for number keys (0-9) for layer selection
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const layer = e.key === '0' ? 9 : parseInt(e.key) - 1;
            // Only select layer if it's visible
            if (layer >= 0 && layer < this.MAX_LAYERS && layerFSM.context.layerVisibility[layer]) {
                this.currentLayer = layer;
            }
            return;
        }

        // Handle section key for all layers toggle
        if (e.key === '§') {
            e.preventDefault();
            this.currentLayer = this.currentLayer === -1 ? 0 : -1;
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.redo();
                    } else {
                        e.preventDefault();
                        this.undo();
                    }
                } else {
                    e.preventDefault();
                    this.setBrushSize(Math.max(1, this.brushSize - 1));
                }
                break;
            case ' ':
                e.preventDefault();
                this.centerMap();
                break;
            case 'r':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toolFSM.send('selectTool', 'rectangle');
                }
                break;
            case 'f':
                e.preventDefault();
                toolFSM.send('selectTool', this.isFloodFillMode ? 'brush' : 'fill');
                break;
            case 'g':
                e.preventDefault();
                toolFSM.send('selectTool', 'fill');
                break;
            case 'b':
                e.preventDefault();
                toolFSM.send('selectTool', 'brush');
                break;
            case 'x':
                e.preventDefault();
                this.setBrushSize(this.brushSize + 1);
                break;
            case 'w':
                e.preventDefault();
                this.navigateBrushGrid('up');
                break;
            case 's':
                e.preventDefault();
                this.navigateBrushGrid('down');
                break;
            case 'a':
                e.preventDefault();
                this.navigateBrushGrid('left');
                break;
            case 'd':
                e.preventDefault();
                this.navigateBrushGrid('right');
                break;
            case 'escape':
                e.preventDefault();
                if (this.isSelectingTiles) {
                    // Cancel tile selection
                    this.isSelectingTiles = false;
                    this.selectionStartX = null;
                    this.selectionStartY = null;
                    this.selectionEndX = null;
                    this.selectionEndY = null;
                } else {
                    this.cancelRectangleDrawing();
                    this.cancelEllipseDrawing();
                }
                break;
            case 'e':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    toolFSM.send('selectTool', 'ellipse');
                }
                break;
        }
    }

    handleKeyUp(e: KeyboardEvent) {
        // Always handle shift key state
        if (e.key === 'Shift') {
            this.isShiftPressed = false;
            return;  // Return early for shift key
        }

        switch (e.key) {
            case 'ArrowLeft':
                this.keyPanState.left = false;
                break;
            case 'ArrowRight':
                this.keyPanState.right = false;
                break;
            case 'ArrowUp':
                this.keyPanState.up = false;
                break;
            case 'ArrowDown':
                this.keyPanState.down = false;
                break;
        }

        // Check if any arrow keys are still pressed
        this.isKeyPanning = Object.values(this.keyPanState).some(value => value);
    }

    // Map operations
    resizeMap(newWidth: number, newHeight: number, alignment: ResizeAlignment = 'middle-center') {
        // Validate dimensions
        if (!validateMapDimensions(newWidth, newHeight)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        // Store the old map data (deep copy)
        const oldMap = cloneMapData(this.mapData);
        const oldDimensions = { width: oldMap[0][0].length, height: oldMap[0].length };

        // Create new map with new dimensions
        const newMap = createEmptyMap(newWidth, newHeight, this.MAX_LAYERS);

        // Calculate offsets based on alignment
        let offsetX = 0;
        let offsetY = 0;

        // Calculate horizontal offset
        switch(true) {
            case alignment.includes('left'):
                offsetX = 0;
                break;
            case alignment.includes('center'):
                offsetX = Math.floor((newWidth - oldDimensions.width) / 2);
                break;
            case alignment.includes('right'):
                offsetX = newWidth - oldDimensions.width;
                break;
        }

        // Calculate vertical offset
        switch(true) {
            case alignment.includes('top'):
                offsetY = 0;
                break;
            case alignment.includes('middle'):
                offsetY = Math.floor((newHeight - oldDimensions.height) / 2);
                break;
            case alignment.includes('bottom'):
                offsetY = newHeight - oldDimensions.height;
                break;
        }

        // Ensure offsets don't cause content loss when shrinking
        if (newWidth < oldDimensions.width) {
            if (alignment.includes('center')) {
                offsetX = Math.floor((newWidth - oldDimensions.width) / 2);
            } else if (alignment.includes('right')) {
                offsetX = newWidth - oldDimensions.width;
            }
            offsetX = Math.max(-(oldDimensions.width - newWidth), Math.min(0, offsetX));
        }

        if (newHeight < oldDimensions.height) {
            if (alignment.includes('middle')) {
                offsetY = Math.floor((newHeight - oldDimensions.height) / 2);
            } else if (alignment.includes('bottom')) {
                offsetY = newHeight - oldDimensions.height;
            }
            offsetY = Math.max(-(oldDimensions.height - newHeight), Math.min(0, offsetY));
        }

        // Copy existing data to new map
        for (let layer = 0; layer < this.MAX_LAYERS; layer++) {
            for (let y = 0; y < oldDimensions.height; y++) {
                for (let x = 0; x < oldDimensions.width; x++) {
                    const newX = x + offsetX;
                    const newY = y + offsetY;
                    
                    // Only copy if the new position is within bounds
                    if (isInMapBounds(newX, newY, { width: newWidth, height: newHeight })) {
                        newMap[layer][newY][newX] = oldMap[layer][y][x];
                    }
                }
            }
        }

        // Save current state to undo stack and apply new state
        this.undoStack.push(cloneMapData(this.mapData));
        this.mapData = newMap;
        this.redoStack = [];
        this.centerMap();
    }

    newMap(width: number, height: number) {
        if (!validateMapDimensions(width, height)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        // Save current state to undo stack
        this.undoStack.push(cloneMapData(this.mapData));
        
        // Create and apply new map
        this.mapData = createEmptyMap(width, height, this.MAX_LAYERS);
        this.redoStack = [];
        this.centerMap();
    }

    // Export/Import
    exportMap(useCompression: boolean = true, includeCustomBrushes: boolean = true): string {
        return JSON.stringify(createMapMetadata(
            this.mapData,
            {
                tileWidth: this.tileWidth,
                tileHeight: this.tileHeight,
                spacing: this.tileSpacing,
                imageData: this.tilemap.getImageData()
            },
            includeCustomBrushes && this.brushManager ? this.brushManager.getCustomBrushes() : [],
            useCompression
        ));
    }

    async importMap(data: { version: number, format: string, mapData: any, tilemap: any }) {
        if (!data.mapData) {
            throw new Error('Invalid map data format');
        }

        // Handle tilemap data if present
        if (data.tilemap) {
            // If we have image data, create a data URL and use it
            if (data.tilemap.imageData) {
                this.tilemapUrl = data.tilemap.imageData;
            } else {
                this.tilemapUrl = data.tilemap.url;
            }
            this.tileWidth = data.tilemap.tileWidth;
            this.tileHeight = data.tilemap.tileHeight;
            this.tileSpacing = data.tilemap.spacing;

            // Create new tilemap with updated settings
            this.tilemap = new Tilemap(
                this.tilemapUrl,
                this.tileWidth,
                this.tileHeight,
                this.tileSpacing
            );

            // Load the new tilemap
            try {
                await this.tilemap.load();
            } catch (error) {
                console.error('Failed to load tilemap:', error);
                throw error;
            }
        }

        // Handle map data based on format
        let unpackedData: MapData;
        try {
            if (data.format === 'binary') {
                if (typeof data.mapData !== 'string') {
                    throw new Error('Invalid binary map data format');
                }
                unpackedData = unpackMapData(data.mapData);
            } else {
                // Handle JSON format
                if (!data.mapData.width || !data.mapData.height || !data.mapData.layers) {
                    throw new Error('Invalid JSON map data format');
                }
                if (!Array.isArray(data.mapData.layers)) {
                    throw new Error('Layers must be an array');
                }
                unpackedData = data.mapData.layers;
            }

            // Ensure we have exactly MAX_LAYERS layers
            while (unpackedData.length < this.MAX_LAYERS) {
                const emptyLayer = Array(unpackedData[0].length).fill(0)
                    .map(() => Array(unpackedData[0][0].length).fill(-1));
                unpackedData.push(emptyLayer);
            }

            // Save current state to undo stack
            this.undoStack.push(cloneMapData(this.mapData));
            
            // Apply new map data
            this.mapData = unpackedData.slice(0, this.MAX_LAYERS);
            this.redoStack = [];
            this.centerMap();
        } catch (error) {
            console.error('Failed to unpack map data:', error);
            throw error;
        }
    }

    // Custom brush methods
    private createTemporaryBrushFromSelection() {
        if (!this.brushManager) return;
        console.log('Creating brush from selection');
        if (this.selectionStartX === null || this.selectionStartY === null || 
            this.selectionEndX === null || this.selectionEndY === null) {
            console.log('Selection coordinates are invalid:', {
                startX: this.selectionStartX,
                startY: this.selectionStartY,
                endX: this.selectionEndX,
                endY: this.selectionEndY
            });
            return;
        }

        const startX = Math.min(this.selectionStartX, this.selectionEndX);
        const startY = Math.min(this.selectionStartY, this.selectionEndY);
        const endX = Math.max(this.selectionStartX, this.selectionEndX);
        const endY = Math.max(this.selectionStartY, this.selectionEndY);

        console.log('Selection bounds:', { startX, startY, endX, endY });

        const width = endX - startX + 1;
        const height = endY - startY + 1;
        const tiles: number[][] = [];

        console.log('Creating brush with dimensions:', { width, height });

        // Create the tile array
        for (let y = 0; y < height; y++) {
            const row: number[] = [];
            for (let x = 0; x < width; x++) {
                const tileX = startX + x;
                const tileY = startY + y;
                const tileIndex = tileY * this.tilemap.width + tileX;
                row.push(tileIndex);
            }
            tiles.push(row);
        }

        console.log('Created tile array:', tiles);

        // Create and select the brush using the brush manager
        const brush = this.brushManager.createCustomBrush(`${width}x${height} Selection`, tiles, this.tilemap);
        console.log('Created brush:', brush);
        this.brushManager.selectBrush(brush.id);
        this.isCustomBrushMode = true;
        console.log('Selected brush:', this.brushManager.getSelectedBrush());

        // Reset selection state
        this.isSelectingTiles = false;
        this.selectionStartX = null;
        this.selectionStartY = null;
        this.selectionEndX = null;
        this.selectionEndY = null;
    }

    // Remove old brush management methods since we're using BrushManager
    createCustomBrush(name: string | null, tiles: number[][]): Brush {
        if (!this.brushManager) throw new Error('BrushManager not initialized');
        return this.brushManager.createCustomBrush(name || '', tiles, this.tilemap);
    }

    updateCustomBrush(brushId: string, name: string | null, tiles: number[][]): Brush | null {
        if (!this.brushManager) return null;
        return this.brushManager.updateBrush(brushId, name || '', tiles, this.tilemap);
    }

    deleteCustomBrush(brushId: string) {
        this.brushManager?.deleteBrush(brushId);
    }

    selectCustomBrush(brushId: string | null) {
        if (!this.brushManager) return;
        this.brushManager.selectBrush(brushId);
        const brush = this.brushManager.getSelectedBrush();
        this.isCustomBrushMode = brush !== null && !brush.isBuiltIn;
    }

    // Tilemap settings methods
    getTilemapSettings() {
        return {
            url: this.tilemapUrl,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            spacing: this.tileSpacing
        };
    }

    async changeTilemap(url: string, tileWidth: number, tileHeight: number, spacing: number) {
        // Store new settings
        this.tilemapUrl = url;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.tileSpacing = spacing;

        // Create new tilemap with updated settings
        this.tilemap = new Tilemap(url, tileWidth, tileHeight, spacing);
        
        // Reset selected tile
        toolFSM.send('selectTile', 0);

        // Load the new tilemap
        try {
            await this.tilemap.load();
            
            // Recreate all brush previews with the new tilemap
            if (this.brushManager) {
                const customBrushes = this.brushManager.getCustomBrushes();
                for (const brush of customBrushes) {
                    brush.preview = createBrushPreviewUtil(
                        brush,
                        (idx: number) => this.tilemap.getTile(idx),
                        this.tilemap.tileWidth,
                        this.tilemap.tileHeight
                    );
                }
            }
            
            this.centerMap();
        } catch (error) {
            console.error('Failed to load new tilemap:', error);
            throw error;
        }
    }

    moveLayer(fromIndex: number, toIndex: number) {
        const layer = this.mapData.splice(fromIndex, 1)[0];
        this.mapData.splice(toIndex, 0, layer);
    }

    // Layer operations
    swapLayers(layerA: number, layerB: number) {
        // Save current state to undo stack
        this.undoStack.push(cloneMapData(this.mapData));
        
        // Swap layer data
        [this.mapData[layerA], this.mapData[layerB]] = [this.mapData[layerB], this.mapData[layerA]];
        
        // Clear redo stack since we made a new change
        this.redoStack = [];
    }

    // Undo/Redo methods
    undo() {
        if (this.undoStack.length > 0) {
            // Save current state to redo stack
            this.redoStack.push(cloneMapData(this.mapData));
            
            // Pop and apply the last state from undo stack
            const previousState = this.undoStack.pop()!;
            this.mapData = cloneMapData(previousState);
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            // Save current state to undo stack
            this.undoStack.push(cloneMapData(this.mapData));
            
            // Pop and apply the last state from redo stack
            const nextState = this.redoStack.pop()!;
            this.mapData = cloneMapData(nextState);
        }
    }

    private navigateBrushGrid(direction: 'up' | 'down' | 'left' | 'right') {
        if (!this.brushManager || !this.paletteManager) return;
        const selectedBrush = this.brushManager.getSelectedBrush();
        if (!selectedBrush) {
            this.brushManager.selectBrush('tile_0');
            return;
        }

        if (selectedBrush.isBuiltIn) {
            const currentIndex = parseInt(selectedBrush.id.replace('tile_', ''));
            const tilesPerRow = this.tilemap.width;
            const totalTiles = this.brushManager.getBuiltInBrushes().length;
            const customBrushes = this.brushManager.getCustomBrushes();

            switch (direction) {
                case 'up': {
                    const upIndex = currentIndex - tilesPerRow;
                    if (upIndex >= 0) {
                        this.brushManager.selectBrush(`tile_${upIndex}`);
                    } else if (customBrushes.length > 0) {
                        // Wrap to last row of custom brushes
                        const currentX = this.paletteManager.getBrushCenterX(selectedBrush.id);
                        const lastRow = Math.max(...customBrushes.map(b => {
                            const pos = this.paletteManager?.getBrushRowAndColumn(b.id);
                            return pos ? pos.row : 0;
                        }));
                        const nearestBrushId = this.paletteManager?.findNearestBrushInRow(currentX, lastRow);
                        if (nearestBrushId) {
                            this.brushManager.selectBrush(nearestBrushId);
                        }
                    } else {
                        // Wrap to bottom row of tilemap
                        const bottomRowIndex = Math.floor((totalTiles - 1) / tilesPerRow) * tilesPerRow + (currentIndex % tilesPerRow);
                        if (bottomRowIndex < totalTiles) {
                            this.brushManager.selectBrush(`tile_${bottomRowIndex}`);
                        }
                    }
                    break;
                }
                case 'down': {
                    const downIndex = currentIndex + tilesPerRow;
                    if (downIndex < totalTiles) {
                        this.brushManager.selectBrush(`tile_${downIndex}`);
                    } else if (customBrushes.length > 0) {
                        // Move to custom brush at similar X position
                        const currentX = this.paletteManager.getBrushCenterX(selectedBrush.id);
                        const nearestCustomBrushId = this.paletteManager.findNearestCustomBrush(currentX);
                        if (nearestCustomBrushId) {
                            this.brushManager.selectBrush(nearestCustomBrushId);
                        }
                    } else {
                        // Wrap to top row of tilemap
                        const topRowIndex = currentIndex % tilesPerRow;
                        this.brushManager.selectBrush(`tile_${topRowIndex}`);
                    }
                    break;
                }
                case 'left': {
                    const nextIndex = currentIndex - 1;
                    if (nextIndex >= 0) {
                        this.brushManager.selectBrush(`tile_${nextIndex}`);
                    } else {
                        // Wrap to last row of custom brushes
                        const currentY = this.paletteManager?.getBrushCenterY(selectedBrush.id);
                        const customBrushes = this.brushManager.getCustomBrushes();
                        const lastRow = Math.max(...customBrushes.map(b => {
                            const pos = this.paletteManager?.getBrushRowAndColumn(b.id);
                            return pos ? pos.row : 0;
                        }));
                        const nearestBrushId = this.paletteManager.findNearestBrushInRow(0, currentY);
                        if (nearestBrushId) {
                            this.brushManager.selectBrush(nearestBrushId);
                        }
                    }
                    break;
                }
                case 'right': {
                    const nextIndex = currentIndex + 1;
                    if (nextIndex < totalTiles) {
                        this.brushManager.selectBrush(`tile_${nextIndex}`);
                    } else {
                        // Wrap to first row of custom brushes
                        const currentY = this.paletteManager.getBrushCenterY(selectedBrush.id);
                        const customBrushes = this.brushManager.getCustomBrushes();
                        const firstRow = Math.min(...customBrushes.map(b => {
                            const pos = this.paletteManager?.getBrushRowAndColumn(b.id);
                            return pos ? pos.row : 0;
                        }));
                        const nearestBrushId = this.paletteManager.findNearestBrushInRow(this.tilemap.width - 1, currentY);
                        if (nearestBrushId) {
                            this.brushManager.selectBrush(nearestBrushId);
                        }
                    }
                    break;
                }
            }
        } else {
            // Navigate through custom brushes
            const customBrushes = this.brushManager.getCustomBrushes();
            const currentIndex = customBrushes.findIndex(b => b.id === selectedBrush.id);
            if (currentIndex === -1) return;

            const position = this.paletteManager.getBrushRowAndColumn(selectedBrush.id);
            if (!position) return;

            switch (direction) {
                case 'up': {
                    if (position.row > 0) {
                        const currentPos = this.paletteManager.getBrushCenterPosition(selectedBrush.id);
                        if (currentPos) {
                            const nearestBrushId = this.paletteManager.findNearestBrushInRow(currentPos.x, position.row - 1);
                            if (nearestBrushId) {
                                this.brushManager.selectBrush(nearestBrushId);
                            }
                        }
                    } else {
                        // Move to tilemap when in first row
                        const currentX = this.paletteManager.getBrushCenterX(selectedBrush.id);
                        const nearestTileId = this.paletteManager.findNearestTile(currentX, 'up');
                        if (nearestTileId) {
                            this.brushManager.selectBrush(nearestTileId);
                        }
                    }
                    break;
                }
                case 'down': {
                    const lastRow = Math.max(...customBrushes.map(b => {
                        const pos = this.paletteManager?.getBrushRowAndColumn(b.id);
                        return pos ? pos.row : 0;
                    }));
                    if (position.row >= lastRow) {
                        // Wrap to first row of map tiles
                        const currentX = this.paletteManager.getBrushCenterX(selectedBrush.id);
                        const nearestTileId = this.paletteManager.findNearestTile(currentX, 'down');
                        if (nearestTileId) {
                            this.brushManager.selectBrush(nearestTileId);
                        }
                    } else {
                        const currentPos = this.paletteManager.getBrushCenterPosition(selectedBrush.id);
                        if (currentPos) {
                            const nearestBrushId = this.paletteManager.findNearestBrushInRow(currentPos.x, position.row + 1);
                            if (nearestBrushId) {
                                this.brushManager.selectBrush(nearestBrushId);
                            }
                        }
                    }
                    break;
                }
                case 'left':
                    if (currentIndex > 0) {
                        this.brushManager.selectBrush(customBrushes[currentIndex - 1].id);
                    } else {
                        const tilesPerRow = this.tilemap.width;
                        const totalRows = Math.ceil(this.brushManager.getBuiltInBrushes().length / tilesPerRow);
                        const rightmostTileIndex = Math.min((totalRows * tilesPerRow) - 1, this.brushManager.getBuiltInBrushes().length - 1);
                        this.brushManager.selectBrush(`tile_${rightmostTileIndex}`);
                    }
                    break;
                case 'right':
                    if (currentIndex < customBrushes.length - 1) {
                        this.brushManager.selectBrush(customBrushes[currentIndex + 1].id);
                    } else {
                        this.brushManager.selectBrush('tile_0');
                    }
                    break;
            }
        }
    }

    // Map dimensions helper
    getMapDimensions(): MapDimensions {
        return {
            width: this.mapData[0][0].length,
            height: this.mapData[0].length
        };
    }

    // Center the map in the viewport
    centerMap() {
        const center = calculateMapCenter(
            this.canvas.width,
            this.canvas.height,
            this.mapData[0][0].length,
            this.mapData[0].length,
            this.tilemap.tileWidth * this.zoomLevel,
            this.tilemap.tileHeight * this.zoomLevel
        );
        this.offsetX = center.x;
        this.offsetY = center.y;
    }

    // Initialize the editor
    async init() {
        try {
            await this.tilemap.load();
            // Initialize managers after tilemap is loaded
            this.brushManager = new BrushManager(this.tilemap);
            this.paletteManager = new PaletteManager(this.tilemap, this.brushManager);
            this.centerMap();
            // Select first tile by default (only after tilemap is loaded)
            toolFSM.send('selectTile', 0);
        } catch (error) {
            console.error('Failed to load tilemap:', error);
        }
    }

    // Handle window resize
    resize() {
        const container = this.canvas.parentElement;
        if (container) {
            const bounds = container.getBoundingClientRect();
            this.canvas.width = bounds.width;
            this.canvas.height = bounds.height;
            this.ctx.imageSmoothingEnabled = false;
        }
    }
}

// Export the singleton instance
export const mapEditor = {
    get instance() { return editor; }
}; 