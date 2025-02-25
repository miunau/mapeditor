import { Tilemap } from './tilemap';
import { BrushManager } from './managers/BrushManager';
import { PaletteManager } from './managers/PaletteManager';
import type { Brush } from './utils/brush';
import type { MapData, MapDimensions, CustomBrush } from './utils/map';
import { createEmptyMap, cloneMapData, validateMapDimensions } from './utils/map';
import type { DrawOperation } from './utils/drawing';
import type { Point, Rect } from './utils/coordinates';
import { screenToMap, isInMapBounds, calculateMapCenter } from './utils/coordinates';
import { 
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
import type { ResizeAlignment } from './utils/map';
import type { RenderSettings } from './state/EditorStore.svelte';

import { editorStore } from './state/EditorStore.svelte';

import { OptimizedRenderer } from './renderer/OptimizedRenderer';
import { SharedMapData } from './SharedMapData';

// The singleton editor instance
let editor: ReactiveMapEditor | undefined = $state();

// The editor class that integrates with FSMs
export class ReactiveMapEditor {
    // Canvas for rendering the map 
    canvas: HTMLCanvasElement;
    
    // Separate canvas for brush previews
    previewCanvas: HTMLCanvasElement | null = null;
    previewCtx: CanvasRenderingContext2D | null = null;
    
    // Separate canvas for the palette
    paletteCanvas: HTMLCanvasElement | null = null;
    paletteCtx: CanvasRenderingContext2D | null = null;

    // Map data
    mapData: MapData;
    sharedMapData: SharedMapData | null = null; // Add shared map data
    tilemap: Tilemap;
    brushManager: BrushManager | null = null;
    paletteManager: PaletteManager | null = null;

    // Bound event handlers
    private boundHandleMouseDown: (e: MouseEvent) => void;
    private boundHandleMouseMove: (e: MouseEvent) => void;
    private boundHandleMouseUp: (e: MouseEvent) => void;
    private boundHandleKeyDown: (e: KeyboardEvent) => void;
    private boundHandleKeyUp: (e: KeyboardEvent) => void;
    private boundHandleWheel: (e: WheelEvent) => void;
    private boundResize: () => void;

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
    
    // Unified drawing coordinates
    drawStartX = $state<number | null>(null);
    drawStartY = $state<number | null>(null);
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

    // For custom brushes - use the store's value directly
    get isCustomBrushMode() { return editorStore.isCustomBrushMode; }
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
    private readonly FPS_SAMPLE_SIZE = 30; // Reduced to 30 frames for more responsive updates
    private readonly FPS_SMOOTHING = 0.93; // Slightly reduced smoothing factor
    private readonly MAX_FPS = 144; // Cap FPS at 144Hz which is reasonable for most displays
    private readonly MIN_FPS = 1; // Minimum FPS to display
    private smoothedFps = 0;

    // Add to class properties
    private isShiftPressed = false; // Add missing property for shift key state

    private renderer: OptimizedRenderer | null = null;

    // Add render settings property
    private renderSettings: RenderSettings = { ...editorStore.renderSettings };

    constructor(canvas: HTMLCanvasElement, width: number = 20, height: number = 15) {
        this.canvas = canvas;
        // Don't create a context here - the canvas will be transferred to the worker
        
        // Create a separate canvas for brush previews that will be positioned over the main canvas
        this.createPreviewCanvas();

        // Create a separate canvas for the palette
        this.createPaletteCanvas();

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
        
        // Initialize shared map data
        this.sharedMapData = new SharedMapData(width, height, this.MAX_LAYERS, this.mapData, this.tileWidth, this.tileHeight);

        // Create bound event handlers
        this.boundHandleMouseDown = this.handleMouseDown.bind(this);
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        this.boundHandleMouseUp = this.handleMouseUp.bind(this);
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        this.boundHandleWheel = this.handleWheel.bind(this);
        this.boundResize = this.resize.bind(this);

        // Set up event listeners
        this.canvas.addEventListener('wheel', this.boundHandleWheel);
        this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
        this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
        window.addEventListener('mouseup', this.boundHandleMouseUp);
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);
        window.addEventListener('resize', this.boundResize);

        // Store the instance
        editor = this;

        // Set up reactivity
        this.setupReactivity();

        // Start single animation loop
        requestAnimationFrame(this.animationLoop.bind(this));
    }

    private setupReactivity() {
        // Watch for layer changes
        $effect(() => {
            const currentLayer = editorStore.currentLayer;
            const showAllLayers = editorStore.isShowAllLayers;
            
            // Update the renderer with the current layer information
            if (this.renderer) {
                this.renderer.setCurrentLayer(currentLayer, showAllLayers);
            }
            
            // Log layer change
            console.log(`MapEditor: Current layer changed to ${currentLayer}, showAllLayers: ${showAllLayers}`);
        });

        // Watch for layer visibility changes
        $effect(() => {
            const layerVisibility = editorStore.layerVisibility;
            
            // Update each layer's visibility in the renderer
            if (this.renderer) {
                for (let i = 0; i < this.MAX_LAYERS; i++) {
                    this.renderer.setLayerVisibility(i, layerVisibility[i]);
                }
            }
        });

        // Sync selected brush with selected tile
        $effect(() => {
            if (this.brushManager && editorStore.selectedTile >= 0) {
                const brushId = `tile_${editorStore.selectedTile}`;
                if (this.brushManager.getSelectedBrush()?.id !== brushId) {
                    this.brushManager.selectBrush(brushId);
                    console.log('MapEditor: Synced brush selection with editorStore tile:', editorStore.selectedTile, 'brushId:', brushId);
                    // Draw the palette when the selected brush changes
                    this.drawPalette();
                }
            }
        });

        // Log brush selection changes and update palette
        $effect(() => {
            if (this.brushManager) {
                const selectedBrush = this.brushManager.getSelectedBrush();
                console.log('MapEditor: Brush selection changed:', selectedBrush);
                // Draw the palette when the selected brush changes
                this.drawPalette();
            }
        });

        // Sync transform state
        $effect(() => {
            if (this.renderer) {
                this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
            }
        });
    }

    // Getters and setters that sync with FSMs
    get currentLayer() { return editorStore.currentLayer; }
    
    // Use the brushSize directly from editorStore without a setter
    get brushSize() { return editorStore.brushSize; }
    
    // Layer visibility methods - simplify to use editorStore directly
    isLayerVisible(layer: number): boolean {
        return editorStore.layerVisibility[layer];
    }
    
    // We can keep this method as a convenience wrapper
    toggleLayerVisibility(layer: number) {
        editorStore.toggleLayerVisibility(layer);
    }

    // Grid methods
    toggleGrid() {
        // Update local state
        this.showGrid = !this.showGrid;
        
        // Update the renderer with the new grid state
        if (this.renderer) {
            this.renderer.setShowGrid(this.showGrid);
        }
    }

    // Handle mouse wheel for zooming
    handleWheel(e: WheelEvent) {
        e.preventDefault();

        // Get mouse position before zoom using our helper function
        const { x: mouseX, y: mouseY } = this.calculateMouseCoordinates(e);

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

        // Update renderer transform
        if (this.renderer) {
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
        }
    }

    // Core rendering methods
    private animationLoop(timestamp: number) {
        // Calculate FPS with rolling average, exponential smoothing, and limits
        if (this.lastFrameTime) {
            const frameTime = timestamp - this.lastFrameTime;
            // Ignore unrealistic frame times
            if (frameTime >= 1 && frameTime <= 1000) {
                this.frameTimeHistory.push(frameTime);
                
                // Keep only the last N frames
                if (this.frameTimeHistory.length > this.FPS_SAMPLE_SIZE) {
                    this.frameTimeHistory.shift();
                }
                
                // Calculate average frame time, excluding outliers
                const sortedTimes = [...this.frameTimeHistory].sort((a, b) => a - b);
                const validTimes = sortedTimes.slice(
                    Math.floor(sortedTimes.length * 0.1),  // Skip bottom 10%
                    Math.ceil(sortedTimes.length * 0.9)    // Skip top 10%
                );
                const averageFrameTime = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length;
                
                // Calculate current FPS and apply limits
                const currentFps = Math.min(this.MAX_FPS, Math.max(this.MIN_FPS, 1000 / averageFrameTime));
                
                // Apply exponential smoothing
                if (this.smoothedFps === 0) {
                    this.smoothedFps = currentFps; // Initialize on first frame
                } else {
                    this.smoothedFps = this.FPS_SMOOTHING * this.smoothedFps + (1 - this.FPS_SMOOTHING) * currentFps;
                }
                
                this.fps = Math.round(this.smoothedFps);
            }
        }
        this.lastFrameTime = timestamp;

        // Update panning
        this.updatePanning();
        
        // Continue the loop - no need to do any drawing as that happens in the worker
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
            this.updatePanOffset(this.panVelocityX, this.panVelocityY);
        }
    }


    // Add this private method for calculating mouse coordinates
    private calculateMouseCoordinates(e: MouseEvent): { x: number, y: number } {
        const rect = this.canvas.getBoundingClientRect();
        // Calculate the scaling factor between the canvas's CSS size and its actual size
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        // Apply the scaling to get the correct coordinates
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;
        
        return { x: mouseX, y: mouseY };
    }

    // Mouse event handlers
    handleMouseDown(e: MouseEvent) {
        const { x: mouseX, y: mouseY } = this.calculateMouseCoordinates(e);

        // Middle click is always for panning
        if (e.button === 1) {
            e.preventDefault();
            this.isPanning = true;
            this.lastPanX = mouseX;
            this.lastPanY = mouseY;
            
            // Forward the event to the worker
            if (this.renderer) {
                this.renderer.handleMouseEvent('mousedown', {
                    x: mouseX,
                    y: mouseY,
                    button: e.button,
                    isPanning: true
                });
            }
            return;
        }

        // We now handle palette clicks separately in handlePaletteMouseDown
        // This method only needs to handle map clicks

        // Don't allow painting in "all layers" mode
        if (this.currentLayer === -1) {
            console.log('MapEditor: Cannot paint in "all layers" mode');
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
            // Update state in main thread
            if (e.button === 0 || e.button === 2) { // Left or right click
                // Store the initial state before painting
                if (!this.undoBuffer) {
                    this.undoBuffer = cloneMapData(this.mapData);
                    console.log('MapEditor: Created undo buffer for painting operation');
                }
                
                // Determine if we're erasing or painting
                const isErasing = e.button === 2;
                
                // Create a DrawOperation based on the current tool
                const operation = this.createDrawOperation(mapPos.x, mapPos.y, isErasing);
                
                // Start drawing using the unified method
                this.startDrawing(operation);
                
                // Store specific state based on tool type
                if (operation.type === 'ellipse' || operation.type === 'rectangle' || operation.type === 'line') {
                    this.drawStartX = mapPos.x;
                    this.drawStartY = mapPos.y;
                } else if (operation.type === 'brush') {
                    this.isPainting = true;
                }
            }
            
            // Forward mouse down event to worker
            if (this.renderer) {
                this.renderer.handleMouseEvent('mousedown', {
                    x: mouseX,
                    y: mouseY,
                    button: e.button,
                    mapX: mapPos.x,
                    mapY: mapPos.y
                });
            }
        } else {
            console.log('MapEditor: Click outside map bounds:', mapPos);
        }
    }

    // Add new private method for handling pan offset updates
    private updatePanOffset(deltaX: number, deltaY: number) {
        this.offsetX += deltaX;
        this.offsetY += deltaY;
            
        // Update renderer transform
        if (this.renderer) {
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
        }
    }

    handleMouseMove(e: MouseEvent) {
        const { x: mouseX, y: mouseY } = this.calculateMouseCoordinates(e);

        // Handle tile selection in palette (kept in main thread)
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
                    
                    console.log('DEBUG - Palette Mouse Move Selection:', { 
                        tileX: tilePos.tileX, 
                        tileY: tilePos.tileY, 
                        tileIndex, 
                        brushId,
                        tilemapWidth: this.tilemap.width
                    });
                    
                    this.brushManager?.selectBrush(brushId);
                    editorStore.selectTile(tileIndex);
                    
                    // Set the paintTile value directly to ensure consistency
                    this.paintTile = tileIndex;
                }
                
                // Force a redraw of the palette
                this.drawPalette();
            }
            return;
        }

        // Handle panning
        if (this.isPanning) {
            const deltaX = mouseX - this.lastPanX;
            const deltaY = mouseY - this.lastPanY;
            this.updatePanOffset(deltaX, deltaY);
            this.lastPanX = mouseX;
            this.lastPanY = mouseY;
            
            // Forward panning info to worker
            if (this.renderer) {
                this.renderer.handleMouseEvent('mousemove', {
                    x: mouseX,
                    y: mouseY,
                    isPanning: true,
                    mapX: -1,
                    mapY: -1
                });
            }
            return;
        }

        // Always update last known mouse position
        this.lastPanX = mouseX;
        this.lastPanY = mouseY;

        // Get current map dimensions for boundary checks
        const dimensions = this.getMapDimensions();
        
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
        if (isInMapBounds(mapPos.x, mapPos.y, dimensions)) {
            // Only update if the position has changed
            if (this.hoverX !== mapPos.x || this.hoverY !== mapPos.y) {
                this.hoverX = mapPos.x;
                this.hoverY = mapPos.y;
                
                // Forward mouse move with hover info to worker
                if (this.renderer) {
                    // Include drawing coordinates for shape previews
                    const previewData: any = {
                        x: mouseX,
                        y: mouseY,
                        mapX: mapPos.x,
                        mapY: mapPos.y
                    };
                    
                    // Add drawing-specific data if we're in a drawing operation
                    if (editorStore.isDrawing && this.drawStartX !== null && this.drawStartY !== null) {
                        // Add drawing tool info
                        previewData.drawStartX = this.drawStartX;
                        previewData.drawStartY = this.drawStartY;
                        
                        // Set the appropriate drawing flag based on the current tool
                        if (editorStore.currentTool === 'rectangle') {
                            previewData.drawRectangle = true;
                        } else if (editorStore.currentTool === 'ellipse') {
                            previewData.drawEllipse = true;
                        }
                        
                        // Add shift key state for constrained drawing
                        previewData.shiftKey = this.isShiftPressed;
                    }
                    
                    this.renderer.handleMouseEvent('mousemove', previewData);
                }
                
                // Handle painting during mouse move
                if (this.isPainting && isInMapBounds(mapPos.x, mapPos.y, dimensions)) {
                    const currentTool = editorStore.currentTool;
                    if (currentTool === 'fill' || currentTool === 'rectangle' || currentTool === 'ellipse' || currentTool === 'line') {
                        // Skip during flood fill and shape drawing
                        return;
                    }
                    
                    // Determine if we're erasing based on the paintTile value
                    const isErasing = this.paintTile === -1;
                    
                    // Check if the current tile already has the value we're trying to paint
                    // Only paint if the value is different to avoid redundant updates
                    const currentValue = this.mapData[this.currentLayer][mapPos.y][mapPos.x];
                    const newValue = isErasing ? -1 : this.paintTile;
                    
                    if (currentValue !== newValue) {
                        // Create a DrawOperation for brush painting
                        const operation = this.createDrawOperation(mapPos.x, mapPos.y, isErasing);
                        
                        // Use the renderer's draw method directly
                        if (this.renderer) {
                            this.renderer.draw(operation);
                        }
                        
                        // Mark as modified for undo/redo
                        this.hasModifiedDuringPaint = true;
                    }
                }
            }
        } else {
            if (this.hoverX !== -1 || this.hoverY !== -1) {
                this.hoverX = -1;
                this.hoverY = -1;
                
                // Forward mouse move with invalid hover info to worker
                if (this.renderer) {
                    this.renderer.handleMouseEvent('mousemove', {
                        x: mouseX,
                        y: mouseY,
                        mapX: -1,
                        mapY: -1
                    });
                }
            }
        }
    }

    handleMouseUp(e?: MouseEvent) {
        // If we have event coordinates, calculate them properly
        let mouseX = 0;
        let mouseY = 0;
        let mapX = -1;
        let mapY = -1;
        
        if (e) {
            const coords = this.calculateMouseCoordinates(e);
            mouseX = coords.x;
            mouseY = coords.y;
            
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
            
            mapX = mapPos.x;
            mapY = mapPos.y;
        }
        
        // Handle tile selection completion
        if (this.selectionStartX !== null && this.selectionStartY !== null) {
            // Tile selection handling - stay in main thread
            // ... existing selection code ...
            return;
        }

        // Forward mouse up to worker
        if (this.renderer) {
            this.renderer.handleMouseEvent('mouseup', {
                x: mouseX,
                y: mouseY,
                mapX,
                mapY,
                isPanning: this.isPanning
            });
        }

        // Handle rectangle drawing completion
        if (editorStore.isDrawing && 
            this.drawStartX !== null && 
            this.drawStartY !== null && 
            this.hoverX >= 0 && 
            this.hoverY >= 0 &&
            editorStore.currentTool === 'rectangle') {
            
            // Create a DrawOperation for rectangle completion
            const operation: DrawOperation = {
                type: 'rectangle',
                layer: this.currentLayer,
                startX: Math.min(this.drawStartX, this.hoverX),
                startY: Math.min(this.drawStartY, this.hoverY),
                endX: Math.max(this.drawStartX, this.hoverX),
                endY: Math.max(this.drawStartY, this.hoverY),
                tileIndex: this.paintTile !== null ? this.paintTile : 0,
                isErasing: this.paintTile === -1
            };
            
            // Use the renderer's draw method
            if (this.renderer) {
                this.renderer.draw(operation);
            }
            
            // Call stopDrawing to handle state cleanup
            this.stopDrawing();
        }
        // Handle ellipse drawing completion
        else if (editorStore.isDrawing && 
            this.drawStartX !== null && 
            this.drawStartY !== null && 
            this.hoverX >= 0 && 
            this.hoverY >= 0 &&
            editorStore.currentTool === 'ellipse') {
            
            // Create a DrawOperation for ellipse completion
            const operation: DrawOperation = {
                type: 'ellipse',
                layer: this.currentLayer,
                startX: this.drawStartX,
                startY: this.drawStartY,
                endX: this.hoverX,
                endY: this.hoverY,
                tileIndex: this.paintTile !== null ? this.paintTile : 0,
                isErasing: this.paintTile === -1
            };
            
            // Use the renderer's draw method
            if (this.renderer) {
                this.renderer.draw(operation);
            }
            
            // Call stopDrawing to handle state cleanup
            this.stopDrawing();
        }
        // Handle line drawing completion
        else if (editorStore.isDrawing && 
            this.drawStartX !== null && 
            this.drawStartY !== null && 
            this.hoverX >= 0 && 
            this.hoverY >= 0 &&
            editorStore.currentTool === 'line') {
            
            // Create a DrawOperation for line completion
            const operation: DrawOperation = {
                type: 'line',
                layer: this.currentLayer,
                startX: this.drawStartX,
                startY: this.drawStartY,
                endX: this.hoverX,
                endY: this.hoverY,
                tileIndex: this.paintTile !== null ? this.paintTile : 0,
                isErasing: this.paintTile === -1
            };
            
            // Use the renderer's draw method
            if (this.renderer) {
                this.renderer.draw(operation);
            }
            
            // Call stopDrawing to handle state cleanup
            this.stopDrawing();
        }

        // Reset drawing state
        this.drawStartX = null;
        this.drawStartY = null;

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

    // Keyboard event handlers
    handleKeyDown(e: KeyboardEvent) {
        // Skip handling if target is an input element
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        const key = e.key.toLowerCase();
        // Prevent default actions for arrow keys, space, and WASD
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'w', 'a', 's', 'd'].includes(key)) {
            e.preventDefault();
        }

        // Handle shift key state
        if (e.key === 'Shift') {
            this.isShiftPressed = true;
        }

        // Handle arrow keys for panning
        switch (e.key) {
            case 'ArrowLeft':
                this.keyPanState.left = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowRight':
                this.keyPanState.right = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowUp':
                this.keyPanState.up = true;
                this.isKeyPanning = true;
                break;
            case 'ArrowDown':
                this.keyPanState.down = true;
                this.isKeyPanning = true;
                break;
        }

        // Check for number keys (0-9) for layer selection
        if (/^[0-9]$/.test(e.key)) {
            const layer = e.key === '0' ? 9 : parseInt(e.key) - 1;
            // Only select layer if it's visible
            if (layer >= 0 && layer < this.MAX_LAYERS && editorStore.layerVisibility[layer]) {
                editorStore.selectLayer(layer);
            }
            return;
        }

        // Handle section key for all layers toggle
        if (e.key === '§') {
            // Toggle between all layers view and current layer
            editorStore.selectLayer(editorStore.currentLayer === -1 ? 0 : -1);
            return;
        }

        // Handle ESC key
        if (key === 'escape') {
            // Cancel drawing operations
            if (editorStore.isDrawing) {
                this.drawStartX = this.drawStartY = null;
                editorStore.cancelDrawing();
                
                // Notify worker to clear the preview
                if (this.renderer) {
                    this.renderer.clearBrushPreview();
                }
            }
            
            // Also cancel tile selection
            if (this.isSelectingTiles) {
                this.isSelectingTiles = false;
                this.selectionStartX = this.selectionStartY = null;
                this.selectionEndX = this.selectionEndY = null;
                
                // Force a redraw of the palette
                this.drawPalette();
            }
            
            return;
        }

        // Handle other tool shortcuts
        switch (key) {
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                } else {
                    // Update brush size directly through editorStore
                    editorStore.setBrushSize(Math.max(1, this.brushSize - 1));
                }
                break;
            case ' ':
                this.centerMap();
                break;
            case 'r':
                if (!e.ctrlKey && !e.metaKey) {
                    editorStore.selectTool('rectangle');
                }
                break;
            case 'f':
            case 'g':
                editorStore.selectTool('fill');
                break;
            case 'b':
                editorStore.selectTool('brush');
                break;
            case 'x':
                // Update brush size directly through editorStore
                editorStore.setBrushSize(this.brushSize + 1);
                break;
            case 'e':
                if (!e.ctrlKey && !e.metaKey) {
                    editorStore.selectTool('ellipse');
                }
                break;
            case 'l':
                if (!e.ctrlKey && !e.metaKey) {
                    editorStore.selectTool('line');
                }
                break;
        }

        // WASD for tile palette navigation
        if (this.paletteManager && this.brushManager && !e.ctrlKey && !e.metaKey) {
            // Only process WASD keys for palette navigation
            if (!['w', 'a', 's', 'd'].includes(key)) {
                // Skip non-WASD keys for palette navigation
                this.forwardKeyEvent(e);
                return;
            }

            // Get the currently selected brush
            const selectedBrush = this.brushManager.getSelectedBrush();
            if (!selectedBrush) {
                this.forwardKeyEvent(e);
                return;
            }
            
            // Log the current selection before navigation
            console.log('WASD Navigation - Current selection:', {
                brushId: selectedBrush.id,
                isBuiltIn: selectedBrush.isBuiltIn,
                selectedTile: editorStore.selectedTile
            });
            
            // Map WASD keys to directions
            let direction: 'up' | 'down' | 'left' | 'right';
            switch (key) {
                case 'w': direction = 'up'; break;
                case 'a': direction = 'left'; break;
                case 's': direction = 'down'; break;
                case 'd': direction = 'right'; break;
                default: 
                    this.forwardKeyEvent(e);
                    return;
            }
            
            // Use the new navigateBrushGrid method to find the next brush
            const nextBrushId = this.paletteManager.navigateBrushGrid(selectedBrush.id, direction);
            
            // Update the selection if a new brush was found
            if (nextBrushId && this.brushManager) {
                const brush = this.brushManager.getBrush(nextBrushId);
                if (brush) {
                    // Use editorStore to select the brush
                    editorStore.selectCustomBrush(nextBrushId);
                    
                    // If it's a built-in brush, update the selected tile
                    if (brush.isBuiltIn) {
                        const tileId = parseInt(brush.id.replace('tile_', ''));
                        editorStore.selectTile(tileId);
                        
                        // Also update this.paintTile to ensure consistency
                        this.paintTile = tileId;
                        
                        // Log the new selection
                        console.log('WASD Navigation - Selected built-in brush:', {
                            brushId: nextBrushId,
                            tileId: tileId,
                            paintTile: this.paintTile,
                            selectedTile: tileId
                        });
                    } else {
                        // It's a custom brush - no need to set isCustomBrushMode as it's derived from the selected brush
                        
                        // Log the new selection
                        console.log('WASD Navigation - Selected custom brush:', {
                            brushId: nextBrushId,
                            isCustomBrushMode: this.isCustomBrushMode
                        });
                    }
                    
                    // Redraw the palette
                    this.drawPalette();
                }
            }
        }
        
        this.forwardKeyEvent(e);
        return;
    }

    handleKeyUp(e: KeyboardEvent) {
        const key = e.key.toLowerCase();
        
        // Always handle shift key state
        if (e.key === 'Shift') {
            this.isShiftPressed = false;
        }
        
        // Handle arrow keys for panning
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
        
        // Forward key events to the worker
        if (this.renderer) {
            this.renderer.handleKeyEvent('keyup', {
                key,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey
            });
        }
    }

    async newMap(width: number, height: number) {
        if (!validateMapDimensions(width, height)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        // Save current state to undo stack
        this.undoStack.push(cloneMapData(this.mapData));
        
        // Create and apply new map
        this.mapData = createEmptyMap(width, height, this.MAX_LAYERS);
        this.redoStack = [];

        // Reset view transform
        this.offsetX = 0;
        this.offsetY = 0;

        // Reinitialize the renderer with new dimensions
        if (this.renderer) {
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
            await this.renderer.initialize(
                width,
                height,
                this.tilemap.tileWidth,
                this.tilemap.tileHeight,
                this.tilemap.spacing,
                this.tilemapUrl,
                width * this.tilemap.tileWidth, // Canvas width
                height * this.tilemap.tileHeight, // Canvas height
                this.mapData
            );
            this.centerMap();
            this.renderer.redrawAll();
        }
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

            // Reinitialize the renderer with new map data
            if (this.renderer) {
                await this.renderer.initialize(
                    this.mapData[0][0].length,
                    this.mapData[0].length,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.tilemap.spacing,
                    this.tilemapUrl,
                    this.canvas.width,  // Use current canvas width
                    this.canvas.height, // Use current canvas height
                    this.mapData
                );
            }

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
        
        // Use editorStore to select the brush
        editorStore.selectCustomBrush(brush.id);
        
        console.log('Selected brush:', this.brushManager.getSelectedBrush());

        // Reset selection state
        this.isSelectingTiles = false;
        this.selectionStartX = null;
        this.selectionStartY = null;
        this.selectionEndX = null;
        this.selectionEndY = null;
    }

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
        // Use editorStore to select the brush
        editorStore.selectCustomBrush(brushId);
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
        editorStore.selectTile(0);

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
    async undo() {
        if (this.undoStack.length > 0) {
            // Save current state to redo stack
            this.redoStack.push(cloneMapData(this.mapData));
            
            // Pop and apply the last state from undo stack
            const previousState = this.undoStack.pop()!;
            this.mapData = cloneMapData(previousState);

            // Reset view transform
            this.offsetX = 0;
            this.offsetY = 0;

            // Update renderer with the new state
            if (this.renderer) {
                this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
                await this.renderer.initialize(
                    this.mapData[0][0].length,
                    this.mapData[0].length,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.tilemap.spacing,
                    this.tilemapUrl,
                    this.canvas.width,  // Use current canvas width
                    this.canvas.height, // Use current canvas height
                    this.mapData
                );
                this.centerMap();
                this.renderer.redrawAll();
            }
        }
    }

    async redo() {
        if (this.redoStack.length > 0) {
            // Save current state to undo stack
            this.undoStack.push(cloneMapData(this.mapData));
            
            // Pop and apply the last state from redo stack
            const nextState = this.redoStack.pop()!;
            this.mapData = cloneMapData(nextState);

            // Reset view transform
            this.offsetX = 0;
            this.offsetY = 0;

            // Update renderer with the new state
            if (this.renderer) {
                this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
                await this.renderer.initialize(
                    this.mapData[0][0].length,
                    this.mapData[0].length,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.tilemap.spacing,
                    this.tilemapUrl,
                    this.canvas.width,  // Use current canvas width
                    this.canvas.height, // Use current canvas height
                    this.mapData
                );
                this.centerMap();
                this.renderer.redrawAll();
            }
        }
    }

    // Map dimensions helper
    getMapDimensions(): MapDimensions {
        return {
            width: this.mapData[0][0].length,
            height: this.mapData[0].length,
            layers: this.mapData.length
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
        
        console.log('MapEditor: Centering map with values:', {
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            mapWidth: this.mapData[0][0].length,
            mapHeight: this.mapData[0].length,
            tileWidth: this.tilemap.tileWidth,
            tileHeight: this.tilemap.tileHeight,
            zoomLevel: this.zoomLevel,
            centerX: center.x,
            centerY: center.y
        });
        
        this.offsetX = center.x;
        this.offsetY = center.y;

        // Update renderer transform after centering
        if (this.renderer) {
            console.log('MapEditor: Updating transform with:', {
                offsetX: this.offsetX,
                offsetY: this.offsetY,
                zoomLevel: this.zoomLevel
            });
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
        }
    }

    // Resize the map to new dimensions
    async resizeMap(newWidth: number, newHeight: number, alignment: ResizeAlignment = 'middle-center') {
        if (!validateMapDimensions(newWidth, newHeight)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        console.log('MapEditor: Resizing map to', { 
            newWidth, 
            newHeight, 
            alignment,
            oldWidth: this.mapData[0][0].length,
            oldHeight: this.mapData[0].length
        });

        // Save current state to undo stack
        this.undoStack.push(cloneMapData(this.mapData));
        
        // Get current dimensions
        const oldWidth = this.mapData[0][0].length;
        const oldHeight = this.mapData[0].length;
        
        // Create a new map with the new dimensions
        const newMapData = createEmptyMap(newWidth, newHeight, this.MAX_LAYERS);
        
        // Calculate offsets based on alignment
        let offsetX = 0;
        let offsetY = 0;
        
        // Parse the alignment string to determine horizontal and vertical alignment
        const [verticalPart, horizontalPart] = alignment.split('-');
        
        // Handle horizontal alignment
        switch (horizontalPart) {
            case 'left':
                offsetX = 0;
                break;
            case 'center':
                offsetX = Math.floor((newWidth - oldWidth) / 2);
                break;
            case 'right':
                offsetX = newWidth - oldWidth;
                break;
        }
        
        // Handle vertical alignment
        switch (verticalPart) {
            case 'top':
                offsetY = 0;
                break;
            case 'middle':
                offsetY = Math.floor((newHeight - oldHeight) / 2);
                break;
            case 'bottom':
                offsetY = newHeight - oldHeight;
                break;
        }
        
        // Ensure offsets are within valid range
        offsetX = Math.max(0, offsetX);
        offsetY = Math.max(0, offsetY);
        
        console.log('MapEditor: Calculated offsets for resize:', { offsetX, offsetY });
        
        // Copy data from old map to new map, preserving as much content as possible
        for (let layer = 0; layer < this.MAX_LAYERS; layer++) {
            for (let y = 0; y < oldHeight; y++) {
                if (y + offsetY >= newHeight) continue;
                
                for (let x = 0; x < oldWidth; x++) {
                    if (x + offsetX >= newWidth) continue;
                    
                    // Copy the tile from old to new map
                    newMapData[layer][y + offsetY][x + offsetX] = this.mapData[layer][y][x];
                }
            }
        }
        
        // Apply the new map data
        this.mapData = newMapData;
        this.redoStack = [];  // Clear redo stack

        // Create new shared map data with new dimensions
        if (this.sharedMapData) {
            console.log('MapEditor: Creating new SharedMapData with dimensions:', { 
                width: newWidth, 
                height: newHeight,
                layers: this.MAX_LAYERS
            });
            
            this.sharedMapData = new SharedMapData(
                newWidth,
                newHeight,
                this.MAX_LAYERS,
                this.mapData,
                this.tilemap.tileWidth,
                this.tilemap.tileHeight
            );
        }

        // Update the renderer with the new map dimensions
        if (this.renderer) {
            // Reset transform to avoid issues
            this.offsetX = 0;
            this.offsetY = 0;
            
            console.log('MapEditor: Telling worker about new map dimensions');
            
            // Instead of reinitializing, send a special message to update dimensions
            await this.renderer.updateMapDimensions(
                newWidth,
                newHeight,
                this.sharedMapData ? this.sharedMapData.getBuffer() : undefined,
                this.sharedMapData ? this.sharedMapData.getUpdateFlagsBuffer() : undefined
            );
            
            // Update the transform after updating dimensions
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
            
            // Center the map and force a redraw
            this.centerMap();
            this.renderer.redrawAll();
        }
        
        console.log('MapEditor: Map resized successfully');
        return true;
    }

    // Initialize the editor
    async init() {
        console.log('MapEditor: Initializing');
        
        try {
            // Load the tilemap first
            await this.tilemap.load();
            
            // Initialize managers after tilemap is loaded
            this.brushManager = new BrushManager(this.tilemap);
            this.paletteManager = new PaletteManager(this.tilemap, this.brushManager);
            
            // Draw the palette immediately after tilemap is loaded
            this.drawPalette();
            
            if (!this.canvas) {
                console.warn('MapEditor: No canvas element');
                return;
            }

            // Calculate the initial size for the canvas
            const container = this.canvas.parentElement;
            let initialWidth = 800;
            let initialHeight = 600;
            
            if (container) {
                const style = window.getComputedStyle(container);
                initialWidth = container.clientWidth 
                    - parseFloat(style.paddingLeft) 
                    - parseFloat(style.paddingRight);
                initialHeight = container.clientHeight 
                    - parseFloat(style.paddingTop) 
                    - parseFloat(style.paddingBottom);
            }

            // Set initial canvas styles and dimensions
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.width = initialWidth;
            this.canvas.height = initialHeight;
            
            // Log initial canvas dimensions
            this.logCanvasDimensions('Initial canvas dimensions');

            // Initialize the renderer
            this.renderer = new OptimizedRenderer(this.canvas, this.renderSettings.debugMode);
            
            // Apply render settings
            this.renderer.updateRenderSettings(this.renderSettings);
            
            // Get map dimensions
            const dimensions = this.getMapDimensions();
            
            // Create shared map data if not already created
            if (!this.sharedMapData) {
                this.sharedMapData = new SharedMapData(
                    dimensions.width,
                    dimensions.height,
                    this.MAX_LAYERS,
                    this.mapData,
                    this.tileWidth,
                    this.tileHeight
                );
            }
            
            // Create a promise that will resolve when worker initialization is complete
            const initPromise = new Promise<void>((resolve) => {
                if (this.renderer) {
                    this.renderer.onInitComplete(() => {
                        console.log('MapEditor: Worker initialization completed');
                        resolve();
                    });
                } else {
                    resolve(); // Resolve immediately if renderer is not available
                }
            });
            
            // Initialize the renderer with map dimensions, tile properties, and initial canvas size
            await this.renderer.initialize(
                dimensions.width,
                dimensions.height,
                this.tileWidth,
                this.tileHeight,
                this.tileSpacing,
                this.tilemapUrl,
                initialWidth,
                initialHeight,
                this.mapData,
                this.sharedMapData.getBuffer() // Pass the shared buffer
            );

            // Wait for worker to complete initialization
            await initPromise;

            // Set initial transform - this must be done AFTER worker initialization
            console.log('MapEditor: Setting initial transform');
            this.renderer.updateTransform(0, 0, this.zoomLevel);

            console.log('MapEditor: Initialized renderer with dimensions:', {
                width: dimensions.width,
                height: dimensions.height,
                tileWidth: this.tileWidth,
                tileHeight: this.tileHeight,
                spacing: this.tileSpacing,
                tilemapUrl: this.tilemapUrl,
                mapDataSize: this.mapData.length,
                canvasWidth: initialWidth,
                canvasHeight: initialHeight
            });

            // Select first tile
            editorStore.selectTile(0); // Use tile 0 as the initial selection
            
            // Also select the corresponding brush
            if (this.brushManager) {
                this.brushManager.selectBrush('tile_0');
                console.log('MapEditor: Selected default brush tile_0');
            }

            // Set up layer visibility in the worker
            for (let i = 0; i < this.MAX_LAYERS; i++) {
                this.renderer.setLayerVisibility(i, editorStore.layerVisibility[i]);
            }

            // Set initial grid visibility in the worker
            this.renderer.setShowGrid(this.showGrid);

            // Enable continuous animation for smooth rendering
            this.renderer.setContinuousAnimation(true);

            // Center the map AFTER worker initialization
            console.log('MapEditor: Centering map after worker initialization');
            this.centerMap();

            // Draw the palette
            this.drawPalette();

            // Start the animation loop for handling panning and other state updates
            requestAnimationFrame(this.animationLoop.bind(this));
        } catch (error) {
            console.error('MapEditor: Failed to initialize:', error);
        }
    }

    // Handle window resize
    resize() {
        const container = this.canvas.parentElement;
        if (!container) return;

        // Get the computed style of the container
        const style = window.getComputedStyle(container);
        
        // Log dimensions before resize
        this.logCanvasDimensions('Before resize');
        
        // Calculate the content area by subtracting padding and borders
        const width = container.clientWidth 
            - parseFloat(style.paddingLeft) 
            - parseFloat(style.paddingRight);
        const height = container.clientHeight 
            - parseFloat(style.paddingTop) 
            - parseFloat(style.paddingBottom);

        if (width <= 0 || height <= 0) {
            console.warn('MapEditor: Parent container has zero or negative content area');
            return;
        }
        
        // Log the dimensions before changing anything
        console.log('MapEditor: Resizing canvas', {
            containerClientWidth: container.clientWidth,
            containerClientHeight: container.clientHeight,
            paddingLeft: parseFloat(style.paddingLeft),
            paddingRight: parseFloat(style.paddingRight),
            paddingTop: parseFloat(style.paddingTop),
            paddingBottom: parseFloat(style.paddingBottom),
            calculatedWidth: width,
            calculatedHeight: height,
            currentCanvasWidth: this.canvas.width,
            currentCanvasHeight: this.canvas.height,
            currentStyleWidth: this.canvas.style.width,
            currentStyleHeight: this.canvas.style.height
        });
        
        // Set canvas CSS size to match container's content area
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        
        // Note: We don't set canvas.width and canvas.height directly anymore
        // because the canvas has been transferred to the worker
        // Instead, we notify the worker to resize the OffscreenCanvas
        
        // Log the dimensions after changing
        console.log('MapEditor: Canvas resized', {
            newStyleWidth: this.canvas.style.width,
            newStyleHeight: this.canvas.style.height,
            boundingClientRect: this.canvas.getBoundingClientRect()
        });
        
        // Update renderer size and force a redraw
        if (this.renderer) {
            this.renderer.resize(width, height);
            
            // Update the transform to ensure proper alignment
            this.renderer.updateTransform(this.offsetX, this.offsetY, this.zoomLevel);
            
            // Force a complete redraw to ensure everything is visible
            this.renderer.redrawAll();
        }

        // Re-center the map after resize
        this.centerMap();
        
        // Log dimensions after resize
        this.logCanvasDimensions('After resize');

        // Also resize the preview canvas
        if (this.previewCanvas) {
            this.previewCanvas.width = width;
            this.previewCanvas.height = height;
            
            // Update position
            const rect = this.canvas.getBoundingClientRect();
            this.previewCanvas.style.left = `${rect.left}px`;
            this.previewCanvas.style.top = `${rect.top}px`;
            this.previewCanvas.style.width = `${rect.width}px`;
            this.previewCanvas.style.height = `${rect.height}px`;
            
            // Reset image smoothing
            if (this.previewCtx) {
                this.previewCtx.imageSmoothingEnabled = false;
            }
        }
        
        // Redraw the palette
        this.drawPalette();
    }

    destroy() {
        // Clean up event listeners
        if (this.canvas) {
            this.canvas.removeEventListener('wheel', this.boundHandleWheel);
            this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
            this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
            window.removeEventListener('mouseup', this.boundHandleMouseUp);
            window.removeEventListener('keydown', this.boundHandleKeyDown);
            window.removeEventListener('keyup', this.boundHandleKeyUp);
            window.removeEventListener('resize', this.boundResize);
        }

        // Remove the preview canvas
        if (this.previewCanvas && this.previewCanvas.parentElement) {
            this.previewCanvas.parentElement.removeChild(this.previewCanvas);
            this.previewCanvas = null;
            this.previewCtx = null;
        }
        
        // Remove the palette canvas
        if (this.paletteCanvas && this.paletteCanvas.parentElement) {
            this.paletteCanvas.parentElement.removeChild(this.paletteCanvas);
            this.paletteCanvas = null;
            this.paletteCtx = null;
        }

        // Clean up renderer
        if (this.renderer) {
            this.renderer.destroy();
            this.renderer = null;
        }
    }

    // Add a debug method to log canvas dimensions
    private logCanvasDimensions(message: string = 'Canvas dimensions') {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        if (!container) return;
        
        const style = window.getComputedStyle(container);
        const rect = this.canvas.getBoundingClientRect();
        
        console.log(`MapEditor: ${message}`, {
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            canvasStyleWidth: this.canvas.style.width,
            canvasStyleHeight: this.canvas.style.height,
            canvasBoundingRect: rect,
            containerWidth: container.clientWidth,
            containerHeight: container.clientHeight,
            containerPadding: {
                left: parseFloat(style.paddingLeft),
                right: parseFloat(style.paddingRight),
                top: parseFloat(style.paddingTop),
                bottom: parseFloat(style.paddingBottom)
            },
            containerStyle: {
                width: style.width,
                height: style.height,
                position: style.position,
                display: style.display
            },
            scaleFactors: {
                x: this.canvas.width / rect.width,
                y: this.canvas.height / rect.height
            }
        });
    }

    // Create a separate canvas for previews
    private createPreviewCanvas() {
        // Create a preview canvas for brush overlays
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.style.position = 'absolute';
        this.previewCanvas.style.pointerEvents = 'none'; // Make it transparent to mouse events
        this.previewCanvas.style.zIndex = '10'; // Make sure it's above the main canvas
        
        // Make it the same size as the main canvas
        this.previewCanvas.width = this.canvas.width;
        this.previewCanvas.height = this.canvas.height;
        
        // Get the context for drawing previews
        this.previewCtx = this.previewCanvas.getContext('2d')!;
        this.previewCtx.imageSmoothingEnabled = false;
        
        // Add it to the DOM right after the main canvas
        if (this.canvas.parentElement) {
            this.canvas.parentElement.insertBefore(this.previewCanvas, this.canvas.nextSibling);
            
            // Position it over the main canvas
            const rect = this.canvas.getBoundingClientRect();
            this.previewCanvas.style.left = `${rect.left}px`;
            this.previewCanvas.style.top = `${rect.top}px`;
            this.previewCanvas.style.width = `${rect.width}px`;
            this.previewCanvas.style.height = `${rect.height}px`;
        }
    }

    // Create a separate canvas for the palette
    private createPaletteCanvas() {
        // Create a palette canvas
        this.paletteCanvas = document.createElement('canvas');
        this.paletteCanvas.style.position = 'absolute';
        this.paletteCanvas.style.left = '10px';  // Position it on the left
        this.paletteCanvas.style.top = '10px';   // with a small margin from the top
        this.paletteCanvas.style.zIndex = '20';  // Make sure it's above everything else
        this.paletteCanvas.style.background = '#333'; // Add background color
        this.paletteCanvas.style.border = '1px solid #555'; // Add border
        
        // Set initial size - we'll adjust this based on content later
        this.paletteCanvas.width = 300;  // Default width
        this.paletteCanvas.height = 500; // Default height
        
        // Get the context for drawing the palette
        this.paletteCtx = this.paletteCanvas.getContext('2d', { alpha: false })!; // Use non-alpha context for better performance
        this.paletteCtx.imageSmoothingEnabled = false;
        
        // Add it to the DOM as a sibling to the main canvas
        if (this.canvas.parentElement) {
            this.canvas.parentElement.appendChild(this.paletteCanvas);
        }
        
        // Add event listeners for palette interaction
        this.paletteCanvas.addEventListener('mousedown', this.handlePaletteMouseDown.bind(this));
        this.paletteCanvas.addEventListener('mousemove', this.handlePaletteMouseMove.bind(this));
        this.paletteCanvas.addEventListener('mouseup', this.handlePaletteMouseUp.bind(this));
        
        // Also prevent context menu on the palette canvas
        this.paletteCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        console.log('MapEditor: Created palette canvas');
    }

    // Handle mouse events on the palette canvas
    private handlePaletteMouseDown(e: MouseEvent) {
        if (!this.paletteManager) return;
        
        const rect = this.paletteCanvas!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        console.log('MapEditor: Palette mouse down at', x, y);
        
        if (e.button === 0) { // Left click
            // Get the tile position from the coordinates
            const tilePos = this.paletteManager.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                // Start tile selection
                this.selectionStartX = tilePos.tileX;
                this.selectionStartY = tilePos.tileY;
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;
                
                // Select the single tile initially
                const tileIndex = tilePos.tileY * this.tilemap.width + tilePos.tileX;
                const brushId = `tile_${tileIndex}`;
                
                console.log('DEBUG - Palette Selection:', { 
                    tileX: tilePos.tileX, 
                    tileY: tilePos.tileY, 
                    tileIndex, 
                    brushId,
                    tilemapWidth: this.tilemap.width,
                    calculatedX: tileIndex % this.tilemap.width,
                    calculatedY: Math.floor(tileIndex / this.tilemap.width)
                });
                
                // Get the actual tile from the tilemap to verify it exists
                const tileCanvas = this.tilemap.getTile(tileIndex);
                if (tileCanvas) {
                    console.log('DEBUG - Tile exists in tilemap:', { tileIndex });
                } else {
                    console.warn('DEBUG - Tile does NOT exist in tilemap:', { tileIndex });
                }
                
                if (this.brushManager) {
                    // Use editorStore to select the brush
                    editorStore.selectCustomBrush(brushId);
                    
                    // Set the paintTile value directly to ensure consistency
                    this.paintTile = tileIndex;
                }
                
                editorStore.selectTile(tileIndex);
                
                // Redraw the palette to show the selection
                this.drawPalette();
            } else {
                // Handle click on custom brushes or other elements
                this.paletteManager.handlePaletteClick(x, y);
            }
        } else if (e.button === 2) { // Right click
            this.paletteManager.handlePaletteRightClick(x, y);
            // Prevent the context menu
            e.preventDefault();
        }
    }

    private handlePaletteMouseMove(e: MouseEvent) {
        if (!this.paletteManager) return;
        
        const rect = this.paletteCanvas!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isSelectingTiles && this.selectionStartX !== null && this.selectionStartY !== null) {
            const tilePos = this.paletteManager.getTileFromPaletteCoords(x, y);
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
                    
                    console.log('DEBUG - Palette Mouse Move Selection:', { 
                        tileX: tilePos.tileX, 
                        tileY: tilePos.tileY, 
                        tileIndex, 
                        brushId,
                        tilemapWidth: this.tilemap.width
                    });
                    
                    this.brushManager?.selectBrush(brushId);
                    editorStore.selectTile(tileIndex);
                    
                    // Set the paintTile value directly to ensure consistency
                    this.paintTile = tileIndex;
                }
                
                // Force a redraw of the palette
                this.drawPalette();
            }
        }
    }

    private handlePaletteMouseUp(e: MouseEvent) {
        if (!this.paletteManager) return;
        
        // If we've been selecting tiles, create a custom brush
        if (this.isSelectingTiles && 
            this.selectionStartX !== null && this.selectionStartY !== null &&
            this.selectionEndX !== null && this.selectionEndY !== null) {
            
            // Create a custom brush from the selection
            this.createTemporaryBrushFromSelection();
            
            // Reset selection state
            this.isSelectingTiles = false;
            this.selectionStartX = null;
            this.selectionStartY = null;
            this.selectionEndX = null;
            this.selectionEndY = null;
            
            // Force a redraw of the palette
            this.drawPalette();
        }
    }

    // Main method to draw the palette
    private drawPalette() {
        if (!this.paletteCanvas || !this.paletteCtx || !this.paletteManager) {
            console.warn('MapEditor: Cannot draw palette - missing canvas, context, or manager');
            return;
        }
        
        if (!this.tilemap.isLoaded()) {
            console.warn('MapEditor: Cannot draw palette - tilemap not loaded');
            
            // Draw a loading message
            this.paletteCtx.fillStyle = '#333';
            this.paletteCtx.fillRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
            this.paletteCtx.fillStyle = '#fff';
            this.paletteCtx.font = '16px Arial';
            this.paletteCtx.textAlign = 'center';
            this.paletteCtx.fillText('Loading tilemap...', this.paletteCanvas.width / 2, 50);
            return;
        }
        
        console.log('MapEditor: Drawing palette with dimensions:', {
            width: this.paletteCanvas.width,
            height: this.paletteCanvas.height,
            tilemapWidth: this.tilemap.width,
            tilemapHeight: this.tilemap.height
        });
        
        // Clear the canvas with background color
        this.paletteCtx.fillStyle = '#333';
        this.paletteCtx.fillRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
        
        // Draw the palette using the PaletteManager
        this.paletteManager.drawPalette(this.paletteCtx);
        
        // Update the canvas size based on the palette height
        const paletteHeight = this.paletteManager.getPaletteHeight();
        const neededWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) + 40;
        
        // Log the palette dimensions
        console.log('MapEditor: Palette dimensions:', {
            paletteHeight,
            tilemapWidth: this.tilemap.width,
            tilemapHeight: this.tilemap.height,
            tileWidth: this.tilemap.tileWidth,
            tileHeight: this.tilemap.tileHeight,
            currentPaletteWidth: this.paletteCanvas.width,
            neededWidth
        });
        
        // Update the palette size if needed
        if (neededWidth > 0 && this.paletteCanvas.width !== neededWidth) {
            this.paletteCanvas.width = neededWidth;
            // Need to reset context properties after canvas resize
            this.paletteCtx.imageSmoothingEnabled = false;
            // Redraw after resizing
            this.paletteCtx.fillStyle = '#333';
            this.paletteCtx.fillRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
            this.paletteManager.drawPalette(this.paletteCtx);
        }
        
        if (paletteHeight > 0 && this.paletteCanvas.height !== paletteHeight) {
            this.paletteCanvas.height = paletteHeight;
            // Need to reset context properties after canvas resize
            this.paletteCtx.imageSmoothingEnabled = false;
            // Redraw after resizing
            this.paletteCtx.fillStyle = '#333';
            this.paletteCtx.fillRect(0, 0, this.paletteCanvas.width, this.paletteCanvas.height);
            this.paletteManager.drawPalette(this.paletteCtx);
        }
    }

    // Helper to forward keyboard events to the worker
    private forwardKeyEvent(e: KeyboardEvent) {
        if (this.renderer) {
            this.renderer.handleKeyEvent('keydown', {
                key: e.key.toLowerCase(),
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey
            });
        }
    }

    // Update render settings
    updateRenderSettings(settings: RenderSettings) {
        console.log('MapEditor: Updating render settings:', settings);
        this.renderSettings = { ...settings };
        
        // Apply settings to renderer
        if (this.renderer) {
            this.renderer.updateRenderSettings(settings);
        }
    }

    // Unified drawing methods
    startDrawing(operation: DrawOperation) {
        console.log('MapEditor: Starting drawing operation:', operation);
        
        // Store the initial state for undo
        if (!this.undoBuffer) {
            this.undoBuffer = cloneMapData(this.mapData);
            console.log('MapEditor: Created undo buffer for drawing operation');
        }
        
        // Set the paintTile value
        this.paintTile = operation.isErasing ? -1 : operation.tileIndex;
        
        // Update FSM state if needed
        if (operation.type !== 'brush' && !editorStore.isDrawing) {
            // Start a new drawing operation in the FSM
            editorStore.startDrawing(operation);
        }
        
        // Forward to renderer if available
        if (this.renderer) {
            this.renderer.draw(operation);
        }
    }
    
    stopDrawing() {
        console.log('MapEditor: Stopping drawing operation');
        
        // Handle completion based on current state
        editorStore.stopDrawing();
        
        // If we modified anything during this operation, save the state
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
        
        // Reset painting state
        this.isPainting = false;
        this.paintTile = null;
    }
    
    cancelDrawing() {
        console.log('MapEditor: Canceling drawing operation');
        
        // Reset undo buffer without saving
        this.undoBuffer = null;
        this.hasModifiedDuringPaint = false;
        
        // Reset painting state
        this.isPainting = false;
        this.paintTile = null;
        
        // Reset drawing coordinates
        this.drawStartX = null;
        this.drawStartY = null;
        
        // Update FSM state
        editorStore.cancelDrawing();
        
        // Clear brush preview in renderer
        if (this.renderer) {
            this.renderer.clearBrushPreview();
        }
    }

    // Create a DrawOperation based on the current tool and coordinates
    createDrawOperation(mapX: number, mapY: number, isErasing: boolean): DrawOperation {
        // Determine the tile index to use
        let tileIndex = -1;
        if (!isErasing) {
            // Use the selected tile
            const selectedBrush = this.brushManager?.getSelectedBrush();
            if (selectedBrush && selectedBrush.isBuiltIn) {
                tileIndex = parseInt(selectedBrush.id.replace('tile_', ''));
            } else {
                tileIndex = editorStore.selectedTile;
            }
            
            // Ensure valid tile index
            if (tileIndex < 0) {
                tileIndex = 0; // Default to tile 0
            }
        }
        
        // Create the operation based on the current tool
        const operation: DrawOperation = {
            type: editorStore.currentTool,
            layer: this.currentLayer,
            startX: mapX,
            startY: mapY,
            tileIndex,
            isErasing,
            brushSize: this.brushSize
        };
        
        console.log(`MapEditor: Created ${operation.type} operation:`, operation);
        
        return operation;
    }
}

// Export the singleton instance
export const mapEditor = {
    get instance() { return editor; }
}; 