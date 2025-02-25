import type { RenderSettings } from '../utils/settings.js';
import type { DrawOperation, BrushPatternSource } from '../utils/drawing.js';
import type { Point, Rect } from '../utils/coordinates.js';

// Calculate brush area
function calculateBrushArea(x: number, y: number, size: number): Rect {
    // For odd sizes, center on the tile
    // For even sizes, align with top-left corner
    const offset = size % 2 === 0 ? 0 : Math.floor(size / 2);
    
    return {
        x: x - offset,
        y: y - offset,
        width: size,
        height: size
    };
}

// Get points along a line using Bresenham's algorithm
function getLinePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
    const points: Point[] = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
        points.push({ x: x0, y: y0 });
        
        if (x0 === x1 && y0 === y1) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
    
    return points;
}

// Get ellipse points using a midpoint ellipse algorithm
function getEllipsePoints(centerX: number, centerY: number, radiusX: number, radiusY: number): Point[] {
    // Use a Set to track unique points using string keys
    const pointSet = new Set<string>();
    const points: Point[] = [];
    
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

class RenderWorker {
    // The canvas from the main thread
    private canvas!: OffscreenCanvas;
    private ctx!: OffscreenCanvasRenderingContext2D;
    
    // Map dimensions
    private tileWidth: number = 0;
    private tileHeight: number = 0;
    private tileSpacing: number = 0;
    private mapWidth: number = 0;
    private mapHeight: number = 0;
    
    // Tilemap and tile cache
    private tilemapImage: ImageBitmap | null = null;
    private tileCache: Map<number, ImageBitmap> = new Map();
    // Add tile source coordinates cache for direct atlas usage
    private tileSourceCoords: Map<number, {x: number, y: number}> = new Map();
    // Flag to determine which rendering approach to use
    private useDirectAtlas = true;
    
    // Shared map data
    private sharedMapData: Int32Array | null = null;
    private layerCount: number = 0;
    private updateFlags: Int32Array | null = null;
    
    // Layer buffer canvases for optimization
    private layerBuffers: OffscreenCanvas[] = [];
    private layerContexts: OffscreenCanvasRenderingContext2D[] = [];
    private layerDirty: boolean[] = [];
    
    // For animation frame handling
    private animationFrameId: number | null = null;
    private isRunning: boolean = false;
    private continuousAnimation: boolean = true; // Always animate (for smoother fps)
    private frameCount: number = 0; // Track number of frames rendered
    
    // For transforms
    private transform: { offsetX: number; offsetY: number; zoom: number } = {
        offsetX: 0,
        offsetY: 0,
        zoom: 1
    };

    // For brush preview
    private brushPreview: {
        active: boolean;
        x: number;
        y: number;
        brushSize: number;
        brushType: string;
        tileIndex: number;
        previewData?: any;
        drawEllipse?: boolean;
        drawRectangle?: boolean;
        drawStartX?: number;
        drawStartY?: number;
        shiftKey?: boolean;
    } = {
        active: false,
        x: -1,
        y: -1,
        brushSize: 1,
        brushType: 'normal',
        tileIndex: 0,
        shiftKey: false
    };

    // Grid display
    private showGrid: boolean = true;
    private gridColor: string = 'rgba(255, 255, 255, 0.2)';

    // Layer visibility
    private layerVisibility: boolean[] = [];

    // Performance monitoring
    private fpsHistory: number[] = [];
    private lastFrameTime: number = 0;
    private fps: number = 0;

    // Debug settings
    private debugMode: boolean = false;

    // Viewport tracking for optimization
    private viewport: { 
        left: number; 
        top: number; 
        right: number; 
        bottom: number;
        changed: boolean;
    } = {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        changed: true
    };

    // Current layer and layer visibility mode
    private currentLayer: number = 0;
    private showAllLayers: boolean = false;

    // Add a resize state property
    private isResizing = false;
    private resizeEndTimeout: number | null = null;

    // Add LOD properties
    private useLOD = true;
    private lodThreshold = 0.4; // Reduced from 0.5 to make LOD kick in a bit later
    private lodQuality = 3; // 1-5, higher is better quality
    private lodCanvases: Map<number, OffscreenCanvas> = new Map(); // Cache for LOD canvases
    private lodDirty: boolean[] = []; // Track which LOD canvases need updating

    // Add a canvas pool for better memory management
    private canvasPool: OffscreenCanvas[] = [];
    private readonly MAX_POOL_SIZE = 10;

    // Add render settings
    private renderSettings: RenderSettings = {
        useLOD: true,
        lodThreshold: 0.4,
        lodQuality: 3,
        batchSize: 16,
        useDirectAtlas: true,
        showFPS: true,
        debugMode: false
    };

    constructor(debugMode = false) {
        this.debugMode = debugMode;
        self.onmessage = this.handleMessage.bind(this);
        
        // Add better error handling
        self.onerror = (error) => {
            console.error('RenderWorker: Unhandled error:', error);
        };
        
        console.log('RenderWorker: Worker initialized');
    }

    private handleMessage(e: MessageEvent) {
        const { type, ...data } = e.data;

        try {
            switch (type) {
                case 'initialize':
                    this.initialize(
                        data.canvas,
                        data.mapWidth,
                        data.mapHeight,
                        data.tileWidth,
                        data.tileHeight,
                        data.tileSpacing,
                        data.tilemapBlob,
                        data.sharedMapData,
                        data.updateFlags,
                        data.mapDimensions,
                        data.transform,
                        data.debugMode,
                        data.renderSettings
                    );
                    break;
                case 'updateRenderSettings':
                    this.updateRenderSettings(data.settings);
                    break;
                case 'updateMapDimensions':
                    this.updateMapDimensions(
                        data.mapWidth,
                        data.mapHeight,
                        data.sharedMapData,
                        data.updateFlags,
                        data.mapDimensions
                    );
                    break;
                case 'updateTransform':
                    this.updateTransform(data.transform);
                    break;
                case 'redrawTile':
                    this.redrawTile(data.layer, data.x, data.y);
                    break;
                case 'redrawRegion':
                    this.redrawRegion(data.layer, data.area);
                    break;
                case 'redrawLayer':
                    this.redrawLayer(data.layer);
                    break;
                case 'redrawAll':
                    this.redrawAll();
                    break;
                case 'resize':
                    this.resize(data.width, data.height);
                    break;
                case 'setShowGrid':
                    this.showGrid = data.showGrid;
                    this.redrawAll();
                    break;
                case 'setLayerVisibility':
                    this.setLayerVisibility(data.layer, data.visible);
                    break;
                case 'updateBrushPreview':
                    this.updateBrushPreview(data);
                    break;
                case 'clearBrushPreview':
                    this.brushPreview.active = false;
                    this.redrawAll();
                    break;
                case 'startAnimation':
                    this.startContinuousAnimation();
                    break;
                case 'stopAnimation':
                    this.stopContinuousAnimation();
                    break;
                case 'mouseEvent':
                    this.handleMouseEvent(data.eventType, data);
                    break;
                case 'keyEvent':
                    this.handleKeyEvent(data.eventType, data);
                    break;
                case 'paintEvent':
                    this.handlePaintEvent(data.layer, data.x, data.y, data.tileIndex, data.brushSize);
                    break;
                case 'paintRegion':
                    this.handlePaintRegion(data.layer, data.startX, data.startY, data.width, data.height, data.tileIndex);
                    break;
                case 'uiStateChange':
                    this.handleUIStateChange(data.stateType, data.data);
                    break;
                case 'draw':
                    // New unified drawing handler
                    this.handleDrawOperation(data.operation);
                    break;
                case 'terminate':
                    // Handle worker termination
                    this.handleTerminate();
                    // Acknowledge termination
                    self.postMessage({
                        type: 'terminateAcknowledged'
                    });
                    break;
                case 'test':
                    // Handle test messages for diagnostic purposes
                    console.log('RenderWorker: Received test message');
                    self.postMessage({
                        type: 'response',
                        message: 'RenderWorker is working!',
                        receivedData: data
                    });
                    break;
                case 'setCurrentLayer':
                    this.setCurrentLayer(data.layer, data.showAllLayers);
                    break;
                default:
                    console.warn('RenderWorker: Unknown message type:', type);
            }
        } catch (error: unknown) {
            console.error('RenderWorker: Error handling message:', { type, error });
            
            // Notify main thread of the error
            self.postMessage({
                type: 'error',
                error: error instanceof Error ? error.toString() : String(error),
                messageType: type
            });
        }
    }
    
    // Start continuous animation
    private startContinuousAnimation() {
        console.log('RenderWorker: Starting continuous animation');
        this.continuousAnimation = true;
        if (!this.isRunning) {
            this.requestRender();
        }
    }

    // Stop continuous animation
    private stopContinuousAnimation() {
        console.log('RenderWorker: Stopping continuous animation');
        this.continuousAnimation = false;
    }
    
    // Update brush preview
    private updateBrushPreview(data: any) {
        this.brushPreview = {
            active: true,
            x: data.x,
            y: data.y,
            brushSize: data.brushSize || 1,
            brushType: data.brushType || 'normal',
            tileIndex: data.tileIndex,
            previewData: data.previewData,
            drawEllipse: data.drawEllipse,
            drawRectangle: data.drawRectangle,
            drawStartX: data.drawStartX,
            drawStartY: data.drawStartY,
            shiftKey: data.shiftKey
        };
        this.redrawAll();
    }
    
    private updateTransform(transform: { offsetX: number; offsetY: number; zoom: number }) {
        this.transform = transform;
        
        // Update the viewport when transform changes
        this.updateViewport();
        
        // Redraw everything with the new transform
        this.redrawAll(); 
    }
    
    // Update the current viewport in map coordinates
    private updateViewport() {
        if (!this.canvas) return;
        
        // Calculate the visible area of the map in tile coordinates
        const invZoom = 1 / this.transform.zoom;
        const leftPx = -this.transform.offsetX * invZoom;
        const topPx = -this.transform.offsetY * invZoom;
        const rightPx = (this.canvas.width * invZoom) - this.transform.offsetX * invZoom;
        const bottomPx = (this.canvas.height * invZoom) - this.transform.offsetY * invZoom;
        
        // Calculate velocity-based lookahead for smoother scrolling
        // The faster we're moving, the more we look ahead
        const velocityLookahead = 5; // Base lookahead in tiles
        
        // Convert from pixels to tile coordinates, adding a buffer based on velocity
        const oldViewport = { ...this.viewport };
        this.viewport.left = Math.max(0, Math.floor(leftPx / this.tileWidth) - velocityLookahead);
        this.viewport.top = Math.max(0, Math.floor(topPx / this.tileHeight) - velocityLookahead);
        this.viewport.right = Math.min(this.mapWidth - 1, Math.ceil(rightPx / this.tileWidth) + velocityLookahead);
        this.viewport.bottom = Math.min(this.mapHeight - 1, Math.ceil(bottomPx / this.tileHeight) + velocityLookahead);
        
        // Check if the viewport has changed
        this.viewport.changed = (
            oldViewport.left !== this.viewport.left ||
            oldViewport.top !== this.viewport.top ||
            oldViewport.right !== this.viewport.right ||
            oldViewport.bottom !== this.viewport.bottom
        );
        
        if (this.debugMode && this.viewport.changed) {
            console.log('RenderWorker: Viewport updated:', this.viewport);
        }
    }
    
    // Get tile index from shared buffer
    private getTileFromSharedBuffer(layer: number, y: number, x: number): number {
        if (!this.sharedMapData) return -1;
        
        // Detailed bounds checking with additional debug info
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight || layer < 0 || layer >= this.layerCount) {
            if (this.debugMode) {
                // Log specific issue for more targeted debugging
                if (x < 0 || x >= this.mapWidth) {
                    console.warn(`RenderWorker: X coordinate out of bounds: x=${x}, mapWidth=${this.mapWidth}`);
                }
                if (y < 0 || y >= this.mapHeight) {
                    console.warn(`RenderWorker: Y coordinate out of bounds: y=${y}, mapHeight=${this.mapHeight}`);
                }
                if (layer < 0 || layer >= this.layerCount) {
                    console.warn(`RenderWorker: Layer out of bounds: layer=${layer}, layerCount=${this.layerCount}`);
                }
                
                console.warn(`RenderWorker: Out of bounds access at [${layer},${y},${x}] - map dimensions: ${this.mapWidth}x${this.mapHeight}, layers: ${this.layerCount}`);
            }
            return -1;
        }
        
        const index = (layer * this.mapHeight * this.mapWidth) + (y * this.mapWidth) + x;
        
        // Add debug output to trace all tile access
        if (this.debugMode) {
            console.log(`RenderWorker: Getting tile from shared buffer at [${layer},${y},${x}] = index ${index}, value: ${this.sharedMapData[index]}, map dimensions: ${this.mapWidth}x${this.mapHeight}`);
        }
        
        return this.sharedMapData[index];
    }
    
    // Convert 3D coordinates to flat index in the shared buffer
    private getFlatIndex(layer: number, y: number, x: number): number {
        return (layer * this.mapHeight * this.mapWidth) + (y * this.mapWidth) + x;
    }
    
    // Draw a tile to the canvas
    private drawTile(layer: number, tileX: number, tileY: number, tileIndex: number) {
        if (tileIndex === -1 || !this.ctx) return;
        if (this.layerVisibility[layer] === false) return;
        
        const tile = this.tileCache.get(tileIndex);
        if (!tile) {
            console.warn('RenderWorker: No cached tile found for index', tileIndex);
            return;
        }
        
        try {
            // Calculate the destination position
            const destX = tileX * this.tileWidth;
            const destY = tileY * this.tileHeight;
            
            // Draw the tile
            this.ctx.drawImage(
                tile,
                0, 0, this.tileWidth, this.tileHeight,
                destX, destY, this.tileWidth, this.tileHeight
            );
            
            // Log in debug mode
            if (this.debugMode) {
                console.log('RenderWorker: Drew tile at', {
                    layer, tileX, tileY, tileIndex, destX, destY
                });
            }
        } catch (error) {
            console.error('RenderWorker: Error drawing tile:', error, {
                layer, tileX, tileY, tileIndex
            });
        }
    }
    
    // Redraw a specific tile
    private redrawTile(layer: number, x: number, y: number) {
        if (!this.sharedMapData || !this.updateFlags) {
            console.error('RenderWorker: Cannot redraw tile - shared data not available');
            return;
        }
        
        // Mark the layer as needing update
            Atomics.store(this.updateFlags, layer, 1);
            
        // Request a render
        this.requestRender();
            
        // Notify main thread
            self.postMessage({
                type: 'tileRedrawn',
                layer,
                x,
            y
            });
    }
    
    // Redraw a region of the map
    private redrawRegion(layer: number, area: { x: number, y: number, width: number, height: number }) {
        if (!this.sharedMapData || !this.updateFlags) {
            console.error('RenderWorker: Cannot redraw region - shared data not available');
            return;
        }
        
        // Mark the layer as needing update
        Atomics.store(this.updateFlags, layer, 1);
        
        // Request a render
        this.requestRender();
        
        // Notify main thread
        self.postMessage({
            type: 'regionRedrawn',
                layer, 
            area
        });
    }
    
    // Redraw a specific layer
    private redrawLayer(layer: number) {
        if (!this.sharedMapData || !this.updateFlags) {
            console.error('RenderWorker: Cannot redraw layer - shared data not available');
            return;
        }
        
        // Mark the layer as needing update
        Atomics.store(this.updateFlags, layer, 1);
        
        // Mark the layer buffer as dirty
        if (layer >= 0 && layer < this.layerDirty.length) {
            this.layerDirty[layer] = true;
        }
        
        // Request a render
        this.requestRender();
    }
    
    // Redraw all layers
    private redrawAll() {
        if (!this.sharedMapData || !this.updateFlags) {
            console.error('RenderWorker: Cannot redraw all layers - shared data not available');
            return;
        }
        
        // Mark all layers as needing update
        for (let i = 0; i < this.layerCount; i++) {
            Atomics.store(this.updateFlags, i, 1);
            
            // Mark the layer buffer as dirty
            if (i < this.layerDirty.length) {
                this.layerDirty[i] = true;
            }
        }
        
        this.requestRender();
    }
    
    // Request a render frame
    private requestRender() {
        // If already running, do nothing
        if (this.isRunning) return;
        
        // Set the running flag
        this.isRunning = true;
        
        // Request an animation frame
        if (this.animationFrameId === null) {
            this.animationFrameId = requestAnimationFrame(this.renderFrame.bind(this));
        }
    }
    
    // Render a frame with optimizations for resize operations
    private renderFrame(timestamp: number) {
        this.animationFrameId = null;
        this.frameCount++; // Increment frame counter
        
        if (!this.ctx || !this.sharedMapData || !this.updateFlags) {
            this.isRunning = false;
            return;
        }
        
        // Calculate FPS
        if (this.lastFrameTime > 0) {
            const deltaTime = timestamp - this.lastFrameTime;
            const currentFps = 1000 / deltaTime;
            this.fpsHistory.push(currentFps);
            
            if (this.fpsHistory.length > 30) {
                this.fpsHistory.shift();
            }
            
            // Calculate average FPS
            this.fps = this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length;
            
            // Send FPS update every 10 frames
            if (this.fpsHistory.length % 10 === 0) {
                self.postMessage({
                    type: 'fpsUpdate',
                    fps: Math.round(this.fps)
                });
            }
        }
        this.lastFrameTime = timestamp;
        
        try {
            // Throttle rendering during resize operations
            if (this.isResizing) {
                // Limit to ~15 FPS during resize for better performance
                const timeSinceLastFrame = timestamp - this.lastFrameTime;
                if (timeSinceLastFrame < 66) { // ~15 FPS
                    this.isRunning = false;
                    this.animationFrameId = requestAnimationFrame(this.renderFrame.bind(this));
                    return;
                }
            }
            
            // Check if viewport changed
            if (this.viewport.changed) {
                this.updateViewport();
            }
            
            // Clear the canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Apply transform
            this.ctx.save();
            this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
            this.ctx.scale(this.transform.zoom, this.transform.zoom);
            
            // Determine if we should use LOD based on zoom level
            const shouldUseLOD = this.useLOD && this.transform.zoom < this.lodThreshold;
            
            if (shouldUseLOD) {
                // Use LOD rendering for better performance when zoomed out
                this.renderWithLOD();
            } else {
                // Draw layers from back to front using normal rendering
                let layersRedrawn = 0;
                let tilesRendered = 0;
                
                for (let layer = 0; layer < this.layerCount; layer++) {
                    // Skip if layer is not visible
                    if (this.layerVisibility[layer] === false) continue;
                    
                    // Check if this layer needs to be updated
                    const needsUpdate = Atomics.exchange(this.updateFlags, layer, 0);
                    
                    // Update the layer buffer if needed
                    if (needsUpdate || this.layerDirty[layer]) {
                        this.updateLayerBuffer(layer);
                        this.layerDirty[layer] = false;
                        layersRedrawn++;
                    }
                    
                    // Draw the layer buffer to the main canvas (only the visible part)
                    const buffer = this.layerBuffers[layer];
                    if (buffer) {
                        // Calculate source rect (the part of the layer buffer that's visible)
                        const srcX = this.viewport.left * this.tileWidth;
                        const srcY = this.viewport.top * this.tileHeight;
                        const srcWidth = (this.viewport.right - this.viewport.left + 1) * this.tileWidth;
                        const srcHeight = (this.viewport.bottom - this.viewport.top + 1) * this.tileHeight;
                        
                        // Set layer opacity based on whether it's the current layer
                        // If showAllLayers is true, all layers have full opacity
                        // Otherwise, the current layer has full opacity, others have 50% opacity
                        const isCurrentLayer = layer === this.currentLayer;
                        const opacity = this.showAllLayers || isCurrentLayer ? 1.0 : 0.5;
                        
                        // Save context to restore opacity after drawing
                        this.ctx.save();
                        this.ctx.globalAlpha = opacity;
                        
                        // Draw it to the main canvas
                        this.ctx.drawImage(
                            buffer,
                            srcX, srcY, srcWidth, srcHeight,
                            srcX, srcY, srcWidth, srcHeight
                        );
                        
                        // Restore context
                        this.ctx.restore();
                        
                        tilesRendered += (this.viewport.right - this.viewport.left + 1) * 
                                        (this.viewport.bottom - this.viewport.top + 1);
                    }
                }
                
                if (this.debugMode) {
                    if (layersRedrawn > 0) {
                        console.log(`RenderWorker: Updated ${layersRedrawn} layer buffers`);
                    }
                    
                    if (this.frameCount % 30 === 0) {
                        console.log(`RenderWorker: Rendered ${tilesRendered} visible tiles from ${this.viewport.left},${this.viewport.top} to ${this.viewport.right},${this.viewport.bottom}`);
                    }
                }
            }
            
            // Draw grid if enabled
            if (this.showGrid) {
                this.drawGrid();
            }
            
            // Draw brush preview if active
            if (this.brushPreview.active) {
                this.drawBrushPreview();
            }
            
            // Restore transform
            this.ctx.restore();
            
            // Draw debug grid if in debug mode
            if (this.debugMode) {
                this.drawDebugGrid();
            }
            
            // Notify main thread that the frame is complete
            self.postMessage({
                type: 'frameComplete'
            });
        } catch (error) {
            console.error('RenderWorker: Error rendering frame:', error);
        }
        
        // If continuous animation is enabled, request the next frame
        if (this.continuousAnimation) {
            this.isRunning = false;
            this.animationFrameId = requestAnimationFrame(this.renderFrame.bind(this));
        } else {
            // Reset the running flag
            this.isRunning = false;
        }
    }
    
    // Render using Level-of-Detail (LOD) for better performance when zoomed out
    private renderWithLOD() {
        if (!this.tilemapImage) return;
        
        // Determine the LOD scale based on zoom level and quality setting
        // The further zoomed out, the more aggressive the downsampling
        // Higher quality setting means less aggressive downsampling
        let lodScale = 1;
        
        // Calculate scale based on zoom level and quality
        // Quality 1 (lowest) = most aggressive downsampling
        // Quality 5 (highest) = least aggressive downsampling
        const qualityFactor = (this.lodQuality - 1) / 4; // 0.0 to 1.0
        
        if (this.transform.zoom < 0.15) {
            // Far zoom - scale from 8 (lowest quality) to 2 (highest quality)
            lodScale = Math.max(2, Math.round(8 - qualityFactor * 6));
        } else if (this.transform.zoom < 0.25) {
            // Medium zoom - scale from 4 (lowest quality) to 1 (highest quality)
            lodScale = Math.max(1, Math.round(4 - qualityFactor * 3));
        } else {
            // Close zoom - scale from 2 (lowest quality) to 1 (highest quality)
            lodScale = Math.max(1, Math.round(2 - qualityFactor));
        }
        
        if (this.debugMode) {
            console.log(`RenderWorker: Using LOD scale ${lodScale} at zoom ${this.transform.zoom.toFixed(2)} with quality ${this.lodQuality}`);
        }
        
        // Check if we need to create or update the LOD canvas
        if (!this.lodCanvases.has(lodScale) || this.lodDirty[lodScale]) {
            this.createOrUpdateLODCanvas(lodScale);
            this.lodDirty[lodScale] = false;
        }
        
        // Get the LOD canvas
        const lodCanvas = this.lodCanvases.get(lodScale);
        if (!lodCanvas) return;
        
        // Draw the LOD canvas to the main canvas
        // Calculate the source rect based on the viewport
        const srcX = Math.floor(this.viewport.left * this.tileWidth / lodScale);
        const srcY = Math.floor(this.viewport.top * this.tileHeight / lodScale);
        const srcWidth = Math.ceil((this.viewport.right - this.viewport.left + 1) * this.tileWidth / lodScale);
        const srcHeight = Math.ceil((this.viewport.bottom - this.viewport.top + 1) * this.tileHeight / lodScale);
        
        // Calculate the destination rect
        const destX = this.viewport.left * this.tileWidth;
        const destY = this.viewport.top * this.tileHeight;
        const destWidth = (this.viewport.right - this.viewport.left + 1) * this.tileWidth;
        const destHeight = (this.viewport.bottom - this.viewport.top + 1) * this.tileHeight;
        
        // Draw the LOD canvas to the main canvas
        this.ctx.drawImage(
            lodCanvas,
            srcX, srcY, srcWidth, srcHeight,
            destX, destY, destWidth, destHeight
        );
        
        if (this.debugMode && this.frameCount % 30 === 0) {
            console.log(`RenderWorker: Rendered using LOD with scale ${lodScale}`);
        }
    }
    
    // Create or update a LOD canvas
    private createOrUpdateLODCanvas(scale: number) {
        if (!this.tilemapImage) return;
        
        // Create the LOD canvas if it doesn't exist
        if (!this.lodCanvases.has(scale)) {
            const width = Math.ceil(this.mapWidth * this.tileWidth / scale);
            const height = Math.ceil(this.mapHeight * this.tileHeight / scale);
            const canvas = new OffscreenCanvas(width, height);
            this.lodCanvases.set(scale, canvas);
            
            if (this.debugMode) {
                console.log(`RenderWorker: Created LOD canvas with scale ${scale}, dimensions: ${width}x${height}`);
            }
        }
        
        // Get the LOD canvas and its context
        const lodCanvas = this.lodCanvases.get(scale)!;
        const lodCtx = lodCanvas.getContext('2d')!;
        
        // Clear the canvas
        lodCtx.clearRect(0, 0, lodCanvas.width, lodCanvas.height);
        
        // Draw visible layers to the LOD canvas
        for (let layer = 0; layer < this.layerCount; layer++) {
            // Skip if layer is not visible
            if (this.layerVisibility[layer] === false) continue;
            
            // Set layer opacity based on whether it's the current layer
            const isCurrentLayer = layer === this.currentLayer;
            const opacity = this.showAllLayers || isCurrentLayer ? 1.0 : 0.5;
            
            // Save context to restore opacity after drawing
            lodCtx.save();
            lodCtx.globalAlpha = opacity;
            
            // Draw the layer to the LOD canvas
            this.drawLayerToLODCanvas(layer, lodCtx, scale);
            
            // Restore context
            lodCtx.restore();
        }
    }
    
    // Draw a layer to the LOD canvas
    private drawLayerToLODCanvas(layer: number, lodCtx: OffscreenCanvasRenderingContext2D, scale: number) {
        if (!this.tilemapImage) return;
        
        // For large maps, we'll use a sampling approach rather than drawing every tile
        // This is much faster for zoomed-out views
        
        // Calculate the step size based on the scale
        // Reduced step size for better quality
        const stepX = Math.max(1, Math.floor(scale / 2));
        const stepY = Math.max(1, Math.floor(scale / 2));
        
        // For scale 1, draw every tile for best quality
        if (scale === 1) {
            for (let y = 0; y < this.mapHeight; y++) {
                for (let x = 0; x < this.mapWidth; x++) {
                    this.drawTileToLODCanvas(layer, lodCtx, x, y, scale);
                }
            }
        } else {
            // For larger scales, use sampling to improve performance
            for (let y = 0; y < this.mapHeight; y += stepY) {
                for (let x = 0; x < this.mapWidth; x += stepX) {
                    this.drawTileToLODCanvas(layer, lodCtx, x, y, scale);
                }
            }
        }
    }
    
    // Helper method to draw a single tile to the LOD canvas
    private drawTileToLODCanvas(layer: number, lodCtx: OffscreenCanvasRenderingContext2D, x: number, y: number, scale: number) {
        const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
        
        if (tileIndex !== -1) {
            const sourceCoords = this.tileSourceCoords.get(tileIndex);
            
            if (sourceCoords) {
                // Draw the tile at a reduced size
                lodCtx.drawImage(
                    this.tilemapImage!,
                    sourceCoords.x, sourceCoords.y, this.tileWidth, this.tileHeight,
                    Math.floor(x * this.tileWidth / scale), Math.floor(y * this.tileHeight / scale), 
                    Math.ceil(this.tileWidth / scale), Math.ceil(this.tileHeight / scale)
                );
            }
        }
    }
    
    // Mark all LOD canvases as dirty when map data changes
    private markLODCanvasDirty() {
        for (let i = 0; i < 10; i++) {
            this.lodDirty[i] = true;
        }
    }
    
    // Draw a proper grid
    private drawGrid() {
        if (!this.ctx) return;
        
        // Calculate total map size
        const mapWidthPx = this.mapWidth * this.tileWidth;
        const mapHeightPx = this.mapHeight * this.tileHeight;
        
        // Set up line style
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 1 / this.transform.zoom; // Keep grid lines the same width regardless of zoom
        
        // Draw vertical grid lines
        for (let x = 0; x <= this.mapWidth; x++) {
            const lineX = x * this.tileWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(lineX, 0);
            this.ctx.lineTo(lineX, mapHeightPx);
            this.ctx.stroke();
        }
        
        // Draw horizontal grid lines
        for (let y = 0; y <= this.mapHeight; y++) {
            const lineY = y * this.tileHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(0, lineY);
            this.ctx.lineTo(mapWidthPx, lineY);
            this.ctx.stroke();
        }
    }
    
    // Draw the brush preview
    private drawBrushPreview() {
        if (!this.ctx || this.brushPreview.x < 0 || this.brushPreview.y < 0) return;
        
        // Calculate brush bounds
        const brushX = this.brushPreview.x;
        const brushY = this.brushPreview.y;
        const brushSize = this.brushPreview.brushSize;
        
        // Set a semi-transparent fill style
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1 / this.transform.zoom;
        
        if (this.brushPreview.drawEllipse && 
            this.brushPreview.drawStartX !== undefined && 
            this.brushPreview.drawStartY !== undefined) {
            // Draw ellipse preview
            const radiusX = Math.abs(brushX - this.brushPreview.drawStartX);
            const radiusY = Math.abs(brushY - this.brushPreview.drawStartY);
            
            this.drawEllipsePreview(
                this.brushPreview.drawStartX, 
                this.brushPreview.drawStartY, 
                radiusX, 
                radiusY
            );
        } else if (this.brushPreview.drawRectangle && 
                  this.brushPreview.drawStartX !== undefined && 
                  this.brushPreview.drawStartY !== undefined) {
            // Draw rectangle preview
            const startX = Math.min(this.brushPreview.drawStartX, brushX);
            const startY = Math.min(this.brushPreview.drawStartY, brushY);
            const width = Math.abs(brushX - this.brushPreview.drawStartX) + 1;
            const height = Math.abs(brushY - this.brushPreview.drawStartY) + 1;
            
            this.drawRectanglePreview(startX, startY, width, height);
        } else {
            // Draw standard brush preview
            const halfBrush = Math.floor(brushSize / 2);
            const startX = brushSize % 2 === 0 ? brushX - halfBrush : brushX - halfBrush;
            const startY = brushSize % 2 === 0 ? brushY - halfBrush : brushY - halfBrush;
            
            this.drawRectanglePreview(startX, startY, brushSize, brushSize);
        }
    }
    
    private drawRectanglePreview(x: number, y: number, width: number, height: number) {
        if (!this.ctx) return;
        
        const pixelX = x * this.tileWidth;
        const pixelY = y * this.tileHeight;
        const pixelWidth = width * this.tileWidth;
        const pixelHeight = height * this.tileHeight;
        
        // Draw filled rectangle with low opacity
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(pixelX, pixelY, pixelWidth, pixelHeight);
        
        // Draw border with higher opacity
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.strokeRect(pixelX, pixelY, pixelWidth, pixelHeight);
    }
    
    private drawEllipsePreview(centerX: number, centerY: number, radiusX: number, radiusY: number) {
        if (!this.ctx) return;
        
        // Convert to pixel coordinates
        const pixelCenterX = (centerX + 0.5) * this.tileWidth;
        const pixelCenterY = (centerY + 0.5) * this.tileHeight;
        const pixelRadiusX = (radiusX + 0.5) * this.tileWidth;
        const pixelRadiusY = (radiusY + 0.5) * this.tileHeight;
        
        // Draw ellipse
        this.ctx.beginPath();
        this.ctx.ellipse(
            pixelCenterX, 
            pixelCenterY, 
            pixelRadiusX, 
            pixelRadiusY, 
            0, 0, Math.PI * 2
        );
        
        // Fill with semi-transparent white
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fill();
        
        // Stroke with more opaque white
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.stroke();
    }
    
    // Draw a debug grid
    private drawDebugGrid() {
        if (!this.ctx) return;
        
        this.ctx.save();
        
        // Apply transform
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.zoom, this.transform.zoom);
        
        // Draw the grid
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        this.ctx.lineWidth = 1 / this.transform.zoom;
        
        // Draw vertical lines
        for (let x = 0; x <= this.mapWidth; x++) {
            const lineX = x * this.tileWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(lineX, 0);
            this.ctx.lineTo(lineX, this.mapHeight * this.tileHeight);
            this.ctx.stroke();
        }
        
        // Draw horizontal lines
        for (let y = 0; y <= this.mapHeight; y++) {
            const lineY = y * this.tileHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(0, lineY);
            this.ctx.lineTo(this.mapWidth * this.tileWidth, lineY);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    private resize(width: number, height: number) {
        if (!this.canvas) {
            console.error('RenderWorker: Cannot resize - canvas not available');
            return;
        }
        
        console.log('RenderWorker: Resizing canvas to', width, height);
        
        // Set resizing state
        this.isResizing = true;
        
        // Clear any existing timeout
        if (this.resizeEndTimeout !== null) {
            clearTimeout(this.resizeEndTimeout);
        }
        
        // Store old dimensions for potential content preservation
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;
        
        // Resize the canvas
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Make sure the context has the right settings
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
        }
        
        // Update the viewport
        this.updateViewport();
        
        // Optimize layer buffer handling - only mark them as dirty
        // instead of recreating them, as the map dimensions haven't changed
        for (let i = 0; i < this.layerDirty.length; i++) {
            this.layerDirty[i] = true;
        }
        
        // Redraw everything
        this.redrawAll();
        
        // Set a timeout to end the resize state
        this.resizeEndTimeout = setTimeout(() => {
            this.isResizing = false;
            this.redrawAll(); // Full quality redraw when resize is complete
            this.resizeEndTimeout = null;
            console.log('RenderWorker: Resize operation completed');
        }, 200) as unknown as number;
    }

    private async initialize(
        canvas: OffscreenCanvas,
        mapWidth: number,
        mapHeight: number,
        tileWidth: number,
        tileHeight: number,
        tileSpacing: number,
        tilemapBlob: Blob | null | undefined,
        sharedMapData: SharedArrayBuffer | null,
        updateFlags: SharedArrayBuffer,
        mapDimensions: { width: number, height: number, layers: number } | null,
        transform: { offsetX: number; offsetY: number; zoom: number } | null,
        debugMode: boolean,
        renderSettings?: RenderSettings
    ) {
        // Update the debug mode from initialization parameters
        this.debugMode = debugMode;
        
        // Apply render settings if provided
        if (renderSettings) {
            this.updateRenderSettings(renderSettings);
        }
        
        console.log('RenderWorker: Initializing with canvas and dimensions:', {
            mapWidth,
            mapHeight,
            tileWidth,
            tileHeight,
            tileSpacing,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            hasSharedBuffer: !!sharedMapData,
            hasUpdateFlags: !!updateFlags,
            hasTilemapBlob: !!tilemapBlob,
            mapDimensions,
            debugMode,
            useDirectAtlas: this.useDirectAtlas,
            useLOD: this.useLOD,
            renderSettings: this.renderSettings
        });

        try {
            // Store the canvas
            this.canvas = canvas;
            this.ctx = this.canvas.getContext('2d', { alpha: true })!;
            this.ctx.imageSmoothingEnabled = false;
            
            // Store dimensions
            this.mapWidth = mapWidth;
            this.mapHeight = mapHeight;
            this.tileWidth = tileWidth;
            this.tileHeight = tileHeight;
            this.tileSpacing = tileSpacing;
            
            // Store transform
            if (transform) {
                this.transform = transform;
            }
            
            // Set up shared map data if provided
            if (sharedMapData && mapDimensions) {
                this.sharedMapData = new Int32Array(sharedMapData);
                this.layerCount = mapDimensions.layers;
                console.log('RenderWorker: Using shared map data with layers:', this.layerCount);
                
                // Validate sizes
                const expectedSize = mapWidth * mapHeight * this.layerCount;
                const actualSize = this.sharedMapData.length;
                if (actualSize < expectedSize) {
                    throw new Error(`Shared buffer too small! Expected ${expectedSize} integers, got ${actualSize}`);
                }
            } else {
                console.error('RenderWorker: No shared map data provided');
                throw new Error('No shared map data provided');
            }
            
            // Set up update flags
            if (updateFlags) {
                this.updateFlags = new Int32Array(updateFlags);
                console.log('RenderWorker: Using update flags buffer with size:', this.updateFlags.length);
                
                if (this.updateFlags.length < this.layerCount) {
                    throw new Error(`Update flags buffer too small: ${this.updateFlags.length}, need ${this.layerCount}`);
                }
                
                // Set all flags to 1 to force initial render
                for (let i = 0; i < this.layerCount; i++) {
                    Atomics.store(this.updateFlags, i, 1);
                }
            } else {
                console.error('RenderWorker: No update flags buffer provided');
                throw new Error('No update flags buffer provided');
            }

            // Create tilemap image
            if (this.tilemapImage) {
                // Clean up existing tilemap image
                this.tilemapImage.close();
                this.tilemapImage = null;
            }
            
            // Try to create the tilemap image from the blob
            try {
                if (tilemapBlob && tilemapBlob instanceof Blob) {
                    console.log('RenderWorker: Creating tilemap image from blob of size:', tilemapBlob.size);
                    this.tilemapImage = await createImageBitmap(tilemapBlob);
                    
                    if (this.debugMode) {
                        console.log('RenderWorker: Tilemap image created successfully with dimensions:', {
                            width: this.tilemapImage.width,
                            height: this.tilemapImage.height
                        });
                    }
                } else {
                    console.warn('RenderWorker: No valid tilemap blob provided');
                    throw new Error('No valid tilemap blob provided');
                }
            } catch (error) {
                console.error('RenderWorker: Failed to create tilemap image:', error);
                throw new Error('Failed to create tilemap image: ' + String(error));
            }

            // Clear tile cache
            this.tileCache.clear();
            this.tileSourceCoords.clear();
            
            // Pre-cache all tiles if we have a tilemap image
            if (this.tilemapImage) {
                await this.cacheTiles();
            } else {
                console.warn('RenderWorker: No tilemap image available, skipping tile caching');
                throw new Error('No tilemap image available');
            }

            // Initialize layer visibility (default all visible)
            this.layerVisibility = new Array(this.layerCount).fill(true);
            
            // Initialize layer buffers for optimization
            this.initializeLayerBuffers();
            
            // Initialize LOD system
            this.lodDirty = new Array(10).fill(true);
            
            // Update viewport
            this.updateViewport();
            
            // Start animation loop
            this.startContinuousAnimation();
            
            // Notify main thread that initialization is complete
            console.log('RenderWorker: Initialization complete');
            self.postMessage({
                type: 'initComplete'
            });
        } catch (error: unknown) {
            console.error('RenderWorker: Initialization failed:', error);
            self.postMessage({
                type: 'initError',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    // Initialize layer buffer canvases for optimization
    private initializeLayerBuffers() {
        console.log('RenderWorker: Initializing layer buffers for map size:', 
            this.mapWidth, 'x', this.mapHeight, 
            'with', this.layerCount, 'layers');
        
        // Clean up existing buffers if they exist
        const existingBuffers = this.layerBuffers.length > 0;
        const oldBuffers = [...this.layerBuffers];
        const oldContexts = [...this.layerContexts];
        
        // Reset arrays
        this.layerBuffers = [];
        this.layerContexts = [];
        this.layerDirty = [];
        
        // Create a buffer for each layer
        for (let i = 0; i < this.layerCount; i++) {
            // Create new buffer with the current map dimensions
            const bufferWidth = this.mapWidth * this.tileWidth;
            const bufferHeight = this.mapHeight * this.tileHeight;
            
            let buffer: OffscreenCanvas;
            let ctx: OffscreenCanvasRenderingContext2D;
            
            // Try to reuse existing buffer if available and dimensions match
            if (existingBuffers && i < oldBuffers.length) {
                const oldBuffer = oldBuffers[i];
                
                if (oldBuffer.width === bufferWidth && oldBuffer.height === bufferHeight) {
                    // Reuse the existing buffer if dimensions match
                    buffer = oldBuffer;
                    ctx = oldContexts[i];
                    console.log(`RenderWorker: Reusing buffer for layer ${i}`);
                } else {
                    // Create new buffer but try to preserve content
                    buffer = new OffscreenCanvas(bufferWidth, bufferHeight);
                    ctx = buffer.getContext('2d', { alpha: true })!;
                    ctx.imageSmoothingEnabled = false;
                    
                    // Copy content from old buffer if possible
                    try {
                        // Calculate the area to copy (the smaller of old and new dimensions)
                        const copyWidth = Math.min(oldBuffer.width, bufferWidth);
                        const copyHeight = Math.min(oldBuffer.height, bufferHeight);
                        
                        if (copyWidth > 0 && copyHeight > 0) {
                            ctx.drawImage(
                                oldBuffer,
                                0, 0, copyWidth, copyHeight,
                                0, 0, copyWidth, copyHeight
                            );
                            console.log(`RenderWorker: Preserved content for layer ${i}`);
                        }
                    } catch (error) {
                        console.warn(`RenderWorker: Could not preserve content for layer ${i}:`, error);
                    }
                }
            } else {
                // Create new buffer
                buffer = new OffscreenCanvas(bufferWidth, bufferHeight);
                ctx = buffer.getContext('2d', { alpha: true })!;
                ctx.imageSmoothingEnabled = false;
            }
            
            this.layerBuffers.push(buffer);
            this.layerContexts.push(ctx);
            this.layerDirty.push(true); // Initially mark all layers as dirty
        }
        
        console.log(`RenderWorker: Created/updated ${this.layerCount} layer buffers`);
    }
    
    private async cacheTiles() {
        if (!this.tilemapImage) {
            console.warn('RenderWorker: Cannot cache tiles - no tilemap image available');
            return;
        }

        // Calculate tiles per row/col based on tilemap dimensions and spacing
        const tilesPerRow = Math.floor(this.tilemapImage.width / (this.tileWidth + this.tileSpacing));
        const tilesPerCol = Math.floor(this.tilemapImage.height / (this.tileHeight + this.tileSpacing));

        if (this.debugMode) {
            console.log('RenderWorker: Caching tiles:', {
                tilemapWidth: this.tilemapImage.width,
                tilemapHeight: this.tilemapImage.height,
                tilesPerRow,
                tilesPerCol,
                tileWidth: this.tileWidth,
                tileHeight: this.tileHeight,
                tileSpacing: this.tileSpacing,
                useDirectAtlas: this.useDirectAtlas
            });
        }

        if (this.useDirectAtlas) {
            // Instead of creating separate ImageBitmap objects, just store source coordinates
            for (let y = 0; y < tilesPerCol; y++) {
                for (let x = 0; x < tilesPerRow; x++) {
                    // Calculate source position in the tilemap
                    const srcX = x * (this.tileWidth + this.tileSpacing);
                    const srcY = y * (this.tileHeight + this.tileSpacing);
                    
                    // Store the source coordinates for this tile
                    const tileIndex = y * tilesPerRow + x;
                    this.tileSourceCoords.set(tileIndex, { x: srcX, y: srcY });
                    
                    // Log the first few tiles for debugging
                    if (this.debugMode && tileIndex < 5) {
                        console.log('RenderWorker: Cached tile source coordinates:', {
                            tileIndex,
                            srcX,
                            srcY
                        });
                    }
                }
            }
            
            console.log('RenderWorker: Cached source coordinates for', this.tileSourceCoords.size, 'tiles');
        } else {
            // Original approach: create separate ImageBitmap objects
            const tempCanvas = new OffscreenCanvas(this.tileWidth, this.tileHeight);
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

            try {
                // Cache each tile from the tilemap
                for (let y = 0; y < tilesPerCol; y++) {
                    for (let x = 0; x < tilesPerRow; x++) {
                        // Clear the canvas before drawing
                        tempCtx.clearRect(0, 0, this.tileWidth, this.tileHeight);
                        
                        // Calculate source position in the tilemap
                        const srcX = x * (this.tileWidth + this.tileSpacing);
                        const srcY = y * (this.tileHeight + this.tileSpacing);
                        
                        // Draw the tile to the temporary canvas
                        tempCtx.drawImage(
                            this.tilemapImage,
                            srcX,
                            srcY,
                            this.tileWidth,
                            this.tileHeight,
                            0,
                            0,
                            this.tileWidth,
                            this.tileHeight
                        );
                        
                        // Create an ImageBitmap from the canvas
                        const tile = await createImageBitmap(tempCanvas);
                        const tileIndex = y * tilesPerRow + x;
                        
                        // Store the tile in the cache
                        this.tileCache.set(tileIndex, tile);
                        
                        // Log the first few tiles for debugging
                        if (this.debugMode && tileIndex < 5) {
                            console.log('RenderWorker: Cached tile:', {
                                tileIndex,
                                srcX,
                                srcY
                            });
                        }
                    }
                }
                
                console.log('RenderWorker: Cached', this.tileCache.size, 'tiles');
            } catch (error) {
                console.error('RenderWorker: Error caching tiles:', error);
            }
        }
    }
            
    // Handle mouse events (mousedown, mousemove, mouseup)
    private handleMouseEvent(eventType: string, data: any) {
            if (this.debugMode) {
            console.log('RenderWorker: Handling mouse event:', eventType, data);
        }
        
        // Update internal state based on mouse event
        if (data.mapX !== undefined && data.mapY !== undefined) {
            // Update brush preview if we have map coordinates
            if (data.mapX >= 0 && data.mapY >= 0) {
                this.brushPreview.x = data.mapX;
                this.brushPreview.y = data.mapY;
                this.brushPreview.active = true;
                    } else {
                this.brushPreview.active = false;
            }
        }
        
        // Request a render to show the updated brush preview
        this.redrawAll();
    }

    // Handle keyboard events (keydown, keyup)
    private handleKeyEvent(eventType: string, data: any) {
        if (this.debugMode) {
            console.log('RenderWorker: Handling key event:', eventType, data);
        }
        
        // Process key events if needed
        // We could update internal state based on keys pressed
        
        // For example, handle shift key for ellipse perfect circle
        if (data.key === 'Shift') {
            this.brushPreview.shiftKey = eventType === 'keydown';
            this.redrawAll();
        }
    }

    // Handle paint operations
    private handlePaintEvent(layer: number, x: number, y: number, tileIndex: number, brushSize: number) {
        // Log more detailed information about the paint event
        console.log('RenderWorker: Handling paint event:', { 
            layer, 
            x, 
            y, 
            tileIndex, 
            brushSize,
            mapDimensions: {
                width: this.mapWidth,
                height: this.mapHeight,
                layers: this.layerCount
            }
        });
        
        // Check if coordinates are within bounds
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) {
            console.warn(`RenderWorker: Paint event out of bounds: [${layer},${y},${x}] - map dimensions: ${this.mapWidth}x${this.mapHeight}`);
            return;
        }
        
        // Check the value directly from the shared buffer
        const currentValue = this.getTileFromSharedBuffer(layer, y, x);
        console.log(`RenderWorker: Paint event - current value in shared buffer at [${layer},${y},${x}] = ${currentValue}`);
        
        // Calculate the brush area for boundary check
        const area = this.calculateBrushArea(x, y, brushSize);
        console.log(`RenderWorker: Brush area: x=${area.x}, y=${area.y}, width=${area.width}, height=${area.height}, mapWidth=${this.mapWidth}, mapHeight=${this.mapHeight}`);
        
        // The actual data update happens in the shared buffer already
        // We just need to mark the layer as dirty
        if (this.updateFlags) {
            Atomics.store(this.updateFlags, layer, 1);
        }
        
        // Mark the layer buffer as dirty
        if (layer >= 0 && layer < this.layerDirty.length) {
            this.layerDirty[layer] = true;
        }
        
        // Mark LOD canvases as dirty
        this.markLODCanvasDirty();
        
        // Explicitly render that tile now
        this.drawTilesInArea(layer, area);
        
        // Request a render
        this.redrawAll();
    }
    
    // Helper to calculate brush area
    private calculateBrushArea(x: number, y: number, size: number): { x: number, y: number, width: number, height: number } {
        // For odd sizes, center on the tile
        // For even sizes, align with top-left corner
        const offset = size % 2 === 0 ? 0 : Math.floor(size / 2);
        
        return {
            x: x - offset,
            y: y - offset,
            width: size,
            height: size
        };
    }
    
    // Draw all tiles in an area
    private drawTilesInArea(layer: number, area: { x: number, y: number, width: number, height: number }) {
        if (!this.ctx) return;
        
        console.log(`RenderWorker: Drawing tiles in area: x=${area.x}, y=${area.y}, width=${area.width}, height=${area.height}, mapWidth=${this.mapWidth}, mapHeight=${this.mapHeight}`);
        
        // Clamp the area to map boundaries to prevent wrapping
        const startX = Math.max(0, area.x);
        const startY = Math.max(0, area.y);
        const endX = Math.min(this.mapWidth, area.x + area.width);
        const endY = Math.min(this.mapHeight, area.y + area.height);
        
        console.log(`RenderWorker: Clamped drawing area to: x=${startX}, y=${startY}, endX=${endX}, endY=${endY}`);
        
        // Only process if we have a valid area after clamping
        if (startX >= endX || startY >= endY) {
            console.warn('RenderWorker: No valid area to draw after clamping to map boundaries');
            return;
        }
        
        // Count how many tiles we're drawing for debugging
        let drawnTiles = 0;
        
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                // No need to check bounds again since we've already clamped the area
                const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
                if (tileIndex !== -1) {
                    this.drawTile(layer, x, y, tileIndex);
                    drawnTiles++;
                }
            }
        }
        
        console.log(`RenderWorker: Drew ${drawnTiles} tiles within the clamped area`);
    }

    // Handle painting a region
    private handlePaintRegion(layer: number, startX: number, startY: number, width: number, height: number, tileIndex: number) {
        if (this.debugMode) {
            console.log('RenderWorker: Handling paint region:', { layer, startX, startY, width, height, tileIndex });
        }
        
        // The actual data update happens in the shared buffer already
        // We just need to mark the layer as dirty
        if (this.updateFlags) {
            Atomics.store(this.updateFlags, layer, 1);
        }
        
        // Mark the layer buffer as dirty
        if (layer >= 0 && layer < this.layerDirty.length) {
            this.layerDirty[layer] = true;
        }
        
        // Mark LOD canvases as dirty
        this.markLODCanvasDirty();
        
        // Request a render
        this.redrawAll();
    }

    // Handle UI state changes
    private handleUIStateChange(stateType: string, data: any) {
        if (this.debugMode) {
            console.log('RenderWorker: Handling UI state change:', stateType, data);
        }
        
        switch (stateType) {
            case 'drawingStart':
                // Handle start of drawing operations (rectangle, ellipse)
                if (data.type === 'rectangle') {
                    this.brushPreview.drawRectangle = true;
                    this.brushPreview.drawStartX = data.startX;
                    this.brushPreview.drawStartY = data.startY;
                } else if (data.type === 'ellipse') {
                    this.brushPreview.drawEllipse = true;
                    this.brushPreview.drawStartX = data.startX;
                    this.brushPreview.drawStartY = data.startY;
                } else if (data.type === 'line') {
                    // Add support for line drawing
                    this.brushPreview.drawStartX = data.startX;
                    this.brushPreview.drawStartY = data.startY;
                }
                break;
            case 'drawingComplete':
                // Handle completion of drawing operations
                if (data.type === 'rectangle') {
                    this.brushPreview.drawRectangle = false;
                    
                    // Actually draw the rectangle when complete
                    if (data.startX !== undefined && data.startY !== undefined && 
                        data.endX !== undefined && data.endY !== undefined && 
                        data.currentLayer !== undefined && data.tileIndex !== undefined) {
                        
                        // Calculate rectangle bounds
                        const startX = Math.min(data.startX, data.endX);
                        const startY = Math.min(data.startY, data.endY);
                        const endX = Math.max(data.startX, data.endX);
                        const endY = Math.max(data.startY, data.endY);
                        
                        // Fill the rectangle with the selected tile
                        if (this.sharedMapData) {
                            for (let y = startY; y <= endY; y++) {
                                for (let x = startX; x <= endX; x++) {
                                    if (x >= 0 && x < this.mapWidth && 
                                        y >= 0 && y < this.mapHeight) {
                                        const index = this.getFlatIndex(data.currentLayer, y, x);
                                        this.sharedMapData[index] = data.tileIndex;
                                    }
                                }
                            }
                        }
                    }
                } else if (data.type === 'ellipse') {
                    this.brushPreview.drawEllipse = false;
                    
                    // Actually draw the ellipse when complete
                    if (data.startX !== undefined && data.startY !== undefined && 
                        data.endX !== undefined && data.endY !== undefined && 
                        data.currentLayer !== undefined && data.tileIndex !== undefined) {
                        
                        console.log('RenderWorker: Drawing ellipse with tile index:', data.tileIndex);
                        
                        // Calculate center and radii
                        const centerX = Math.floor((data.startX + data.endX) / 2);
                        const centerY = Math.floor((data.startY + data.endY) / 2);
                        const radiusX = Math.abs(data.endX - data.startX) / 2;
                        const radiusY = Math.abs(data.endY - data.startY) / 2;
                        
                        console.log('RenderWorker: Ellipse parameters:', {
                            centerX,
                            centerY,
                            radiusX,
                            radiusY,
                            startX: data.startX,
                            startY: data.startY,
                            endX: data.endX,
                            endY: data.endY,
                            layer: data.currentLayer
                        });
                        
                        // Get all points in the ellipse
                        const points = getEllipsePoints(centerX, centerY, radiusX, radiusY);
                        
                        console.log(`RenderWorker: Generated ${points.length} points for ellipse`);
                        
                        // Fill all points with the selected tile
                        if (this.sharedMapData) {
                            let pointsUpdated = 0;
                            for (const point of points) {
                                if (point.x >= 0 && point.x < this.mapWidth && 
                                    point.y >= 0 && point.y < this.mapHeight) {
                                    const index = this.getFlatIndex(data.currentLayer, point.y, point.x);
                                    this.sharedMapData[index] = data.tileIndex;
                                    pointsUpdated++;
                                }
                            }
                            console.log(`RenderWorker: Updated ${pointsUpdated} points with tile index ${data.tileIndex}`);
                        }
                    }
                } else if (data.type === 'line') {
                    // Handle line drawing completion
                    if (data.startX !== undefined && data.startY !== undefined && 
                        data.endX !== undefined && data.endY !== undefined && 
                        data.currentLayer !== undefined && data.tileIndex !== undefined) {
                        
                        // Get points along the line
                        const points = getLinePoints(data.startX, data.startY, data.endX, data.endY);
                        
                        // Fill all points with the selected tile
                        if (this.sharedMapData) {
                            for (const point of points) {
                                if (point.x >= 0 && point.x < this.mapWidth && 
                                    point.y >= 0 && point.y < this.mapHeight) {
                                    const index = this.getFlatIndex(data.currentLayer, point.y, point.x);
                                    this.sharedMapData[index] = data.tileIndex;
                                }
                            }
                        }
                    }
                }
                
                // Reset drawing coordinates
                this.brushPreview.drawStartX = undefined;
                this.brushPreview.drawStartY = undefined;
                
                // Mark layer for update since the operation is complete
                if (this.updateFlags && data.currentLayer !== undefined) {
                    Atomics.store(this.updateFlags, data.currentLayer, 1);
                }
                
                // Mark LOD canvases as dirty
                this.markLODCanvasDirty();
                break;
            case 'floodFill':
                // Actually perform the flood fill operation
                if (data.x !== undefined && data.y !== undefined && 
                    data.layer !== undefined && data.tileIndex !== undefined && 
                    data.targetValue !== undefined) {
                    
                    // Perform the flood fill
                    this.floodFill(
                        data.layer,
                        data.x,
                        data.y,
                        data.targetValue,
                        data.tileIndex
                    );
                    
                    // Mark the layer as needing update
                    if (this.updateFlags) {
                        Atomics.store(this.updateFlags, data.layer, 1);
                    }
                    
                    // Mark LOD canvases as dirty
                    this.markLODCanvasDirty();
                }
                break;
        }
        
        // Request a render
        this.redrawAll();
    }

    // Update a layer buffer with current tile data (only for the visible area)
    private updateLayerBuffer(layer: number) {
        if (!this.layerContexts[layer] || !this.sharedMapData) return;
        
        const ctx = this.layerContexts[layer];
        
        // Clear the buffer for this layer
        ctx.clearRect(0, 0, this.layerBuffers[layer].width, this.layerBuffers[layer].height);
        
        // Get the viewport boundaries with additional lookahead for fast scrolling
        const lookahead = 5; // Additional lookahead beyond viewport
        const left = Math.max(0, this.viewport.left - lookahead);
        const top = Math.max(0, this.viewport.top - lookahead);
        const right = Math.min(this.mapWidth - 1, this.viewport.right + lookahead);
        const bottom = Math.min(this.mapHeight - 1, this.viewport.bottom + lookahead);
        
        // For debugging
        let nonEmptyTiles = 0;
        
        if (this.useDirectAtlas && this.tilemapImage) {
            // Use batched drawing with the direct atlas approach
            this.batchDrawTilesFromAtlas(layer, ctx, left, top, right, bottom);
            
            // Count non-empty tiles for debugging
            for (let y = top; y <= bottom; y++) {
                for (let x = left; x <= right; x++) {
                    const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
                    if (tileIndex !== -1) {
                        nonEmptyTiles++;
                    }
                }
            }
        } else {
            // Original approach - draw tiles individually
            // Only loop through tiles in the viewport (with lookahead margin)
            for (let y = top; y <= bottom; y++) {
                for (let x = left; x <= right; x++) {
                    // Skip bounds checking since we've already clamped the values
                    const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
                    
                    if (tileIndex !== -1) {
                        this.drawTileToContext(ctx, x, y, tileIndex);
                        nonEmptyTiles++;
                    }
                }
            }
        }
        
        if (this.debugMode && nonEmptyTiles > 0) {
            console.log(`RenderWorker: Layer ${layer} - Drew ${nonEmptyTiles} tiles in viewport area (${left},${top} to ${right},${bottom})`);
        }
    }
    
    // Get a canvas from the pool or create a new one
    private getCanvasFromPool(width: number, height: number): OffscreenCanvas {
        // Try to find a canvas of the right size in the pool
        for (let i = 0; i < this.canvasPool.length; i++) {
            const canvas = this.canvasPool[i];
            if (canvas.width === width && canvas.height === height) {
                // Remove from pool and return it
                this.canvasPool.splice(i, 1);
                return canvas;
            }
        }
        
        // If no suitable canvas found, create a new one
        return new OffscreenCanvas(width, height);
    }
    
    // Return a canvas to the pool
    private returnCanvasToPool(canvas: OffscreenCanvas) {
        // Only keep a limited number of canvases in the pool
        if (this.canvasPool.length < this.MAX_POOL_SIZE) {
            // Clear the canvas before returning it to the pool
            const ctx = canvas.getContext('2d')!;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.canvasPool.push(canvas);
        }
        // If pool is full, the canvas will be garbage collected
    }

    // Batch draw tiles from the atlas for better performance
    private batchDrawTilesFromAtlas(layer: number, ctx: OffscreenCanvasRenderingContext2D, left: number, top: number, right: number, bottom: number) {
        if (!this.tilemapImage) return;
        
        // Use batch size from render settings
        let batchSize = this.renderSettings.batchSize;
        
        // Adjust batch size based on map size for better performance
        // Smaller batch size for smaller maps, larger for larger maps
        const mapSize = this.mapWidth * this.mapHeight;
        
        if (mapSize > 250000) { // For very large maps (500x500+)
            batchSize = Math.min(64, batchSize * 2);
        } else if (mapSize < 10000) { // For small maps (100x100 or less)
            batchSize = Math.max(4, Math.floor(batchSize / 2));
        }
        
        // For very zoomed out views, use larger batches
        if (this.transform.zoom < 0.2) {
            batchSize = Math.min(64, batchSize * 2);
        }
        
        // Process tiles in batches
        for (let batchY = Math.floor(top / batchSize); batchY <= Math.floor(bottom / batchSize); batchY++) {
            for (let batchX = Math.floor(left / batchSize); batchX <= Math.floor(right / batchSize); batchX++) {
                // Calculate batch boundaries
                const startX = Math.max(left, batchX * batchSize);
                const startY = Math.max(top, batchY * batchSize);
                const endX = Math.min(right, (batchX + 1) * batchSize - 1);
                const endY = Math.min(bottom, (batchY + 1) * batchSize - 1);
                
                // Skip empty batches
                if (startX > endX || startY > endY) continue;
                
                // Calculate batch dimensions
                const batchWidth = endX - startX + 1;
                const batchHeight = endY - startY + 1;
                
                // Skip tiny batches
                if (batchWidth <= 0 || batchHeight <= 0) continue;
                
                // Get a canvas from the pool
                const batchCanvas = this.getCanvasFromPool(
                    batchWidth * this.tileWidth, 
                    batchHeight * this.tileHeight
                );
                const batchCtx = batchCanvas.getContext('2d', { alpha: true })!;
                batchCtx.imageSmoothingEnabled = false;
                
                // Clear the canvas (in case it wasn't properly cleared when returned to the pool)
                batchCtx.clearRect(0, 0, batchCanvas.width, batchCanvas.height);
                
                // Fill the batch canvas with tiles
                let hasContent = false;
                let tileCount = 0;
                
                // Process each tile in the batch
                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
                        
                        if (tileIndex !== -1) {
                            const sourceCoords = this.tileSourceCoords.get(tileIndex);
                            
                            if (sourceCoords) {
                                // Draw directly from the tilemap image using the source coordinates
                                batchCtx.drawImage(
                                    this.tilemapImage,
                                    sourceCoords.x, sourceCoords.y, this.tileWidth, this.tileHeight,
                                    (x - startX) * this.tileWidth, (y - startY) * this.tileHeight, 
                                    this.tileWidth, this.tileHeight
                                );
                                hasContent = true;
                                tileCount++;
                            }
                        }
                    }
                }
                
                // If the batch has content, draw it to the layer buffer
                if (hasContent) {
                    ctx.drawImage(
                        batchCanvas,
                        0, 0, batchCanvas.width, batchCanvas.height,
                        startX * this.tileWidth, startY * this.tileHeight, 
                        batchCanvas.width, batchCanvas.height
                    );
                    
                    if (this.debugMode && this.frameCount % 100 === 0) {
                        console.log(`RenderWorker: Drew batch with ${tileCount} tiles at (${startX},${startY}) to (${endX},${endY})`);
                    }
                }
                
                // Return the canvas to the pool
                this.returnCanvasToPool(batchCanvas);
            }
        }
    }

    // Draw a tile to a specific context
    private drawTileToContext(ctx: OffscreenCanvasRenderingContext2D, tileX: number, tileY: number, tileIndex: number) {
        if (tileIndex === -1) return;
        
        // Calculate the destination position
        const destX = tileX * this.tileWidth;
        const destY = tileY * this.tileHeight;
        
        if (this.useDirectAtlas) {
            // Use direct atlas approach - draw directly from the tilemap image
            if (!this.tilemapImage) {
                console.warn('RenderWorker: No tilemap image available for direct atlas rendering');
                return;
            }
            
            const sourceCoords = this.tileSourceCoords.get(tileIndex);
            if (!sourceCoords) {
                console.warn('RenderWorker: No source coordinates found for tile index', tileIndex);
                return;
            }
            
            try {
                // Draw directly from the tilemap image using the source coordinates
                ctx.drawImage(
                    this.tilemapImage,
                    sourceCoords.x, sourceCoords.y, this.tileWidth, this.tileHeight,
                    destX, destY, this.tileWidth, this.tileHeight
                );
                
                if (this.debugMode && tileIndex < 5) {
                    console.log('RenderWorker: Drew tile using direct atlas:', {
                        tileIndex,
                        sourceX: sourceCoords.x,
                        sourceY: sourceCoords.y,
                        destX,
                        destY
                    });
                }
            } catch (error) {
                console.error('RenderWorker: Error drawing tile using direct atlas:', error, {
                    tileIndex, sourceCoords, destX, destY
                });
            }
        } else {
            // Original approach - use cached ImageBitmap objects
            const tile = this.tileCache.get(tileIndex);
            if (!tile) {
                console.warn('RenderWorker: No cached tile found for index', tileIndex);
                return;
            }
            
            try {
                // Draw the tile
                ctx.drawImage(
                    tile,
                    0, 0, this.tileWidth, this.tileHeight,
                    destX, destY, this.tileWidth, this.tileHeight
                );
            } catch (error) {
                console.error('RenderWorker: Error drawing tile to context:', error, {
                    tileX, tileY, tileIndex
                });
            }
        }
    }

    // Set layer visibility
    private setLayerVisibility(layer: number, visible: boolean) {
        if (layer >= 0 && layer < this.layerVisibility.length) {
            this.layerVisibility[layer] = visible;
            
            // Mark the layer buffer as dirty if visibility changed to true
            if (visible && layer < this.layerDirty.length) {
                this.layerDirty[layer] = true;
            }
            
            // Request a redraw
            this.redrawAll();
        }
    }

    private updateMapDimensions(
        mapWidth: number,
        mapHeight: number,
        sharedMapData: SharedArrayBuffer | null,
        updateFlags: SharedArrayBuffer,
        mapDimensions: { width: number, height: number, layers: number } | null
    ) {
        if (this.debugMode) {
            console.log('RenderWorker: Updating map dimensions:', {
                mapWidth,
                mapHeight,
                sharedMapData,
                updateFlags,
                mapDimensions
            });
        }

        try {
            // Update the map dimensions
            this.mapWidth = mapWidth;
            this.mapHeight = mapHeight;
            
            // Set up shared map data if provided
            if (sharedMapData && mapDimensions) {
                this.sharedMapData = new Int32Array(sharedMapData);
                this.layerCount = mapDimensions.layers;
                console.log('RenderWorker: Using shared map data with layers:', this.layerCount);
                
                // Validate sizes
                const expectedSize = mapWidth * mapHeight * this.layerCount;
                const actualSize = this.sharedMapData.length;
                if (actualSize < expectedSize) {
                    throw new Error(`Shared buffer too small! Expected ${expectedSize} integers, got ${actualSize}`);
                }
            } else {
                console.error('RenderWorker: No shared map data provided');
                throw new Error('No shared map data provided');
            }
            
            // Set up update flags
            if (updateFlags) {
                this.updateFlags = new Int32Array(updateFlags);
                console.log('RenderWorker: Using update flags buffer with size:', this.updateFlags.length);
                
                if (this.updateFlags.length < this.layerCount) {
                    throw new Error(`Update flags buffer too small: ${this.updateFlags.length}, need ${this.layerCount}`);
                }
                
                // Set all flags to 1 to force initial render
                for (let i = 0; i < this.layerCount; i++) {
                    Atomics.store(this.updateFlags, i, 1);
                }
            } else {
                console.error('RenderWorker: No update flags buffer provided');
                throw new Error('No update flags buffer provided');
            }

            // Reinitialize layer buffers with new dimensions
            this.initializeLayerBuffers();

            // Update the viewport
            this.updateViewport();
            
            // Redraw everything
            this.redrawAll();
            
            // Notify main thread that map dimensions are updated
            console.log('RenderWorker: Map dimensions updated');
            self.postMessage({
                type: 'mapDimensionsUpdated'
            });
        } catch (error: unknown) {
            console.error('RenderWorker: Error updating map dimensions:', error);
            self.postMessage({
                type: 'mapDimensionsError',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // Set the current layer and layer visibility mode
    private setCurrentLayer(layer: number, showAllLayers: boolean) {
        this.currentLayer = layer;
        this.showAllLayers = showAllLayers;
        
        // Request a redraw to update layer opacities
        this.requestRender();
    }

    // Clean up resources when destroying the worker
    private cleanup() {
        // Close all ImageBitmap objects
        for (const tile of this.tileCache.values()) {
            tile.close();
        }
        this.tileCache.clear();
        
        // Close the tilemap image
        if (this.tilemapImage) {
            this.tilemapImage.close();
            this.tilemapImage = null;
        }
        
        // Clear the canvas pool
        this.canvasPool = [];
        
        // Clear LOD canvases
        this.lodCanvases.clear();
        
        console.log('RenderWorker: Resources cleaned up');
    }

    // Add a method to handle worker termination
    private handleTerminate() {
        // Clean up resources
        this.cleanup();
        
        // Cancel any pending animation frame
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Clear any pending timeout
        if (this.resizeEndTimeout !== null) {
            clearTimeout(this.resizeEndTimeout);
            this.resizeEndTimeout = null;
        }
    }

    // Update render settings
    private updateRenderSettings(settings: RenderSettings) {
        console.log('RenderWorker: Updating render settings:', settings);
        
        // Update settings
        this.renderSettings = { ...settings };
        
        // Apply settings
        this.useLOD = settings.useLOD;
        this.lodThreshold = settings.lodThreshold;
        this.lodQuality = settings.lodQuality;
        this.useDirectAtlas = settings.useDirectAtlas;
        this.debugMode = settings.debugMode;
        
        // Mark all LOD canvases as dirty to force regeneration
        this.markLODCanvasDirty();
        
        // Force a redraw with new settings
        this.redrawAll();
        
        // Acknowledge settings update
        self.postMessage({
            type: 'renderSettingsUpdated'
        });
    }

    // Add this method to implement flood fill in the worker
    private floodFill(
        layer: number,
        startX: number,
        startY: number,
        targetValue: number,
        fillValue: number
    ): Point[] {
        if (!this.sharedMapData) return [];
        
        const width = this.mapWidth;
        const height = this.mapHeight;

        // Check for invalid start conditions
        if (startX < 0 || startX >= width || startY < 0 || startY >= height ||
            this.getTileFromSharedBuffer(layer, startY, startX) !== targetValue || 
            targetValue === fillValue) {
            return [];
        }

        const filledPoints: Point[] = [];
        // Use tuple [x, y] to reduce allocation overhead
        const stack: [number, number][] = [[startX, startY]];

        while (stack.length) {
            const [x, y] = stack.pop()!;
            let xLeft = x;
            let xRight = x;

            // Move left to find the beginning of the span
            while (xLeft >= 0 && this.getTileFromSharedBuffer(layer, y, xLeft) === targetValue) {
                xLeft--;
            }
            xLeft++;

            // Move right to find the end of the span
            while (xRight < width && this.getTileFromSharedBuffer(layer, y, xRight) === targetValue) {
                xRight++;
            }
            xRight--;

            // Fill the span and record points
            for (let i = xLeft; i <= xRight; i++) {
                // Update the shared buffer directly
                const index = this.getFlatIndex(layer, y, i);
                if (this.sharedMapData[index] === targetValue) {
                    this.sharedMapData[index] = fillValue;
                    filledPoints.push({ x: i, y });
                }
            }

            // Check the rows above and below for new spans
            for (const newY of [y - 1, y + 1]) {
                if (newY < 0 || newY >= height) continue;
                let i = xLeft;
                while (i <= xRight) {
                    if (this.getTileFromSharedBuffer(layer, newY, i) === targetValue) {
                        // Push the start of a new span onto the stack
                        stack.push([i, newY]);
                        // Skip the contiguous segment
                        while (i <= xRight && this.getTileFromSharedBuffer(layer, newY, i) === targetValue) {
                            i++;
                        }
                    } else {
                        i++;
                    }
                }
            }
        }

        return filledPoints;
    }

    // Unified drawing handler for all drawing operations
    private handleDrawOperation(operation: DrawOperation) {
        if (this.debugMode) {
            console.log('RenderWorker: Handling draw operation:', operation);
        }

        // Common validation
        if (operation.layer < 0 || operation.layer >= this.layerCount) {
            console.error('RenderWorker: Invalid layer:', operation.layer);
            return;
        }

        // Process based on operation type
        switch (operation.type) {
            case 'brush':
                this.drawBrush(operation);
                break;
            case 'rectangle':
                this.drawRectangle(operation);
                break;
            case 'ellipse':
                this.drawEllipse(operation);
                break;
            case 'fill':
                this.drawFloodFill(operation);
                break;
            case 'line':
                this.drawLine(operation);
                break;
            case 'custom':
                // Handle custom drawing operations
                console.warn('RenderWorker: Custom drawing not implemented yet');
                break;
            default:
                console.error('RenderWorker: Unknown draw operation type:', (operation as any).type);
                return;
        }

        // Common post-processing
        if (this.updateFlags) {
            // Mark the layer as needing update
            Atomics.store(this.updateFlags, operation.layer, 1);
        }

        // Mark LOD canvases as dirty
        this.markLODCanvasDirty();

        // Request a render
        this.redrawAll();
    }
    
    // Individual drawing methods
    
    // Draw with a brush (single tile or pattern)
    private drawBrush(operation: DrawOperation) {
        if (!this.sharedMapData) return;
        
        const { layer, startX, startY, tileIndex, brushSize = 1, isErasing } = operation;
        
        // Calculate the brush area
        const area = calculateBrushArea(startX, startY, brushSize);
        
        if (isErasing) {
            // Handle erasing - set all tiles in the area to -1
            for (let y = area.y; y < area.y + area.height; y++) {
                for (let x = area.x; x < area.x + area.width; x++) {
                    if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
                        const index = this.getFlatIndex(layer, y, x);
                        this.sharedMapData[index] = -1;
                    }
                }
            }
        } else {
            // Handle painting - set all tiles in the area to the specified tile index
            for (let y = area.y; y < area.y + area.height; y++) {
                for (let x = area.x; x < area.x + area.width; x++) {
                    if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
                        const index = this.getFlatIndex(layer, y, x);
                        this.sharedMapData[index] = tileIndex;
                    }
                }
            }
        }
        
        if (this.debugMode) {
            console.log(`RenderWorker: Drew brush at (${startX}, ${startY}) with size ${brushSize} and tile index ${tileIndex}`);
        }
    }
    
    // Draw a rectangle
    private drawRectangle(operation: DrawOperation) {
        if (!this.sharedMapData) return;
        
        const { layer, startX, startY, endX = startX, endY = startY, tileIndex, isErasing } = operation;
        
        // Calculate the rectangle bounds
        const x1 = Math.min(startX, endX);
        const y1 = Math.min(startY, endY);
        const x2 = Math.max(startX, endX);
        const y2 = Math.max(startY, endY);
        
        // Fill the rectangle with the specified tile
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                if (x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight) {
                    const index = this.getFlatIndex(layer, y, x);
                    this.sharedMapData[index] = isErasing ? -1 : tileIndex;
                }
            }
        }
        
        if (this.debugMode) {
            console.log(`RenderWorker: Drew rectangle from (${x1}, ${y1}) to (${x2}, ${y2}) with tile index ${tileIndex}`);
        }
    }
    
    // Draw an ellipse
    private drawEllipse(operation: DrawOperation) {
        if (!this.sharedMapData) return;
        
        const { layer, startX, startY, endX = startX, endY = startY, tileIndex, isErasing } = operation;
        
        // Calculate center and radii
        const centerX = Math.floor((startX + endX) / 2);
        const centerY = Math.floor((startY + endY) / 2);
        const radiusX = Math.abs(endX - startX) / 2;
        const radiusY = Math.abs(endY - startY) / 2;
        
        if (this.debugMode) {
            console.log('RenderWorker: Drawing ellipse with parameters:', {
                centerX, centerY, radiusX, radiusY, tileIndex, isErasing
            });
        }
        
        // Get all points in the ellipse using the global function
        const points = getEllipsePoints(centerX, centerY, radiusX, radiusY);
        
        // Fill all points with the specified tile
        let pointsUpdated = 0;
        for (const point of points) {
            if (point.x >= 0 && point.x < this.mapWidth && point.y >= 0 && point.y < this.mapHeight) {
                const index = this.getFlatIndex(layer, point.y, point.x);
                this.sharedMapData[index] = isErasing ? -1 : tileIndex;
                pointsUpdated++;
            }
        }
        
        if (this.debugMode) {
            console.log(`RenderWorker: Drew ellipse with ${pointsUpdated} points with tile index ${tileIndex}`);
        }
    }
    
    // Perform a flood fill
    private drawFloodFill(operation: DrawOperation) {
        if (!this.sharedMapData) return;
        
        const { layer, startX, startY, tileIndex, isErasing } = operation;
        
        // Get the target value (the value we're replacing)
        const targetValue = this.getTileFromSharedBuffer(layer, startY, startX);
        
        // Don't do anything if the target is already the desired value
        if (targetValue === (isErasing ? -1 : tileIndex)) {
            if (this.debugMode) {
                console.log(`RenderWorker: Flood fill skipped - target already has the desired value`);
            }
            return;
        }
        
        // Perform the flood fill
        const points = this.floodFill(
            layer,
            startX,
            startY,
            targetValue,
            isErasing ? -1 : tileIndex
        );
        
        if (this.debugMode) {
            console.log(`RenderWorker: Flood filled ${points.length} points with tile index ${tileIndex}`);
        }
    }
    
    // Draw a line
    private drawLine(operation: DrawOperation) {
        if (!this.sharedMapData) return;
        
        const { layer, startX, startY, endX = startX, endY = startY, tileIndex, isErasing } = operation;
        
        // Use Bresenham's line algorithm from the global function
        const points = getLinePoints(startX, startY, endX, endY);
        
        // Fill all points with the specified tile
        for (const point of points) {
            if (point.x >= 0 && point.x < this.mapWidth && point.y >= 0 && point.y < this.mapHeight) {
                const index = this.getFlatIndex(layer, point.y, point.x);
                this.sharedMapData[index] = isErasing ? -1 : tileIndex;
            }
        }
        
        if (this.debugMode) {
            console.log(`RenderWorker: Drew line from (${startX}, ${startY}) to (${endX}, ${endY}) with ${points.length} points`);
        }
    }
}

// Create and export the worker instance
const worker = new RenderWorker(); 
export default worker; 