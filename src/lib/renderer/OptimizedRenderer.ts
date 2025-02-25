// OptimizedRenderer.ts - Manages optimized rendering using web workers with OffscreenCanvas

import type { MapData } from '../types/map';

export class OptimizedRenderer {
    private canvas: HTMLCanvasElement;
    private worker: Worker | null = null;
    private isInitialized = false;
    
    // Shared memory for map data
    private sharedMapData: Int32Array | null = null;
    private mapWidth = 0;
    private mapHeight = 0;
    private layerCount = 0;
    private tileWidth = 0;
    private tileHeight = 0;
    
    // For tracking render state
    private updateFlags: Int32Array | null = null;
    private updateFlagsBuffer: SharedArrayBuffer | null = null;
    
    // Transform state
    private transform: { offsetX: number; offsetY: number; zoom: number } = {
        offsetX: 0,
        offsetY: 0,
        zoom: 1
    };

    // Debug settings
    private debugMode = false;

    constructor(canvas: HTMLCanvasElement, debugMode = false) {
        this.canvas = canvas;
        this.debugMode = debugMode;
        
        console.log('OptimizedRenderer: Created renderer instance with debug mode:', debugMode);

        // Check if SharedArrayBuffer is available
        const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';
        console.log('OptimizedRenderer: SharedArrayBuffer available:', sharedArrayBufferAvailable);
        
        if (!sharedArrayBufferAvailable) {
            console.error('OptimizedRenderer: SharedArrayBuffer is not available. This application requires SharedArrayBuffer support.');
            this.drawDebugPattern('red');
            return;
        }
        
        // Check if we're cross-origin isolated (needed for SharedArrayBuffer)
        console.log('OptimizedRenderer: Cross-Origin Isolated:', window.crossOriginIsolated);
        
        if (!window.crossOriginIsolated) {
            console.error('OptimizedRenderer: Cross-Origin Isolation is required. Please ensure proper headers are set on the server.');
            this.drawDebugPattern('red');
            return;
        }
        
        try {
            // Use the Vite-recommended way to import workers
            const workerUrl = new URL('../workers/RenderWorker.ts', import.meta.url);
            console.log('OptimizedRenderer: Creating worker with URL:', workerUrl.toString());
            
            // Create the worker with correct module syntax
            this.worker = new Worker(workerUrl, { type: 'module' });
            console.log('OptimizedRenderer: Worker created successfully');
            
            // Add error handling for the worker
            this.worker.onerror = (e) => {
                console.error('OptimizedRenderer: Worker error:', e);
                console.error('OptimizedRenderer: Error details:', {
                    message: (e as any).message || 'No message',
                    filename: (e as any).filename || 'No filename',
                    lineno: (e as any).lineno || 'No line number',
                    colno: (e as any).colno || 'No column number'
                });
                
                // Show error visualization on the canvas
                this.drawDebugPattern('red');
            };
            
            // Set up worker message handling
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
        } catch (error) {
            console.error('OptimizedRenderer: Failed to create worker:', error);
            this.drawDebugPattern('red');
        }
    }

    private handleWorkerMessage(e: MessageEvent) {
        const { type } = e.data;
        
        if (type === 'initComplete') {
            console.log('OptimizedRenderer: Worker initialization complete');
            this.isInitialized = true;
            
            // Immediately request a full render
            this.redrawAll();
            return;
        }
        
        // Handle worker feedback messages
        switch (type) {
            case 'tileRedrawn':
                if (this.debugMode) {
                    console.log('OptimizedRenderer: Worker reported tile redrawn:', e.data);
                }
                break;
            case 'regionRedrawn':
                console.log('OptimizedRenderer: Worker reported region redrawn:', e.data);
                break;
            case 'frameComplete':
                if (this.debugMode) {
                    console.log('OptimizedRenderer: Worker reported frame complete');
                }
                break;
            case 'error':
                console.error('OptimizedRenderer: Worker reported error:', e.data);
                this.drawDebugPattern('yellow');
                break;
            case 'initError':
                console.error('OptimizedRenderer: Worker initialization failed:', e.data.error);
                this.drawDebugPattern('red');
                break;
            default:
                if (this.debugMode) {
                    console.log('OptimizedRenderer: Received unknown message from worker:', type);
                }
        }
    }

    // Helper method to draw a debug pattern when there's an error
    private drawDebugPattern(color: string = 'yellow') {
        console.log('OptimizedRenderer: Drawing debug pattern');
        const ctx = this.canvas.getContext('2d')!;
        
        // Draw a checkered pattern
        const tileSize = 20;
        for (let y = 0; y < this.canvas.height; y += tileSize) {
            for (let x = 0; x < this.canvas.width; x += tileSize) {
                if ((x + y) % (tileSize * 2) === 0) {
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, tileSize, tileSize);
                }
            }
        }
        
        // Draw text indicating there was an error
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.fillText('Renderer Error - Check Console', 20, 50);
    }

    // Convert 3D coordinates to flat index in the shared buffer
    private getFlatIndex(layer: number, y: number, x: number): number {
        return (layer * this.mapHeight * this.mapWidth) + (y * this.mapWidth) + x;
    }

    async initialize(
        mapWidth: number,
        mapHeight: number,
        tileWidth: number,
        tileHeight: number,
        tileSpacing: number,
        tilemapUrl: string,
        canvasWidth: number,
        canvasHeight: number,
        initialMapData?: MapData,
        externalSharedBuffer?: SharedArrayBuffer
    ) {
        console.log('OptimizedRenderer: Initializing with dimensions:', {
            mapWidth,
            mapHeight,
            tileWidth,
            tileHeight,
            tileSpacing,
            canvasWidth,
            canvasHeight,
            hasExternalBuffer: !!externalSharedBuffer,
            hasInitialMapData: !!initialMapData
        });

        // Ensure the canvas is properly sized before transferring it
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;

        // Store dimensions
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.layerCount = initialMapData ? initialMapData.length : 10;
        
        // Set up shared map data
        if (externalSharedBuffer) {
            console.log('OptimizedRenderer: Using external shared buffer');
            this.sharedMapData = new Int32Array(externalSharedBuffer);
        } else if (initialMapData) {
            console.log('OptimizedRenderer: Creating new shared buffer from initial data');
            // Calculate buffer size
            const bufferSize = mapWidth * mapHeight * this.layerCount;
            
            // Create shared buffer
            const sharedBuffer = new SharedArrayBuffer(bufferSize * Int32Array.BYTES_PER_ELEMENT);
            this.sharedMapData = new Int32Array(sharedBuffer);
            
            // Initialize with data
            for (let layer = 0; layer < initialMapData.length; layer++) {
                for (let y = 0; y < mapHeight; y++) {
                    for (let x = 0; x < mapWidth; x++) {
                        const index = this.getFlatIndex(layer, y, x);
                        this.sharedMapData[index] = initialMapData[layer][y][x];
                    }
                }
            }
        } else {
            console.error('OptimizedRenderer: No map data provided');
            return;
        }
        
        // Create update flags buffer
        this.updateFlagsBuffer = new SharedArrayBuffer(this.layerCount * Int32Array.BYTES_PER_ELEMENT);
        this.updateFlags = new Int32Array(this.updateFlagsBuffer);
        
        // Mark all layers as needing update
        for (let i = 0; i < this.layerCount; i++) {
            this.updateFlags[i] = 1;
        }

        // Fetch the tilemap image
        let tilemapBlob: Blob | null = null;
        try {
            console.log('OptimizedRenderer: Fetching tilemap from URL:', tilemapUrl);
            const response = await fetch(tilemapUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch tilemap: ${response.status} ${response.statusText}`);
            }
            tilemapBlob = await response.blob();
        } catch (error) {
            console.error('OptimizedRenderer: Error fetching tilemap:', error);
        }

        // Initialize the worker
        if (!this.worker) {
            console.error('OptimizedRenderer: Cannot initialize - worker not created');
            this.drawDebugPattern('red');
            return;
        }
        
        try {
            // Transfer control of the canvas to the worker
            console.log('OptimizedRenderer: Transferring canvas control to worker');
            let offscreenCanvas: OffscreenCanvas;
            
            try {
                offscreenCanvas = this.canvas.transferControlToOffscreen();
            } catch (error: any) {
                console.error('OptimizedRenderer: Failed to transfer canvas control:', error);
                console.error('This typically happens when the canvas already has a context or has been transferred.');
                this.drawDebugPattern('orange');
                throw new Error(`Failed to transfer canvas control: ${error.message}`);
            }
            
            // Send initialization message to worker
            console.log('OptimizedRenderer: Sending initialization message to worker');
            this.worker.postMessage(
                {
                    type: 'initialize',
                    canvas: offscreenCanvas,
                    mapWidth,
                    mapHeight,
                    tileWidth,
                    tileHeight,
                    tileSpacing,
                    tilemapBlob,
                    sharedMapData: this.sharedMapData.buffer,
                    updateFlags: this.updateFlagsBuffer,
                    mapDimensions: {
                        width: mapWidth,
                        height: mapHeight,
                        layers: this.layerCount
                    },
                    transform: this.transform,
                    debugMode: this.debugMode
                },
                [offscreenCanvas] // Transfer the canvas
            );
        } catch (error: any) {
            console.error('OptimizedRenderer: Failed to initialize worker:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.drawDebugPattern('red');
            throw error; // Re-throw to let caller handle the error
        }
    }

    updateTransform(offsetX: number, offsetY: number, zoom: number) {
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        this.transform.zoom = zoom;
        
        // Send transform update to worker
        if (this.worker && this.isInitialized) {
            this.worker.postMessage({
                type: 'updateTransform',
                transform: { offsetX, offsetY, zoom }
            });
        }
    }

    updateTile(layer: number, x: number, y: number, tileIndex: number) {
        if (!this.sharedMapData || !this.worker || !this.updateFlags) {
            console.error('OptimizedRenderer: Cannot update tile - not initialized');
            return;
        }
        
        // Update the shared buffer
        const index = this.getFlatIndex(layer, y, x);
        this.sharedMapData[index] = tileIndex;
        
        console.log('OptimizedRenderer: Updating tile at', { layer, x, y, index, tileIndex });
        
        // Mark the layer as needing update
        Atomics.store(this.updateFlags, layer, 1);
        
        // Notify the worker to redraw the tile
        this.worker.postMessage({
            type: 'redrawTile',
            layer,
            x,
            y
        });
    }
    
    // Update a region of tiles in the shared buffer and notify the worker
    updateRegion(layer: number, area: { x: number; y: number; width: number; height: number }, tiles: number[][]) {
        if (!this.sharedMapData || !this.worker || !this.updateFlags) {
            console.error('OptimizedRenderer: Cannot update region - not initialized');
            return;
        }
        
        console.log('OptimizedRenderer: Updating region:', { layer, area, tiles });
        
        // Copy tiles to shared buffer
        for (let y = 0; y < area.height; y++) {
            for (let x = 0; x < area.width; x++) {
                const index = this.getFlatIndex(layer, area.y + y, area.x + x);
                const oldValue = this.sharedMapData[index];
                this.sharedMapData[index] = tiles[y][x];
                
                console.log('OptimizedRenderer: Updated shared buffer at:', { 
                    layer, 
                    x: area.x + x, 
                    y: area.y + y, 
                    oldValue, 
                    newValue: tiles[y][x]
                });
            }
        }
        
        // Mark the layer as needing update
        Atomics.store(this.updateFlags, layer, 1);
        
        // Notify worker to redraw the region
        this.worker.postMessage({
            type: 'redrawRegion',
            layer,
            area
        });
    }

    resize(width: number, height: number) {
        if (!this.isInitialized || !this.worker) return;
        
        console.log('OptimizedRenderer: Resizing canvas to', width, height);
        
        // Tell worker to resize the canvas
        this.worker.postMessage({
            type: 'resize',
            width,
            height
        });
    }

    redrawAll() {
        if (!this.isInitialized || !this.worker || !this.updateFlags) return;
        
        console.log('OptimizedRenderer: Forcing complete redraw of all layers');
        
        // Mark all layers as needing update
        for (let i = 0; i < this.layerCount; i++) {
            Atomics.store(this.updateFlags, i, 1);
        }
        
        // Tell the worker to redraw all layers
        this.worker.postMessage({
            type: 'redrawAll'
        });
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }

    // Add the following methods to match the worker features

    // Update brush preview in worker
    updateBrushPreview(previewData: any) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'updateBrushPreview',
            ...previewData
        });
    }

    // Clear brush preview
    clearBrushPreview() {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'clearBrushPreview'
        });
    }

    // Set grid visibility
    setShowGrid(showGrid: boolean) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'setShowGrid',
            showGrid
        });
    }

    // Set layer visibility
    setLayerVisibility(layer: number, visible: boolean) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'setLayerVisibility',
            layer,
            visible
        });
    }

    // Set current layer and layer visibility mode
    setCurrentLayer(layer: number, showAllLayers: boolean) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'setCurrentLayer',
            data: {
                layer,
                showAllLayers
            }
        });
    }

    // Set continuous animation (normally we want this on for smooth performance)
    setContinuousAnimation(enabled: boolean) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: enabled ? 'startAnimation' : 'stopAnimation'
        });
    }

    // Add these event forwarding methods

    // Handle resize events - this is now just an alias for resize
    handleResize(width: number, height: number) {
        this.resize(width, height);
    }

    // Handle mouse events
    handleMouseEvent(eventType: 'mousedown' | 'mousemove' | 'mouseup', data: {
        x: number, 
        y: number,
        button?: number,
        mapX?: number,
        mapY?: number,
        isPanning?: boolean
    }) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'mouseEvent',
            eventType,
            ...data
        });
    }

    // Handle keyboard events
    handleKeyEvent(eventType: 'keydown' | 'keyup', data: {
        key: string,
        ctrlKey: boolean,
        shiftKey: boolean,
        altKey: boolean,
        metaKey: boolean
    }) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'keyEvent',
            eventType,
            ...data
        });
    }

    // Handle painting events
    handlePaintEvent(layer: number, x: number, y: number, tileIndex: number, brushSize: number) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'paintEvent',
            layer,
            x,
            y,
            tileIndex,
            brushSize
        });
    }

    // Handle painting a region
    handlePaintRegion(layer: number, startX: number, startY: number, width: number, height: number, tileIndex: number) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'paintRegion',
            layer,
            startX,
            startY,
            width,
            height,
            tileIndex
        });
    }

    // Handle UI state changes
    handleUIStateChange(stateType: string, data: any) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'uiStateChange',
            stateType,
            data
        });
    }

    // Register a callback to be called when the worker initialization is complete
    onInitComplete(callback: () => void) {
        if (!this.worker) return;
        
        const originalHandler = this.handleWorkerMessage.bind(this);
        
        // Create a wrapper that calls both the original handler and our callback
        this.worker.onmessage = (e: MessageEvent) => {
            // Call the original handler first
            originalHandler(e);
            
            // If it's an init complete message, call the callback
            if (e.data && e.data.type === 'initComplete') {
                callback();
            }
        };
    }

    // Update map dimensions without reinitializing the canvas
    async updateMapDimensions(
        mapWidth: number,
        mapHeight: number,
        sharedMapData?: SharedArrayBuffer,
        updateFlags?: SharedArrayBuffer
    ): Promise<void> {
        if (!this.isInitialized || !this.worker) {
            console.error('OptimizedRenderer: Cannot update map dimensions - not initialized');
            return;
        }
        
        console.log('OptimizedRenderer: Updating map dimensions to', mapWidth, 'x', mapHeight);
        
        // Update local dimensions
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        
        // Update shared map data if provided
        if (sharedMapData) {
            this.sharedMapData = new Int32Array(sharedMapData);
            console.log('OptimizedRenderer: Updated shared map data buffer');
        }
        
        // Update update flags if provided
        if (updateFlags) {
            this.updateFlagsBuffer = updateFlags;
            this.updateFlags = new Int32Array(updateFlags);
            console.log('OptimizedRenderer: Updated update flags buffer');
        }
        
        // Return a promise that resolves when the worker acknowledges the update
        return new Promise<void>((resolve) => {
            if (!this.worker) {
                resolve();
                return;
            }
            
            // Create a one-time message handler
            const messageHandler = (e: MessageEvent) => {
                if (e.data && e.data.type === 'mapDimensionsUpdated') {
                    // Remove the message handler
                    this.worker!.removeEventListener('message', messageHandler);
                    resolve();
                }
            };
            
            // Add the message handler
            this.worker.addEventListener('message', messageHandler);
            
            // Send the message to the worker
            this.worker.postMessage({
                type: 'updateMapDimensions',
                mapWidth,
                mapHeight,
                sharedMapData: sharedMapData || null,
                updateFlags: updateFlags || null,
                mapDimensions: {
                    width: mapWidth,
                    height: mapHeight,
                    layers: this.layerCount
                }
            });
        });
    }
} 