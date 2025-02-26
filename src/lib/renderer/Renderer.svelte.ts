/**
 * OptimizedRenderer.ts - Manages optimized rendering using web workers with OffscreenCanvas
 * 
 * This class provides a high-performance rendering solution for tile-based maps by
 * offloading rendering work to a web worker and using SharedArrayBuffer for efficient
 * data sharing between the main thread and worker.
 */

import type { MapData, MapDataManager } from '$lib/managers/MapDataManager';
import type { RenderSettings } from '$lib/utils/settings';
import type { DrawOperation } from '$lib/utils/drawing';
import type { FSM } from '$lib/utils/fsm.svelte';
import type { EditorContext } from '$lib/state/EditorStore.svelte';

/**
 * Manages optimized rendering of tile-based maps using web workers and OffscreenCanvas
 */
export class Renderer {
    /** The HTML canvas element that will be transferred to the worker */
    private canvas: HTMLCanvasElement;
    /** Reference to the web worker handling rendering */
    private worker: Worker | null = null;
    /** Flag indicating if the renderer has been fully initialized */
    private isInitialized = false;
    /** Map data manager */
    private mapDataManager: MapDataManager | null = null;
    /** FSM */
    private machine: FSM<EditorContext, any> | null = null;
    // Shared memory for map data
    /** Shared array containing the map tile data */
    private sharedMapData: SharedArrayBuffer | null = null;
    /** Width of the map in tiles */
    private mapWidth = 0;
    /** Height of the map in tiles */
    private mapHeight = 0;
    /** Number of layers in the map */
    private layerCount = 0;
    /** Width of each tile in pixels */
    private tileWidth = 0;
    /** Height of each tile in pixels */
    private tileHeight = 0;
    
    // For tracking render state
    /** Flags indicating which layers need to be updated */
    private updateFlags: Int32Array | null = null;
    /** Shared buffer for update flags */
    private updateFlagsBuffer: SharedArrayBuffer | null = null;
    
    // Transform state
    /** Current view transformation (pan and zoom) */
    private transform: { offsetX: number; offsetY: number; zoom: number } = {
        offsetX: 0,
        offsetY: 0,
        zoom: 1
    };

    /** Current rendering settings */
    private renderSettings: RenderSettings;

    /** Whether debug information should be displayed */
    private debugMode = false;


    /**
     * Creates a new OptimizedRenderer instance
     * 
     * @param canvas - The HTML canvas element to render to
     * @param debugMode - Whether to enable debug mode with additional logging
     */
    constructor(canvas: HTMLCanvasElement, worker: Worker, debugMode = false, machine: FSM<EditorContext, any>) {
        this.canvas = canvas;
        this.worker = worker;
        this.debugMode = debugMode;
        this.machine = machine;
        // Initialize render settings with defaults
        this.renderSettings = {
            useLOD: true,
            lodThreshold: 0.4,
            lodQuality: 3,
            batchSize: 16,
            useDirectAtlas: true,
            showGrid: true,
            showFPS: true,
            debugMode: this.debugMode
        };
        
        console.log('OptimizedRenderer: Created renderer instance with debug mode:', debugMode);
        
        // Set up worker message handler
        if (this.worker) {
            console.log('OptimizedRenderer: Setting up worker message handler');
            
            // Store the original onmessage handler
            const originalOnMessage = this.worker.onmessage;
            
            // Set up a new handler that calls both our handler and the original one
            this.worker.onmessage = (e: MessageEvent) => {
                // Call our handler
                this.handleWorkerMessage(e);
                
                // Call the original handler if it exists
                if (originalOnMessage) {
                    originalOnMessage.call(this.worker!, e);
                }
            };
            
            // Send a test message to the worker
            this.worker.postMessage({
                type: 'test',
                message: 'Hello from Renderer'
            });
        } else {
            console.error('OptimizedRenderer: Worker not available in constructor');
        }
    }

    /**
     * Handles messages received from the worker
     * 
     * @param e - The message event from the worker
     * @private
     */
    private handleWorkerMessage(e: MessageEvent) {
        const { type } = e.data;
        
        if (type === 'initComplete') {
            console.log('OptimizedRenderer: Worker initialization complete');
            this.isInitialized = true;
            
            // Immediately request a full render
            this.redrawAll();
            this.centerMap();
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

    /**
     * Draws a debug pattern on the canvas to indicate an error
     * 
     * @param color - The color to use for the debug pattern
     * @private
     */
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

    /**
     * Converts 3D coordinates to a flat index in the shared buffer
     * 
     * @param layer - The layer index
     * @param y - The y coordinate
     * @param x - The x coordinate
     * @returns The flat index in the shared buffer
     * @private
     */
    private getFlatIndex(layer: number, y: number, x: number): number {
        return (layer * this.mapHeight * this.mapWidth) + (y * this.mapWidth) + x;
    }

    /**
     * Updates the renderer settings
     * 
     * @param settings - The new render settings to apply
     */
    updateRenderSettings(settings: RenderSettings) {
        console.log('OptimizedRenderer: Updating render settings:', settings);
        this.renderSettings = { ...settings };
        this.debugMode = settings.debugMode;
        
        // Forward settings to worker
        if (this.worker && this.isInitialized) {
            // Update grid visibility
            this.setShowGrid(settings.showGrid);
            
            // Forward all settings to worker
            this.worker.postMessage({
                type: 'updateRenderSettings',
                settings: this.renderSettings
            });
        }
    }

    /**
     * Initializes the renderer with map data and dimensions
     * 
     * @param mapWidth - Width of the map in tiles
     * @param mapHeight - Height of the map in tiles
     * @param tileWidth - Width of each tile in pixels
     * @param tileHeight - Height of each tile in pixels
     * @param tileSpacing - Spacing between tiles in the tileset
     * @param tilemapUrl - URL to the tilemap image
     * @param canvasWidth - Width of the canvas in pixels
     * @param canvasHeight - Height of the canvas in pixels
     * @param initialMapData - Initial map data (optional)
     * @param externalSharedBuffer - External shared buffer to use (optional)
     * @returns Promise that resolves when initialization is complete
     */
    async initialize(
        mapWidth: number,
        mapHeight: number,
        layerCount: number,
        tileWidth: number,
        tileHeight: number,
        tileSpacing: number,
        tilemapUrl: string,
        canvasWidth: number,
        canvasHeight: number,
        mapDataManager: MapDataManager
    ) {
        console.log('OptimizedRenderer: Initializing with dimensions:', {
            mapWidth,
            mapHeight,
            layerCount,
            tileWidth,
            tileHeight,
            tileSpacing,
            canvasWidth,
            canvasHeight,
        });

        this.mapDataManager = mapDataManager;

        // Ensure the canvas is properly sized before transferring it
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;

        // Store dimensions
        this.mapWidth = mapWidth;
        this.mapHeight = mapHeight;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.layerCount = layerCount;
        
        // Set up shared map data
        this.sharedMapData = mapDataManager.getBuffer();
        
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
            this.drawDebugPattern('yellow');
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
                    sharedMapData: this.sharedMapData,
                    updateFlags: this.updateFlagsBuffer,
                    mapDimensions: {
                        width: mapWidth,
                        height: mapHeight,
                        layers: this.layerCount
                    },
                    transform: this.transform,
                    debugMode: this.debugMode,
                    renderSettings: this.renderSettings
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

    /**
     * Updates the view transformation (pan and zoom)
     * 
     * @param offsetX - X offset for panning
     * @param offsetY - Y offset for panning
     * @param zoom - Zoom level
     */
    updateTransform(offsetX: number, offsetY: number, zoom: number) {
        // Update internal transform
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        this.transform.zoom = zoom;
        
        // Update FSM context to keep it in sync
        if (this.machine && this.machine.context) {
            this.machine.context.offsetX = offsetX;
            this.machine.context.offsetY = offsetY;
            this.machine.context.zoomLevel = zoom;
        }
        
        // Send transform update to worker
        if (this.worker && this.isInitialized) {
            try {
                this.worker.postMessage({
                    type: 'updateTransform',
                    transform: { offsetX, offsetY, zoom }
                });
            } catch (error) {
                console.error('Renderer: Error sending message to worker:', error);
            }
        } else {
            console.warn('Renderer: Cannot update transform - worker not initialized', {
                worker: !!this.worker,
                isInitialized: this.isInitialized
            });
        }
    }

    /**
     * Updates a single tile in the map
     * 
     * @param layer - The layer index
     * @param x - The x coordinate
     * @param y - The y coordinate
     * @param tileIndex - The new tile index
     */
    updateTile(layer: number, x: number, y: number, tileIndex: number) {
        if (!this.mapDataManager || !this.worker || !this.updateFlags) {
            console.error('OptimizedRenderer: Cannot update tile - not initialized');
            return;
        }
        
        // Update the shared buffer
        const index = this.getFlatIndex(layer, y, x);
        this.mapDataManager.setTile(layer, y, x, tileIndex);
        
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
    
    /**
     * Updates a region of tiles in the map
     * 
     * @param layer - The layer index
     * @param area - The area to update {x, y, width, height}
     * @param tiles - 2D array of tile indices
     */
    updateRegion(layer: number, area: { x: number; y: number; width: number; height: number }, tiles: number[][]) {
        if (!this.mapDataManager || !this.worker || !this.updateFlags) {
            console.error('OptimizedRenderer: Cannot update region - not initialized');
            return;
        }
        
        console.log('OptimizedRenderer: Updating region:', { layer, area, tiles });
        
        // Copy tiles to shared buffer
        for (let y = 0; y < area.height; y++) {
            for (let x = 0; x < area.width; x++) {
                const index = this.getFlatIndex(layer, area.y + y, area.x + x);
                const oldValue = this.mapDataManager.getTile(layer, area.y + y, area.x + x);
                this.mapDataManager.setTile(layer, area.y + y, area.x + x, tiles[y][x]);
                
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

    /**
     * Resizes the canvas
     * 
     * @param width - New width in pixels
     * @param height - New height in pixels
     */
    resize(width: number, height: number) {
        if (!this.isInitialized || !this.worker) return;
        
        // Tell worker to resize the canvas
        this.worker.postMessage({
            type: 'resize',
            width,
            height
        });
    }

    /**
     * Forces a complete redraw of all layers
     */
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
            // Send a terminate message to the worker to allow it to clean up resources
            this.worker.postMessage({
                type: 'terminate'
            });
            
            // Wait a short time for the worker to clean up before terminating
            setTimeout(() => {
                this.worker?.terminate();
                this.worker = null;
                console.log('OptimizedRenderer: Worker terminated');
            }, 100);
        }
        
        // Clear references to shared buffers
        this.sharedMapData = null;
        this.updateFlags = null;
        
        console.log('OptimizedRenderer: Destroyed');
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
    onInitComplete(callback: (args: any) => void) {
        if (!this.worker) return;
        
        const originalHandler = this.handleWorkerMessage.bind(this);
        
        // Create a wrapper that calls both the original handler and our callback
        this.worker.onmessage = (e: MessageEvent) => {
            // Call the original handler first
            originalHandler(e);
            
            // If it's an init complete message, call the callback
            if (e.data && e.data.type === 'initComplete') {
                callback(e.data);
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
            //this.sharedMapData = new Int32Array(sharedMapData);
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

    draw(operation: DrawOperation) {
        if (!this.isInitialized || !this.worker) return;
        
        this.worker.postMessage({
            type: 'draw',
            operation
        });
    }

    // Center the map in the viewport
    centerMap() {
        if (!this.canvas || !this.machine) return;
        
        console.log('Renderer: Centering map in viewport');
        
        // Calculate the center position
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const mapWidthPx = this.mapWidth * this.tileWidth;
        const mapHeightPx = this.mapHeight * this.tileHeight;
        
        // Calculate the offset to center the map
        const offsetX = (canvasWidth - mapWidthPx * this.transform.zoom) / 2;
        const offsetY = (canvasHeight - mapHeightPx * this.transform.zoom) / 2;
        
        // Update the transform
        this.transform.offsetX = offsetX;
        this.transform.offsetY = offsetY;
        
        // Update the FSM context to keep it in sync with the renderer
        if (this.machine && this.machine.context) {
            this.machine.context.offsetX = offsetX;
            this.machine.context.offsetY = offsetY;
        }
        
        // Update the renderer
        this.updateTransform(
            this.transform.offsetX,
            this.transform.offsetY,
            this.transform.zoom
        );
        
        console.log('Renderer: Map centered with transform:', {
            offsetX: this.transform.offsetX,
            offsetY: this.transform.offsetY,
            zoom: this.transform.zoom
        });
    }
} 