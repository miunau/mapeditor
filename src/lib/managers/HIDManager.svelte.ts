import type { EditorContext } from "$lib/state/EditorStore.svelte";
import type { FSM } from "$lib/utils/fsm.svelte";
import { Renderer } from "$lib/renderer/Renderer.svelte.js";
import { calculateZoomTransform, findClosestZoomLevel } from "$lib/utils/zoom";
import type { Brush } from "$lib/types/drawing";

export class HIDManager {
    private machine: FSM<EditorContext, any>;
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;

    private boundHandleWheel: (event: WheelEvent) => void;
    private boundHandleMouseDown: (event: MouseEvent) => void;
    private boundHandleMouseMove: (event: MouseEvent) => void;
    private boundHandleMouseUp: (event: MouseEvent) => void;
    private boundHandleMouseEnter: (event: MouseEvent) => void;
    private boundHandleKeyDown: (event: KeyboardEvent) => void;
    private boundHandleKeyUp: (event: KeyboardEvent) => void;
    private boundHandleResize: (event: UIEvent) => void;
    
    // Resize observer for more reliable resize handling
    private resizeObserver: ResizeObserver | null = null;
    
    // Panning state
    private keyboardPanningActive: boolean = false;
    private isPanning: boolean = false;
    private lastPanX: number = 0;
    private lastPanY: number = 0;
    private keyPanState = {
        left: false,
        right: false,
        up: false,
        down: false
    };
    
    // Smooth panning with inertia (used for both mouse and keyboard)
    private velocityX: number = 0;
    private velocityY: number = 0;
    private inertiaActive: boolean = false;
    private lastPanTime: number = 0;
    private panHistory: Array<{x: number, y: number, time: number}> = [];
    private readonly PAN_HISTORY_SIZE = 5; // Number of points to track for inertia
    private readonly INERTIA_DECAY = 0.92; // How quickly inertia slows down (0-1) - faster decay for less slidey feel
    private readonly MIN_VELOCITY = 0.8; // Higher minimum velocity for shorter inertia
    
    // Keyboard panning settings
    private readonly KEYBOARD_ACCELERATION = 0.2; // How quickly keyboard panning accelerates (lower = smoother)
    private readonly KEYBOARD_DECELERATION = 0.92; // Match the INERTIA_DECAY for consistent feel
    private readonly KEYBOARD_MAX_SPEED = 20; // Maximum keyboard panning speed

    // Track current mouse position for brush preview
    private currentMouseX: number = 0;
    private currentMouseY: number = 0;

    // Add a property for the resize timeout
    private _resizeTimeout: number | null = null;

    constructor(machine: FSM<EditorContext, any>, canvas: HTMLCanvasElement, renderer: Renderer) {
        this.machine = machine;
        this.canvas = canvas;
        this.renderer = renderer;
        this.boundHandleWheel = this.handleWheel.bind(this);
        this.boundHandleMouseDown = this.handleMouseDown.bind(this);
        this.boundHandleMouseMove = this.handleMouseMove.bind(this);
        this.boundHandleMouseUp = this.handleMouseUp.bind(this);
        this.boundHandleMouseEnter = this.handleMouseEnter.bind(this);
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        this.boundHandleResize = this.handleResize.bind(this);
        this.setupListeners();
    }

    public setupListeners() {
        console.log('HIDManager: Setting up listeners', this.canvas);
        this.canvas.addEventListener('wheel', this.boundHandleWheel);
        this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
        this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
        this.canvas.addEventListener('mouseenter', this.boundHandleMouseEnter);
        window.addEventListener('mouseup', this.boundHandleMouseUp);
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);
        window.addEventListener('resize', this.boundHandleResize);
        
        // Set up ResizeObserver for more reliable container resizing
        if ('ResizeObserver' in window) {
            const container = this.canvas.parentElement;
            if (container) {
                this.resizeObserver = new ResizeObserver(entries => {
                    // Trigger resize handler when container size changes
                    // Use a debounced approach to avoid too many resize events
                    if (this._resizeTimeout) {
                        clearTimeout(this._resizeTimeout);
                    }
                    
                    this._resizeTimeout = setTimeout(() => {
                        console.log('HIDManager: ResizeObserver detected size change');
                        this.handleResize(new UIEvent('resize'));
                        this._resizeTimeout = null;
                    }, 100);
                });
                this.resizeObserver.observe(container);
                console.log('HIDManager: ResizeObserver set up for container');
            }
        }
    }

    public removeListeners() {
        this.canvas.removeEventListener('wheel', this.boundHandleWheel);
        this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
        this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
        this.canvas.removeEventListener('mouseenter', this.boundHandleMouseEnter);
        window.removeEventListener('mouseup', this.boundHandleMouseUp);
        window.removeEventListener('keydown', this.boundHandleKeyDown);
        window.removeEventListener('keyup', this.boundHandleKeyUp);
        window.removeEventListener('resize', this.boundHandleResize);
        
        // Clean up ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        // Clear any pending resize timeout
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }
    }

    private handleWheel(event: WheelEvent) {
        // Prevent default to avoid browser scrolling
        event.preventDefault();
        
        const context = this.machine.context;
        
        // Normalize wheel delta values for more consistent behavior
        // Different browsers and devices can have very different delta values
        const normalizedDeltaY = this.normalizeWheelDelta(event.deltaY);
        const normalizedDeltaX = this.normalizeWheelDelta(event.deltaX);
        
        // In a map editor, it's more intuitive to use wheel for zooming by default
        const direction = normalizedDeltaY < 0 ? 'up' : 'down';
        const mode = 'fine';
        
        // Find the closest zoom level in the given direction
        const newZoom = findClosestZoomLevel(context.zoomLevel, direction, mode);
        
        // Calculate the focus point (mouse position)
        const rect = this.canvas.getBoundingClientRect();
        const focusPoint = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        // Calculate the new transform to maintain focus point
        const transform = calculateZoomTransform(
            newZoom,
            context.zoomLevel,
            focusPoint,
            { x: context.offsetX, y: context.offsetY }
        );
        
        // Update context
        context.zoomLevel = transform.zoom;
        context.offsetX = transform.offset.x;
        context.offsetY = transform.offset.y;
        
        // Update the renderer
        this.renderer.updateTransform(
            context.offsetX,
            context.offsetY,
            context.zoomLevel
        );
    }
    
    // Helper method to normalize wheel delta values
    private normalizeWheelDelta(delta: number): number {
        // Different browsers and devices can have very different delta values
        // This normalization helps provide more consistent behavior
        
        // First, determine the sign of the delta
        const sign = delta < 0 ? -1 : 1;
        
        // For very small values (high precision devices), amplify the delta
        if (Math.abs(delta) < 10) {
            return sign * 10;
        }
        
        // For very large values (old mouse wheels), reduce the delta
        if (Math.abs(delta) > 100) {
            return sign * 100;
        }
        
        // Otherwise, return the delta as is
        return delta;
    }

    private handleMouseDown(event: MouseEvent) {
        console.log('HIDManager: Mouse down', event.button);
        
        // Stop any ongoing inertia when starting a new interaction
        this.stopInertia();
        
        if (event.button === 1) { // Middle mouse button
            // Start panning - handle it locally
            this.isPanning = true;
            this.lastPanX = event.clientX;
            this.lastPanY = event.clientY;
            this.lastPanTime = performance.now();
            this.panHistory = [];
            
            // Prevent default behavior (like autoscroll)
            event.preventDefault();
        } else if (this.machine.state === 'idle') {
            // Convert screen coordinates to map coordinates
            const mapCoords = this.screenToMapCoordinates(event.clientX, event.clientY);
            if (mapCoords) {
                console.log('HIDManager: Starting drawing at map coordinates:', mapCoords);
                
                const isErasing = event.button === 2;
                this.machine.send('startDrawing', {
                    x: event.clientX,
                    y: event.clientY,
                    isErasing,
                    mapX: mapCoords.x,
                    mapY: mapCoords.y
                });
            } else {
                console.log('HIDManager: Click outside map area');
            }
        }
    }

    private handleMouseMove(event: MouseEvent) {
        // Always track the current mouse position
        this.currentMouseX = event.clientX;
        this.currentMouseY = event.clientY;
        
        if (this.isPanning) {
            const currentTime = performance.now();
            
            // Calculate delta
            const dx = event.clientX - this.lastPanX;
            const dy = event.clientY - this.lastPanY;
            
            // Add to pan history for inertia calculation
            this.addToPanHistory(event.clientX, event.clientY, currentTime);
            
            // Update last position
            this.lastPanX = event.clientX;
            this.lastPanY = event.clientY;
            this.lastPanTime = currentTime;
            
            // Apply the pan directly - no need to scale by zoom level
            // This provides a consistent feel regardless of zoom level
            this.machine.context.offsetX += dx;
            this.machine.context.offsetY += dy;
            
            // Update renderer directly for smoother panning
            this.renderer.updateTransform(
                this.machine.context.offsetX,
                this.machine.context.offsetY,
                this.machine.context.zoomLevel
            );
        } else {
            // Convert screen coordinates to map coordinates
            const mapCoords = this.screenToMapCoordinates(event.clientX, event.clientY);
            
            // Update brush preview regardless of whether we're drawing
            if (mapCoords) {
                // Send brush preview info to the renderer
                this.renderer.handleMouseEvent('mousemove', {
                    x: event.clientX,
                    y: event.clientY,
                    mapX: mapCoords.x,
                    mapY: mapCoords.y,
                    brushSize: this.machine.context.brushSize || 1
                });
            }
            
            // Handle drawing state
            if (this.machine.state === 'drawing' && mapCoords) {
                // For brush tool, draw directly at each position for smoother drawing
                if (this.machine.context.currentTool === 'brush') {
                    this.handleDrawTile(
                        mapCoords.x, 
                        mapCoords.y, 
                        this.machine.context.isErasing
                    );
                }
            }
        }
    }

    private handleMouseUp(event: MouseEvent) {
        console.log('HIDManager: Mouse up');
        
        if (this.isPanning && event.button === 1) {
            // End panning - handle it locally
            this.isPanning = false;
            
            // Calculate velocity for inertia
            this.calculatePanVelocity();
            
            // Start inertia if velocity is significant
            if (Math.abs(this.velocityX) > this.MIN_VELOCITY || 
                Math.abs(this.velocityY) > this.MIN_VELOCITY) {
                this.startInertia();
            }
        } else if (this.machine.state === 'drawing') {
            // Convert screen coordinates to map coordinates for the final draw
            const mapCoords = this.screenToMapCoordinates(event.clientX, event.clientY);
            if (mapCoords && this.machine.context.currentTool === 'brush') {
                // For brush tool, draw at the final position
                this.handleDrawTile(
                    mapCoords.x, 
                    mapCoords.y, 
                    this.machine.context.isErasing
                );
            }
            
            // End the drawing operation
            this.machine.send('stopDrawing');
        }
    }

    private handleMouseEnter(event: MouseEvent) {
        // Track the current mouse position
        this.currentMouseX = event.clientX;
        this.currentMouseY = event.clientY;
        
        // Initialize brush preview when mouse enters the canvas
        const mapCoords = this.screenToMapCoordinates(event.clientX, event.clientY);
        if (mapCoords) {
            console.log('HIDManager: Mouse entered canvas at map coordinates:', mapCoords);
            
            // Send brush preview info to the renderer
            this.renderer.handleMouseEvent('mousemove', {
                x: event.clientX,
                y: event.clientY,
                mapX: mapCoords.x,
                mapY: mapCoords.y,
                brushSize: this.machine.context.brushSize || 1
            });
        }
    }

    private handleKeyDown(event: KeyboardEvent) {
        let isArrowKey = false;
        let shouldStartPanning = false;

        const key = event.key.toLowerCase();
        
        // Stop inertia when pressing keys
        this.stopInertia();
        
        switch (key) {
            case ' ':
            case 'space':
                // Center the map
                this.renderer.centerMap();
                return;

            case 'w':
                this.machine.context.paletteManager?.navigateBrushGrid(this.machine.context.currentBrush!.id, 'up');
                return;

            case 's':
                this.machine.context.paletteManager?.navigateBrushGrid(this.machine.context.currentBrush!.id, 'down');
                return;

            case 'a':
                this.machine.context.paletteManager?.navigateBrushGrid(this.machine.context.currentBrush!.id, 'left');
                return;

            case 'd':
                this.machine.context.paletteManager?.navigateBrushGrid(this.machine.context.currentBrush!.id, 'right');
                return;

            case 'z':
                // Decrease brush size (minimum 1)
                const currentSize = this.machine.context.brushSize || 1;
                const newSize = Math.max(1, currentSize - 1);
                console.log('HIDManager: Decreasing brush size from', currentSize, 'to', newSize);
                this.machine.send('setBrushSize', newSize);
                
                // Update brush preview with new size
                this.updateBrushPreviewWithCurrentPosition(newSize);
                return;

            case 'g':
                this.machine.send('selectTool', 'fill');
                return;

            case 'r':
                this.machine.send('selectTool', 'rectangle');
                return;

            case 'e':
                this.machine.send('selectTool', 'ellipse');
                return;

            case 'x':
                // Increase brush size (reasonable maximum)
                const curSize = this.machine.context.brushSize || 1;
                const nextSize = Math.min(10, curSize + 1); // Max size of 10
                console.log('HIDManager: Increasing brush size from', curSize, 'to', nextSize);
                this.machine.send('setBrushSize', nextSize);
                
                // Update brush preview with new size
                this.updateBrushPreviewWithCurrentPosition(nextSize);
                return;

            case 'arrowleft':
                this.keyPanState.left = true;
                shouldStartPanning = true;
                isArrowKey = true;
                break;

            case 'arrowright':
                this.keyPanState.right = true;
                shouldStartPanning = true;
                isArrowKey = true;
                break;

            case 'arrowup':
                this.keyPanState.up = true;
                shouldStartPanning = true;
                isArrowKey = true;
                break;

            case 'arrowdown':
                this.keyPanState.down = true;
                shouldStartPanning = true;
                isArrowKey = true;
                break;
        }
        
        // Start panning if an arrow key was pressed
        if (shouldStartPanning) {
            this.startKeyboardPanning();
        }
    }

    private handleKeyUp(event: KeyboardEvent) {
        let isArrowKey = false;
        
        // Update key state
        switch (event.key) {
            case 'ArrowLeft':
                this.keyPanState.left = false;
                isArrowKey = true;
                break;
            case 'ArrowRight':
                this.keyPanState.right = false;
                isArrowKey = true;
                break;
            case 'ArrowUp':
                this.keyPanState.up = false;
                isArrowKey = true;
                break;
            case 'ArrowDown':
                this.keyPanState.down = false;
                isArrowKey = true;
                break;
        }
        
    }
    
    private startKeyboardPanning() {
        // This could be called on each key press, but we only want one animation loop
        if (!this.keyboardPanningActive) {
            this.keyboardPanningActive = true;
            this.updateKeyboardPanning();
        }
    }

    private updateKeyboardPanning() {
        // Calculate desired direction based on key state
        let targetVelocityX = 0, targetVelocityY = 0;
        
        if (this.keyPanState) {
            if (this.keyPanState.left) targetVelocityX += this.KEYBOARD_MAX_SPEED;
            if (this.keyPanState.right) targetVelocityX -= this.KEYBOARD_MAX_SPEED;
            if (this.keyPanState.up) targetVelocityY += this.KEYBOARD_MAX_SPEED;
            if (this.keyPanState.down) targetVelocityY -= this.KEYBOARD_MAX_SPEED;
        }
        
        // Check if we should stop panning
        const isAnyKeyPressed = this.keyPanState.left || this.keyPanState.right || 
                               this.keyPanState.up || this.keyPanState.down;
        
        if (!isAnyKeyPressed && Math.abs(this.velocityX) < this.MIN_VELOCITY && 
            Math.abs(this.velocityY) < this.MIN_VELOCITY) {
            this.keyboardPanningActive = false;
            this.velocityX = 0;
            this.velocityY = 0;
            return;
        }
        
        // When keys are pressed, use the target velocity directly instead of gradually approaching it
        if (isAnyKeyPressed) {
            // Set velocity directly to target when keys are pressed
            this.velocityX = targetVelocityX;
            this.velocityY = targetVelocityY;
        } else {
            // Only apply deceleration when no keys are pressed
            this.velocityX *= this.KEYBOARD_DECELERATION;
            this.velocityY *= this.KEYBOARD_DECELERATION;
        }
        
        // Apply velocity to position
        if (Math.abs(this.velocityX) > 0.01 || Math.abs(this.velocityY) > 0.01) {
            this.machine.context.offsetX += this.velocityX;
            this.machine.context.offsetY += this.velocityY;

            // Update renderer directly for smoother panning
            this.renderer.updateTransform(
                this.machine.context.offsetX,
                this.machine.context.offsetY,
                this.machine.context.zoomLevel
            );
        }
        
        // Continue the animation loop
        requestAnimationFrame(() => this.updateKeyboardPanning());
    }

    private handleResize(event: UIEvent) {
        if (this.canvas && this.renderer) {
            // Get the container dimensions
            const container = this.canvas.parentElement;
            if (!container) return;
            
            const style = window.getComputedStyle(container);
            const width = container.clientWidth 
                - parseFloat(style.paddingLeft) 
                - parseFloat(style.paddingRight);
            const height = container.clientHeight 
                - parseFloat(style.paddingTop) 
                - parseFloat(style.paddingBottom);
            
            // Tell the renderer to resize (which will forward to the worker)
            this.renderer.resize(width, height);
        }
    }
    
    // === Smooth panning with inertia ===
    
    private addToPanHistory(x: number, y: number, time: number) {
        this.panHistory.push({ x, y, time });
        
        // Keep history at a fixed size
        if (this.panHistory.length > this.PAN_HISTORY_SIZE) {
            this.panHistory.shift();
        }
    }
    
    private calculatePanVelocity() {
        if (this.panHistory.length < 2) {
            this.velocityX = 0;
            this.velocityY = 0;
            return;
        }
        
        // Calculate velocity based on the last few pan points
        const newest = this.panHistory[this.panHistory.length - 1];
        const oldest = this.panHistory[0];
        
        const timeDiff = newest.time - oldest.time;
        if (timeDiff <= 0) {
            this.velocityX = 0;
            this.velocityY = 0;
            return;
        }
        
        // Calculate velocity (pixels per millisecond)
        this.velocityX = (newest.x - oldest.x) / timeDiff;
        this.velocityY = (newest.y - oldest.y) / timeDiff;
        
        // Scale velocity for smoother inertia
        this.velocityX *= 15; // Adjust these multipliers to control inertia strength
        this.velocityY *= 15;
        
    }
    
    private startInertia() {
        if (this.inertiaActive) return;
        
        this.inertiaActive = true;
        this.applyInertia();
    }
    
    private stopInertia() {
        this.inertiaActive = false;
        this.velocityX = 0;
        this.velocityY = 0;
    }
    
    private applyInertia() {
        if (!this.inertiaActive) return;
        
        // Apply velocity to position
        if (Math.abs(this.velocityX) > this.MIN_VELOCITY || 
            Math.abs(this.velocityY) > this.MIN_VELOCITY) {
            
            // Apply velocity to position
            this.machine.context.offsetX += this.velocityX;
            this.machine.context.offsetY += this.velocityY;
            
            // Update renderer
            this.renderer.updateTransform(
                this.machine.context.offsetX,
                this.machine.context.offsetY,
                this.machine.context.zoomLevel
            );
            
            // Decay velocity
            this.velocityX *= this.INERTIA_DECAY;
            this.velocityY *= this.INERTIA_DECAY;
            
            // Continue inertia
            requestAnimationFrame(() => this.applyInertia());
        } else {
            // Stop inertia when velocity is too low
            this.inertiaActive = false;
        }
    }

    /**
     * Converts screen coordinates to map coordinates
     * @param screenX The X coordinate in screen space
     * @param screenY The Y coordinate in screen space
     * @returns The map coordinates or null if outside the map
     */
    private screenToMapCoordinates(screenX: number, screenY: number): { x: number, y: number } | null {
        const context = this.machine.context;
        if (!context || !context.renderer) return null;
        
        // Get the canvas rect to convert client coordinates to canvas coordinates
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = screenX - rect.left;
        const canvasY = screenY - rect.top;
        
        // Apply inverse transform to get world coordinates
        const worldX = (canvasX - context.offsetX) / context.zoomLevel;
        const worldY = (canvasY - context.offsetY) / context.zoomLevel;
        
        // Convert world coordinates to tile coordinates
        const tileX = Math.floor(worldX / context.tilemap!.tileWidth);
        const tileY = Math.floor(worldY / context.tilemap!.tileHeight);
        
        // Check if the coordinates are within the map bounds
        if (tileX >= 0 && tileX < context.mapWidth && 
            tileY >= 0 && tileY < context.mapHeight) {
            return { x: tileX, y: tileY };
        }
        
        return null;
    }

    /**
     * Handles drawing a tile at the specified map coordinates
     * @param mapX The X coordinate in map space
     * @param mapY The Y coordinate in map space
     * @param isErasing Whether this is an erase operation
     */
    private handleDrawTile(mapX: number, mapY: number, isErasing: boolean = false) {
        const context = this.machine.context;
        if (!context || !context.renderer) return;
        
        // Get the current brush and layer
        const currentBrush = context.currentBrush;
        const currentLayer = context.currentLayer;
        const brushSize = context.brushSize || 1;
        
        if (!currentBrush || currentLayer < 0) return;
        
        console.log('HIDManager: Drawing tile at', mapX, mapY, 'with brush size', brushSize);
        
        // Determine the tile index to draw
        let tileIndex = -1; // Default to erasing
        if (!isErasing) {
            if (currentBrush.type === 'tile') {
                tileIndex = currentBrush.tiles[0][0];
            } else if (currentBrush.type === 'custom' && currentBrush) {
                // For custom brushes, we need to handle them differently
                this.handleDrawCustomBrush(mapX, mapY, currentBrush, currentLayer);
                return;
            }
        }
        
        // Create a draw operation for the current position
        const drawOp = {
            type: 'start' as const,
            tool: 'brush' as const,
            brush: currentBrush,
            layer: currentLayer,
            x: mapX,
            y: mapY,
            tileIndex,
            isErasing,
            brushSize: brushSize
        };

        console.log('HIDManager: Drawing tile at', mapX, mapY, 'with brush size', brushSize);
        
        // Send the draw operation to the renderer
        context.renderer.startDraw(drawOp);
    }

    /**
     * Handles drawing a custom brush at the specified map coordinates
     * @param mapX The X coordinate in map space
     * @param mapY The Y coordinate in map space
     * @param brush The custom brush to draw
     * @param layer The layer to draw on
     */
    private handleDrawCustomBrush(mapX: number, mapY: number, brush: Brush, layer: number) {
        const context = this.machine.context;
        if (!context || !context.renderer || !context.mapDataManager) return;
        
        // Get the brush tiles
        const tiles = brush.tiles;
        if (!tiles || !tiles.length) return;
        
        // Calculate the area to update
        const area = {
            x: mapX,
            y: mapY,
            width: brush.width,
            height: brush.height
        };
        
        // Update the region with the custom brush tiles
        context.mapDataManager.updateRegion(layer, mapX, mapY, tiles);
        
        // Tell the renderer to redraw the region
        context.renderer.updateRegion(layer, area, tiles);
    }

    /**
     * Updates the brush preview with the current mouse position and new brush size
     */
    private updateBrushPreviewWithCurrentPosition(newSize: number) {
        // Use the tracked current mouse position
        if (this.currentMouseX === 0 && this.currentMouseY === 0) {
            // If we don't have a current mouse position yet, don't update the preview
            return;
        }
        
        // Convert screen coordinates to map coordinates
        const mapCoords = this.screenToMapCoordinates(this.currentMouseX, this.currentMouseY);
        
        if (mapCoords) {
            // Send brush preview info to the renderer with the new brush size
            this.renderer.handleMouseEvent('mousemove', {
                x: this.currentMouseX,
                y: this.currentMouseY,
                mapX: mapCoords.x,
                mapY: mapCoords.y,
                brushSize: newSize
            });
        }
    }
}