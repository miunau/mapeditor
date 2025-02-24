import { Tilemap } from './tilemap';
import { floodFill } from './floodfill';
import type { MapData, MapDimensions, CustomBrush } from './types/map';
import { createEmptyMap, cloneMapData, validateMapDimensions } from './types/map';
import type { Point, Rect } from './utils/coordinates';
import { screenToMap, mapToScreen, isInMapBounds, getBrushArea, calculateMapCenter } from './utils/coordinates';
import { 
    generateBrushId, 
    createBrushPreview, 
    calculateBrushPattern,
    drawFloodFillPreview,
    drawCustomBrushPreview,
    drawRectanglePreview,
    drawSingleTilePreview
} from './utils/brush';
import { findClosestZoomLevel, calculateZoomTransform, type ZoomLevel } from './utils/zoom';
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

    // Constants
    readonly MAX_LAYERS = 10;
    readonly minZoom = 0.25;
    readonly maxZoom = 4;

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
    customBrushes = $state<CustomBrush[]>([]);
    selectedCustomBrush = $state<CustomBrush | null>(null);
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
        requestAnimationFrame(this.updatePanning.bind(this));

        // Store the instance
        editor = this;

        // Set up reactivity
        this.setupReactivity();
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

        // Update zoom level
        const zoomDelta = -e.deltaY * 0.001;
        let newZoom = this.zoomLevel * (1 + zoomDelta);
        
        // Clamp to min/max zoom
        newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
        
        // Only proceed if zoom actually changed
        if (newZoom !== this.zoomLevel) {
            this.setZoom(newZoom as ZoomLevel, { x: mouseX, y: mouseY });
        }
    }

    // Set zoom level with focus point
    setZoom(newZoom: ZoomLevel, focusPoint: Point) {
        const transform = calculateZoomTransform(
            newZoom,
            this.zoomLevel,
            focusPoint,
            { x: this.offsetX, y: this.offsetY }
        );
        
        this.zoomLevel = transform.zoom;
        this.offsetX = transform.offset.x;
        this.offsetY = transform.offset.y;
    }

    // Update panning animation
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

        requestAnimationFrame(this.updatePanning.bind(this));
    }

    // Core rendering methods
    update() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.drawMap();
        this.drawGrid();
        this.drawPalette();
    }

    private drawBackground() {
        this.ctx.fillStyle = "#4a4a4a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private drawMap() {
        if (!this.tilemap.isLoaded()) return;

        // Apply zoom and offset transformation
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Draw each layer from bottom to top
        for (let layer = 0; layer < this.MAX_LAYERS; layer++) {
            // Skip hidden layers
            if (!this.isLayerVisible(layer)) continue;

            // If showing all layers or this is the current layer, use full opacity
            this.ctx.globalAlpha = this.currentLayer === -1 || layer === this.currentLayer ? 1.0 : 0.3;
            
            const dimensions = this.getMapDimensions();
            for (let y = 0; y < dimensions.height; y++) {
                for (let x = 0; x < dimensions.width; x++) {
                    const tileIndex = this.mapData[layer][y][x];
                    if (tileIndex === -1) continue; // Skip empty tiles
                    
                    const tile = this.tilemap.getTile(tileIndex);
                    if (tile) {
                        const screenPos = mapToScreen(x, y, 0, 0, 1, this.tilemap.tileWidth, this.tilemap.tileHeight);
                        this.ctx.drawImage(tile, screenPos.x, screenPos.y);
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
            drawFloodFillPreview(
                this.ctx,
                filledPoints,
                this.tilemap.tileWidth,
                this.tilemap.tileHeight,
                this.zoomLevel,
                mapToScreen
            );
        } else if (this.isDrawingRectangle && this.rectangleStartX !== null && this.rectangleStartY !== null) {
            // Draw rectangle preview
            const startX = Math.min(this.rectangleStartX, this.hoverX);
            const startY = Math.min(this.rectangleStartY, this.hoverY);
            const endX = Math.max(this.rectangleStartX, this.hoverX);
            const endY = Math.max(this.rectangleStartY, this.hoverY);
            
            const width = endX - startX + 1;
            const height = endY - startY + 1;

            if (this.isCustomBrushMode && this.selectedCustomBrush) {
                // Preview custom brush pattern in rectangle
                drawCustomBrushPreview(
                    this.ctx,
                    this.selectedCustomBrush,
                    { x: startX, y: startY, width, height },
                    (index: number) => this.tilemap.getTile(index),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.zoomLevel,
                    mapToScreen,
                    this.useWorldAlignedRepeat,
                    isInMapBounds,
                    this.getMapDimensions()
                );
            } else {
                // Regular rectangle preview
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

                // Draw preview of tiles
                const tileIndex = this.paintTile === null ? -1 : this.paintTile;
                if (tileIndex !== -1) {
                    const tile = this.tilemap.getTile(tileIndex);
                    if (tile) {
                        this.ctx.globalAlpha = 0.5;
                        for (let y = startY; y <= endY; y++) {
                            for (let x = startX; x <= endX; x++) {
                                if (isInMapBounds(x, y, this.getMapDimensions())) {
                                    const screenPos = mapToScreen(
                                        x,
                                        y,
                                        0,
                                        0,
                                        1,
                                        this.tilemap.tileWidth,
                                        this.tilemap.tileHeight
                                    );
                                    this.ctx.drawImage(tile, screenPos.x, screenPos.y);
                                }
                            }
                        }
                        this.ctx.globalAlpha = 1.0;
                    }
                }
            }
        } else if (this.isCustomBrushMode && this.selectedCustomBrush) {
            const { tiles } = this.selectedCustomBrush;
            
            // If using rectangle tool and not actively drawing, only show top-left tile
            if (toolFSM.context.currentTool === 'rectangle' && !this.isDrawingRectangle) {
                const tileIndex = tiles[0][0];  // Get top-left tile of brush
                if (tileIndex !== -1) {
                    const tile = this.tilemap.getTile(tileIndex);
                    if (tile) {
                        const screenPos = mapToScreen(
                            this.hoverX,
                            this.hoverY,
                            0,
                            0,
                            1,
                            this.tilemap.tileWidth,
                            this.tilemap.tileHeight
                        );
                        drawSingleTilePreview(
                            this.ctx,
                            tile,
                            screenPos.x,
                            screenPos.y,
                            this.tilemap.tileWidth,
                            this.tilemap.tileHeight,
                            this.zoomLevel
                        );
                    }
                }
            } else {
                // Regular custom brush preview with full brush size
                const targetArea = getBrushArea(this.hoverX, this.hoverY, this.brushSize);
                drawCustomBrushPreview(
                    this.ctx,
                    this.selectedCustomBrush,
                    targetArea,
                    (index: number) => this.tilemap.getTile(index),
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight,
                    this.zoomLevel,
                    mapToScreen,
                    this.useWorldAlignedRepeat,
                    isInMapBounds,
                    this.getMapDimensions()
                );
            }
        } else {
            // Regular brush preview - use single tile position for rectangle tool
            const brushArea = toolFSM.context.currentTool === 'rectangle' 
                ? { x: this.hoverX, y: this.hoverY, width: 1, height: 1 }
                : getBrushArea(this.hoverX, this.hoverY, this.brushSize);
            
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

        this.ctx.restore();
    }

    // Palette and brush preview
    private drawPalette() {
        if (!this.tilemap.isLoaded()) return;

        const paletteX = 10;
        const paletteY = 10;
        const tilesPerRow = this.tilemap.width;

        // First draw all tiles
        for (let i = 0; i < this.tilemap.width * this.tilemap.height; i++) {
            const tile = this.tilemap.getTile(i);
            if (tile) {
                const x = paletteX + (i % tilesPerRow) * (this.tilemap.tileWidth + this.tilemap.spacing);
                const y = paletteY + Math.floor(i / tilesPerRow) * (this.tilemap.tileHeight + this.tilemap.spacing);
                this.ctx.drawImage(tile, x, y);
            }
        }

        // Draw the selection highlight for regular tiles
        if (!this.isCustomBrushMode) {
            if (this.isSelectingTiles && this.selectionStartX !== null && this.selectionStartY !== null &&
                this.selectionEndX !== null && this.selectionEndY !== null) {
                // Draw multi-tile selection
                const startTileX = Math.min(this.selectionStartX, this.selectionEndX);
                const startTileY = Math.min(this.selectionStartY, this.selectionEndY);
                const endTileX = Math.max(this.selectionStartX, this.selectionEndX);
                const endTileY = Math.max(this.selectionStartY, this.selectionEndY);

                const startX = paletteX + startTileX * (this.tilemap.tileWidth + this.tilemap.spacing);
                const startY = paletteY + startTileY * (this.tilemap.tileHeight + this.tilemap.spacing);
                const width = (endTileX - startTileX + 1) * (this.tilemap.tileWidth + this.tilemap.spacing) - this.tilemap.spacing;
                const height = (endTileY - startTileY + 1) * (this.tilemap.tileHeight + this.tilemap.spacing) - this.tilemap.spacing;

                // Draw black border first
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(
                    startX - 2,
                    startY - 2,
                    width + 4,
                    height + 4
                );

                // Draw green highlight on top
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(
                    startX - 2,
                    startY - 2,
                    width + 4,
                    height + 4
                );
            } else {
                // Draw single tile selection
                const selectedX = paletteX + (toolFSM.context.selectedTile % tilesPerRow) * (this.tilemap.tileWidth + this.tilemap.spacing);
                const selectedY = paletteY + Math.floor(toolFSM.context.selectedTile / tilesPerRow) * (this.tilemap.tileHeight + this.tilemap.spacing);
                
                // Draw black border first
                this.ctx.strokeStyle = '#000000';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(
                    selectedX - 2,
                    selectedY - 2,
                    this.tilemap.tileWidth + 4,
                    this.tilemap.tileHeight + 4
                );

                // Draw green highlight on top
                this.ctx.strokeStyle = '#00ff00';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(
                    selectedX - 2,
                    selectedY - 2,
                    this.tilemap.tileWidth + 4,
                    this.tilemap.tileHeight + 4
                );
            }
        }

        // Draw custom brushes section
        const brushSectionY = paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / tilesPerRow) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 20;
        
        // Draw separator line
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(paletteX, brushSectionY - 10);
        this.ctx.lineTo(paletteX + tilesPerRow * (this.tilemap.tileWidth + this.tilemap.spacing), brushSectionY - 10);
        this.ctx.stroke();

        // Draw custom brushes
        const maxBrushWidth = tilesPerRow * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        let currentY = brushSectionY;

        // Draw "Add Brush" button
        const addBrushSize = 32;
        this.ctx.fillStyle = '#444';
        this.ctx.fillRect(paletteX, currentY, addBrushSize, addBrushSize);
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(paletteX, currentY, addBrushSize, addBrushSize);
        
        // Draw plus symbol
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        const center = addBrushSize / 2;
        const size = addBrushSize / 3;
        this.ctx.beginPath();
        this.ctx.moveTo(paletteX + center, currentY + center - size/2);
        this.ctx.lineTo(paletteX + center, currentY + center + size/2);
        this.ctx.moveTo(paletteX + center - size/2, currentY + center);
        this.ctx.lineTo(paletteX + center + size/2, currentY + center);
        this.ctx.stroke();

        currentY += addBrushSize + brushSpacing;

        // Draw each custom brush
        for (const brush of this.customBrushes) {
            if (brush.preview) {
                const scale = Math.min(1, maxBrushWidth / brush.preview.width);
                const width = brush.preview.width * scale;
                const height = brush.preview.height * scale;

                // Draw brush preview
                this.ctx.drawImage(
                    brush.preview,
                    paletteX,
                    currentY,
                    width,
                    height
                );

                // Draw selection highlight if this brush is selected
                if (this.isCustomBrushMode && this.selectedCustomBrush?.id === brush.id) {
                    this.ctx.strokeStyle = '#000000';
                    this.ctx.lineWidth = 3;
                    this.ctx.strokeRect(
                        paletteX - 2,
                        currentY - 2,
                        width + 4,
                        height + 4
                    );

                    this.ctx.strokeStyle = '#00ff00';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(
                        paletteX - 2,
                        currentY - 2,
                        width + 4,
                        height + 4
                    );
                }

                currentY += height + brushSpacing;
            }
        }
    }

    // Calculate the total height of the palette area
    private getPaletteHeight(): number {
        if (!this.tilemap.isLoaded()) return 0;
        const rowCount = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width);
        const tilemapHeight = 10 + rowCount * (this.tilemap.tileHeight + this.tilemap.spacing);
        
        // Add height for custom brushes section
        let customBrushesHeight = 20; // Spacing and separator
        customBrushesHeight += 32 + 10; // Add brush button + spacing
        
        // Add height for each brush preview
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        for (const brush of this.customBrushes) {
            if (brush.preview) {
                const scale = Math.min(1, maxBrushWidth / brush.preview.width);
                customBrushesHeight += brush.preview.height * scale + 10; // brush height + spacing
            }
        }
        
        return tilemapHeight + customBrushesHeight;
    }

    // Handle palette interaction
    private isWithinPalette(x: number, y: number): boolean {
        if (!this.tilemap.isLoaded()) return false;
        
        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Check if within tilemap section
        if (y < tilemapHeight) {
            // Calculate the tile position within the palette
            const tileX = Math.floor((x - 10) / (this.tilemap.tileWidth + this.tilemap.spacing));
            const tileY = Math.floor((y - 10) / (this.tilemap.tileHeight + this.tilemap.spacing));
            const tileIndex = tileY * this.tilemap.width + tileX;
            
            // Check if the click is within the actual tilemap bounds
            return tileX >= 0 && 
                   tileX < this.tilemap.width && 
                   tileY >= 0 && 
                   tileIndex < this.tilemap.width * this.tilemap.height;
        }
        
        // Check if within custom brushes section
        return y <= this.getPaletteHeight() && x >= 10 && 
               x <= 10 + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing);
    }

    private handlePaletteClick(x: number, y: number): void {
        if (!this.tilemap.isLoaded()) return;

        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;

        // Handle click in tilemap section
        if (y < tilemapHeight) {
            const tilePos = this.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                // Start tile selection
                this.isSelectingTiles = true;
                this.selectionStartX = tilePos.tileX;
                this.selectionStartY = tilePos.tileY;
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;
                
                // Don't select the single tile yet - wait for mouseup
                this.selectCustomBrush(null);
            }
            return;
        }

        // Handle click in custom brushes section
        let currentY = tilemapHeight + 20; // Add spacing for separator

        // Check if clicked on "Add Brush" button
        if (y >= currentY && y <= currentY + 32 && x >= 10 && x <= 10 + 32) {
            editorStore.setShowCustomBrushDialog(true);
            return;
        }

        currentY += 32 + 10; // Add brush button height + spacing

        // Check each brush
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        for (const brush of this.customBrushes) {
            if (brush.preview) {
                const scale = Math.min(1, maxBrushWidth / brush.preview.width);
                const width = brush.preview.width * scale;
                const height = brush.preview.height * scale;

                if (y >= currentY && y <= currentY + height && 
                    x >= 10 && x <= 10 + width) {
                    this.selectCustomBrush(brush.id);
                    return;
                }

                currentY += height + 10; // brush height + spacing
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

    // Initialize the editor
    async init() {
        try {
            await this.tilemap.load();
            this.centerMap();
        } catch (error) {
            console.error('Failed to load tilemap:', error);
        }
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

    // Handle window resize
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.imageSmoothingEnabled = false;
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
        if (this.isWithinPalette(mouseX, mouseY)) {
            if (e.button === 0) { // Left click for palette selection
                this.handlePaletteClick(mouseX, mouseY);
            } else if (e.button === 2) { // Right click for brush settings
                this.handlePaletteRightClick(mouseX, mouseY);
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
                
                this.isPainting = true;
                this.paintTile = e.button === 0 ? toolFSM.context.selectedTile : -1;

                if (this.isFloodFillMode) {
                    // Get the target value (the tile we're replacing)
                    const targetValue = this.mapData[this.currentLayer][mapPos.y][mapPos.x];
                    
                    // Only flood fill if we're changing to a different tile
                    if (targetValue !== this.paintTile) {
                        // Perform flood fill
                        const filledPoints = floodFill(
                            this.mapData[this.currentLayer],
                            mapPos.x,
                            mapPos.y,
                            targetValue,
                            this.paintTile
                        );
                        
                        if (filledPoints.length > 0) {
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
        if (this.isSelectingTiles) {
            const tilePos = this.getTileFromPaletteCoords(mouseX, mouseY);
            if (tilePos) {
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;
            } else {
                // If outside valid tiles, clamp to nearest valid tile
                const paletteX = 10;
                const paletteY = 10;
                const tilesPerRow = this.tilemap.width;
                const totalTiles = this.tilemap.width * this.tilemap.height;
                const totalRows = Math.ceil(totalTiles / tilesPerRow);

                // Calculate raw tile coordinates
                let tileX = Math.floor((mouseX - paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing));
                let tileY = Math.floor((mouseY - paletteY) / (this.tilemap.tileHeight + this.tilemap.spacing));

                // Clamp both X and Y independently first
                tileX = Math.max(0, Math.min(tilesPerRow - 1, tileX));
                tileY = Math.max(0, Math.min(totalRows - 1, tileY));

                // Then check if the resulting tile index is valid
                const tileIndex = tileY * tilesPerRow + tileX;
                if (tileIndex < totalTiles) {
                    this.selectionEndX = tileX;
                    this.selectionEndY = tileY;
                } else {
                    // If the tile index is invalid, adjust X to fit within the last row
                    const maxXForLastRow = (totalTiles - 1) % tilesPerRow;
                    if (tileY === totalRows - 1) {
                        tileX = Math.min(tileX, maxXForLastRow);
                        this.selectionEndX = tileX;
                        this.selectionEndY = tileY;
                    }
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

            if (this.isCustomBrushMode && this.selectedCustomBrush) {
                // Apply custom brush pattern to rectangle
                const { tiles, width: brushWidth, height: brushHeight } = this.selectedCustomBrush;
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
                for (let y = startY; y <= endY; y++) {
                    for (let x = startX; x <= endX; x++) {
                        if (isInMapBounds(x, y, this.getMapDimensions())) {
                            const newTile = this.paintTile === -1 ? -1 : toolFSM.context.selectedTile;
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

        // Handle tile selection completion
        if (this.isSelectingTiles) {
            if (this.selectionStartX === this.selectionEndX && this.selectionStartY === this.selectionEndY) {
                // Single tile selection - only if start and end are the same
                const tileIndex = this.selectionStartY! * this.tilemap.width + this.selectionStartX!;
                toolFSM.send('selectTile', tileIndex);
            } else {
                console.log('Creating temporary brush from selection');
                // Multi-tile selection - create temporary brush
                this.createTemporaryBrushFromSelection();
            }
            // Reset selection state
            this.isSelectingTiles = false;
            this.selectionStartX = null;
            this.selectionStartY = null;
            this.selectionEndX = null;
            this.selectionEndY = null;
            return;
        }

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
            
            // Update FSM state only once at the end of painting
            // historyFSM.send('saveState', cloneMapData(this.mapData));
            
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

    // Brush application
    private applyBrush(mapX: number, mapY: number, isErasing: boolean = false) {
        let modified = false;
        if (this.isCustomBrushMode && this.selectedCustomBrush && !isErasing) {
            const { tiles, width: brushWidth, height: brushHeight } = this.selectedCustomBrush;
            
            // Calculate the target area dimensions based on brush size
            const targetArea = getBrushArea(mapX, mapY, this.brushSize);
            
            // Calculate brush pattern using 9-slice scaling
            const pattern = calculateBrushPattern(
                targetArea,
                { width: brushWidth, height: brushHeight },
                this.useWorldAlignedRepeat
            );

            // Apply the pattern
            for (let ty = 0; ty < targetArea.height; ty++) {
                for (let tx = 0; tx < targetArea.width; tx++) {
                    const worldX = targetArea.x + tx;
                    const worldY = targetArea.y + ty;

                    if (isInMapBounds(worldX, worldY, this.getMapDimensions())) {
                        const { sourceX, sourceY } = pattern[ty][tx];
                        const tileIndex = tiles[sourceY][sourceX];
                        if (tileIndex !== -1) {
                            if (this.mapData[this.currentLayer][worldY][worldX] !== tileIndex) {
                                this.mapData[this.currentLayer][worldY][worldX] = tileIndex;
                                modified = true;
                            }
                        }
                    }
                }
            }
        } else {
            // Regular brush painting
            const brushArea = getBrushArea(mapX, mapY, this.brushSize);
            const newTile = isErasing ? -1 : toolFSM.context.selectedTile;
            
            for (let dy = 0; dy < brushArea.height; dy++) {
                for (let dx = 0; dx < brushArea.width; dx++) {
                    const tx = brushArea.x + dx;
                    const ty = brushArea.y + dy;
                    
                    if (isInMapBounds(tx, ty, this.getMapDimensions())) {
                        if (this.mapData[this.currentLayer][ty][tx] !== newTile) {
                            this.mapData[this.currentLayer][ty][tx] = newTile;
                            modified = true;
                        }
                    }
                }
            }
        }

        if (modified && !this.hasModifiedDuringPaint) {
            this.hasModifiedDuringPaint = true;
        }
    }

    // Keyboard event handlers
    handleKeyDown(e: KeyboardEvent) {
        // Skip handling if target is an input element
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Check if dialog is open (passed as custom property)
        const isDialogOpen = (e as any).isDialogOpen;

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

        // Skip WASD handling if dialog is open
        if (isDialogOpen) {
            return;
        }

        // Check for number keys (0-9) for layer selection
        if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const layer = e.key === '0' ? 9 : parseInt(e.key) - 1;
            if (layer >= 0 && layer < this.MAX_LAYERS) {
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
            case 'v':
                e.preventDefault();
                this.showGrid = !this.showGrid;
                break;
            case 'w':
                e.preventDefault();
                if (!this.isCustomBrushMode) {
                    const selectedTile = toolFSM.context.selectedTile;
                    if (selectedTile >= this.tilemap.width) {
                        toolFSM.send('selectTile', selectedTile - this.tilemap.width);
                    }
                }
                break;
            case 's':
                e.preventDefault();
                if (!this.isCustomBrushMode) {
                    const selectedTile = toolFSM.context.selectedTile;
                    if (selectedTile < (this.tilemap.width * (this.tilemap.height - 1))) {
                        toolFSM.send('selectTile', selectedTile + this.tilemap.width);
                    }
                }
                break;
            case 'a':
                e.preventDefault();
                if (!this.isCustomBrushMode) {
                    const selectedTile = toolFSM.context.selectedTile;
                    if (selectedTile > 0) {
                        toolFSM.send('selectTile', selectedTile - 1);
                    }
                }
                break;
            case 'd':
                e.preventDefault();
                if (!this.isCustomBrushMode) {
                    const selectedTile = toolFSM.context.selectedTile;
                    if (selectedTile < this.tilemap.width * this.tilemap.height - 1) {
                        toolFSM.send('selectTile', selectedTile + 1);
                    }
                }
                break;
            case 'escape':
                e.preventDefault();
                this.cancelRectangleDrawing();
                break;
        }
    }

    handleKeyUp(e: KeyboardEvent) {
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
                spacing: this.tileSpacing
            },
            includeCustomBrushes ? this.customBrushes : [],
            useCompression
        ));
    }

    async importMap(data: { version: number, format: string, mapData: any, tilemap: any }) {
        if (!data.mapData) {
            throw new Error('Invalid map data format');
        }

        // Handle tilemap data if present
        if (data.tilemap) {
            this.tileWidth = data.tilemap.tileWidth;
            this.tileHeight = data.tilemap.tileHeight;
            this.tileSpacing = data.tilemap.spacing;
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
            this.mapData = unpackedData.slice(0, this.MAX_LAYERS);

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
    createCustomBrush(name: string | null, tiles: number[][]): CustomBrush {
        const brush: Omit<CustomBrush, 'preview' | 'id'> = {
            name: name || `${tiles[0].length}x${tiles.length} Brush`,
            tiles,
            width: tiles[0]?.length || 0,
            height: tiles.length
        };

        const preview = createBrushPreview(
            brush,
            (index) => this.tilemap.getTile(index),
            this.tilemap.tileWidth,
            this.tilemap.tileHeight
        );

        const customBrush: CustomBrush = {
            ...brush,
            id: generateBrushId(),
            preview
        };

        this.customBrushes.push(customBrush);
        return customBrush;
    }

    updateCustomBrush(brushId: string, name: string | null, tiles: number[][]): CustomBrush | null {
        const brushIndex = this.customBrushes.findIndex(b => b.id === brushId);
        if (brushIndex === -1) return null;

        const brush: Omit<CustomBrush, 'preview' | 'id'> = {
            name: name || `${tiles[0].length}x${tiles.length} Brush`,
            tiles,
            width: tiles[0]?.length || 0,
            height: tiles.length
        };

        const preview = createBrushPreview(
            brush,
            (index) => this.tilemap.getTile(index),
            this.tilemap.tileWidth,
            this.tilemap.tileHeight
        );

        const customBrush: CustomBrush = {
            ...brush,
            id: brushId,
            preview
        };

        this.customBrushes[brushIndex] = customBrush;
        
        // If this brush was selected, update the selection
        if (this.selectedCustomBrush?.id === brushId) {
            this.selectedCustomBrush = customBrush;
        }

        return customBrush;
    }

    deleteCustomBrush(brushId: string) {
        const index = this.customBrushes.findIndex(b => b.id === brushId);
        if (index !== -1) {
            if (this.selectedCustomBrush?.id === brushId) {
                this.selectCustomBrush(null);
            }
            this.customBrushes.splice(index, 1);
        }
    }

    selectCustomBrush(brushId: string | null) {
        if (brushId === null) {
            this.selectedCustomBrush = null;
            this.isCustomBrushMode = false;
            return;
        }

        const brush = this.customBrushes.find(b => b.id === brushId);
        if (brush) {
            this.selectedCustomBrush = brush;
            this.isCustomBrushMode = true;
        }
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
            this.centerMap();
        } catch (error) {
            console.error('Failed to load new tilemap:', error);
            throw error;
        }
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

    private getTileFromPaletteCoords(x: number, y: number): { tileX: number, tileY: number } | null {
        const paletteX = 10;
        const paletteY = 10;
        const tilesPerRow = this.tilemap.width;

        // Calculate the tile position within the palette
        const tileX = Math.floor((x - paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing));
        const tileY = Math.floor((y - paletteY) / (this.tilemap.tileHeight + this.tilemap.spacing));
        
        // Check if the click is within the actual tilemap bounds
        if (tileX >= 0 && tileX < this.tilemap.width && 
            tileY >= 0 && (tileY * tilesPerRow + tileX) < this.tilemap.width * this.tilemap.height) {
            return { tileX, tileY };
        }
        return null;
    }

    private createTemporaryBrushFromSelection() {
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

        // Create and select the temporary brush
        const brush = this.createCustomBrush(`${width}x${height} Selection`, tiles);
        console.log('Created brush:', brush);
        this.selectCustomBrush(brush.id);
        console.log('Selected brush:', this.selectedCustomBrush);
    }

    private handlePaletteRightClick(x: number, y: number): void {
        if (!this.tilemap.isLoaded()) return;
        
        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Skip if clicking in tilemap section
        if (y < tilemapHeight) {
            return;
        }
        
        // Handle right click in custom brushes section
        let currentY = tilemapHeight + 20; // Add spacing for separator
        currentY += 32 + 10; // Skip "Add Brush" button + spacing
        
        // Check each brush
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        for (const brush of this.customBrushes) {
            if (brush.preview) {
                const scale = Math.min(1, maxBrushWidth / brush.preview.width);
                const width = brush.preview.width * scale;
                const height = brush.preview.height * scale;
                
                if (y >= currentY && y <= currentY + height && 
                    x >= 10 && x <= 10 + width) {
                    editorStore.setShowCustomBrushDialog(true);
                    editorStore.setCustomBrushDialogId(brush.id);
                    return;
                }
                
                currentY += height + 10; // brush height + spacing
            }
        }
    }
}

// Export the singleton instance
export const mapEditor = {
    get instance() { return editor; }
}; 