// RenderWorker.ts - Handles rendering operations in a separate thread using OffscreenCanvas

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
        ellipseStartX?: number;
        ellipseStartY?: number;
        rectangleStartX?: number;
        rectangleStartY?: number;
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
                        data.debugMode
                    );
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
            ellipseStartX: data.ellipseStartX,
            ellipseStartY: data.ellipseStartY,
            rectangleStartX: data.rectangleStartX,
            rectangleStartY: data.rectangleStartY,
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
        
        // Convert from pixels to tile coordinates, adding a buffer of 1 tile
        const oldViewport = { ...this.viewport };
        this.viewport.left = Math.max(0, Math.floor(leftPx / this.tileWidth) - 1);
        this.viewport.top = Math.max(0, Math.floor(topPx / this.tileHeight) - 1);
        this.viewport.right = Math.min(this.mapWidth - 1, Math.ceil(rightPx / this.tileWidth) + 1);
        this.viewport.bottom = Math.min(this.mapHeight - 1, Math.ceil(bottomPx / this.tileHeight) + 1);
        
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
    
    // Render a frame
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
            
            // Draw layers from back to front
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
                
                if (layersRedrawn > 0) {
                    console.log(`RenderWorker: Updated ${layersRedrawn} layer buffers`);
                }
                
                if (this.frameCount % 30 === 0) {
                    console.log(`RenderWorker: Rendered ${tilesRendered} visible tiles from ${this.viewport.left},${this.viewport.top} to ${this.viewport.right},${this.viewport.bottom}`);
                }
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
            this.animationFrameId = requestAnimationFrame(this.renderFrame.bind(this));
        } else {
            // Reset the running flag
            this.isRunning = false;
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
            this.brushPreview.ellipseStartX !== undefined && 
            this.brushPreview.ellipseStartY !== undefined) {
            // Draw ellipse preview
            const radiusX = Math.abs(brushX - this.brushPreview.ellipseStartX);
            const radiusY = Math.abs(brushY - this.brushPreview.ellipseStartY);
            
            this.drawEllipsePreview(
                this.brushPreview.ellipseStartX, 
                this.brushPreview.ellipseStartY, 
                radiusX, 
                radiusY
            );
        } else if (this.brushPreview.drawRectangle && 
                  this.brushPreview.rectangleStartX !== undefined && 
                  this.brushPreview.rectangleStartY !== undefined) {
            // Draw rectangle preview
            const startX = Math.min(this.brushPreview.rectangleStartX, brushX);
            const startY = Math.min(this.brushPreview.rectangleStartY, brushY);
            const width = Math.abs(brushX - this.brushPreview.rectangleStartX) + 1;
            const height = Math.abs(brushY - this.brushPreview.rectangleStartY) + 1;
            
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
        
        // Resize the canvas
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Make sure the context has the right settings
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
        }
        
        // Update the viewport
        this.updateViewport();
        
        // Mark all layers as dirty to force a redraw
        for (let i = 0; i < this.layerDirty.length; i++) {
            this.layerDirty[i] = true;
        }
        
        // Redraw everything
        this.redrawAll();
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
        debugMode: boolean
    ) {
        // Update the debug mode from initialization parameters
        this.debugMode = debugMode;
        
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
            debugMode
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
        // Clean up existing buffers
        this.layerBuffers = [];
        this.layerContexts = [];
        this.layerDirty = [];
        
        // Create a buffer for each layer
        for (let i = 0; i < this.layerCount; i++) {
            const buffer = new OffscreenCanvas(
                this.mapWidth * this.tileWidth,
                this.mapHeight * this.tileHeight
            );
            const ctx = buffer.getContext('2d', { alpha: true })!;
            ctx.imageSmoothingEnabled = false;
            
            this.layerBuffers.push(buffer);
            this.layerContexts.push(ctx);
            this.layerDirty.push(true); // Initially mark all layers as dirty
        }
        
        console.log(`RenderWorker: Created ${this.layerCount} layer buffers`);
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
                tileSpacing: this.tileSpacing
            });
        }

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
                    this.brushPreview.rectangleStartX = data.startX;
                    this.brushPreview.rectangleStartY = data.startY;
                } else if (data.type === 'ellipse') {
                    this.brushPreview.drawEllipse = true;
                    this.brushPreview.ellipseStartX = data.startX;
                    this.brushPreview.ellipseStartY = data.startY;
                }
                break;
            case 'drawingComplete':
                // Handle completion of drawing operations
                if (data.type === 'rectangle') {
                    this.brushPreview.drawRectangle = false;
                } else if (data.type === 'ellipse') {
                    this.brushPreview.drawEllipse = false;
                }
                
                // Mark layer for update since the operation is complete
                if (this.updateFlags && data.currentLayer !== undefined) {
                    Atomics.store(this.updateFlags, data.currentLayer, 1);
                }
                break;
            case 'floodFill':
                // Handle flood fill operation
                if (this.updateFlags && data.layer !== undefined) {
                    Atomics.store(this.updateFlags, data.layer, 1);
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
        
        // Get the viewport boundaries
        const left = this.viewport.left;
        const top = this.viewport.top;
        const right = this.viewport.right;
        const bottom = this.viewport.bottom;
        
        // For debugging
        let nonEmptyTiles = 0;
        
        // Only loop through tiles in the viewport (with a small margin)
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                const tileIndex = this.getTileFromSharedBuffer(layer, y, x);
                
                if (tileIndex !== -1) {
                    this.drawTileToContext(ctx, x, y, tileIndex);
                    nonEmptyTiles++;
                }
            }
        }
    }
    
    // Draw a tile to a specific context
    private drawTileToContext(ctx: OffscreenCanvasRenderingContext2D, tileX: number, tileY: number, tileIndex: number) {
        if (tileIndex === -1) return;
        
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
}

// Create and export the worker instance
const worker = new RenderWorker(); 
export default worker; 