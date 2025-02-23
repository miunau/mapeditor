import { Tilemap } from './tilemap';
import { floodFill } from './floodfill';
import type { MapData, MapDimensions, CustomBrush } from './types/map';
import { createEmptyMap, cloneMapData, validateMapDimensions } from './types/map';
import type { Point, Rect } from './utils/coordinates';
import { screenToMap, mapToScreen, isInMapBounds, getBrushArea, calculateMapCenter } from './utils/coordinates';
import { generateBrushId, createBrushPreview, calculateBrushPattern, createEmptyBrushPattern } from './utils/brush';
import { findClosestZoomLevel, calculateZoomTransform, type ZoomLevel } from './utils/zoom';
import { createMapMetadata, unpackMapData } from './utils/serialization';
import type { ResizeAlignment } from './types/map';

export type { ResizeAlignment };
export class MapEditor {
    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;
    tilemap!: Tilemap;
    mapData!: MapData;
    selectedTile: number = 0;
    currentLayer: number = 0;
    readonly MAX_LAYERS = 10;
    showGrid: boolean = true;
    
    // For panning
    isPanning: boolean = false;
    lastPanX: number = 0;
    lastPanY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    panVelocityX: number = 0;
    panVelocityY: number = 0;
    isKeyPanning: boolean = false;
    keyPanState = {
        left: false,
        right: false,
        up: false,
        down: false
    };

    // For zooming
    zoomLevel: ZoomLevel = 1;
    minZoom: ZoomLevel = 0.25;
    maxZoom: ZoomLevel = 4;

    // For painting
    isPainting: boolean = false;
    paintTile: number | null = null;
    hasModifiedDuringPaint: boolean = false;

    // For number selection
    private numberBuffer: string = '';
    private numberTimeout: number | null = null;

    // For undo
    undoStack: MapData[] = [];
    redoStack: MapData[] = [];
    maxUndoSteps: number = 50;

    // For brush size
    brushSize: number = 1;
    hoverX: number = -1;
    hoverY: number = -1;

    // For flood fill
    isFloodFillMode: boolean = false;

    // For tilemap settings
    private tilemapUrl: string = '/tilemap.png';
    private tileWidth: number = 16;
    private tileHeight: number = 16;
    private tileSpacing: number = 1;

    // For custom brushes
    customBrushes: CustomBrush[] = [];
    selectedCustomBrush: CustomBrush | null = null;
    isCustomBrushMode: boolean = false;
    useWorldAlignedRepeat: boolean = false;

    // For layer management
    private layerVisibility: boolean[] = Array(this.MAX_LAYERS).fill(true);

    constructor(canvas: HTMLCanvasElement, width: number = 20, height: number = 15) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        // Disable image smoothing for crisp pixels
        this.ctx.imageSmoothingEnabled = false;
        this.tilemap = new Tilemap(this.tilemapUrl, this.tileWidth, this.tileHeight, this.tileSpacing);
        
        // Initialize empty map data with layers
        this.mapData = createEmptyMap(width, height, this.MAX_LAYERS);
        
        // Initialize undo stack with initial state
        this.undoStack = [cloneMapData(this.mapData)];
        this.redoStack = [];

        // Add wheel event listener
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Start the animation loop for smooth panning
        requestAnimationFrame(this.updatePanning.bind(this));
    }

    // Resize the map, preserving existing content where possible
    resizeMap(newWidth: number, newHeight: number, alignment: ResizeAlignment = 'middle-center') {
        // Validate dimensions
        if (!validateMapDimensions(newWidth, newHeight)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        // Save state before resizing
        this.saveToUndoStack();

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

        this.mapData = newMap;
        this.centerMap();
    }

    // Get current map dimensions
    getMapDimensions(): MapDimensions {
        return {
            width: this.mapData[0][0].length,
            height: this.mapData[0].length
        };
    }

    // Create a new empty map
    newMap(width: number, height: number) {
        if (!validateMapDimensions(width, height)) {
            throw new Error('Map dimensions must be positive numbers');
        }

        this.mapData = createEmptyMap(width, height, this.MAX_LAYERS);
        // Initialize undo stack with new empty state
        this.undoStack = [cloneMapData(this.mapData)];
        this.redoStack = [];
        this.centerMap();
    }

    async init() {
        try {
            await this.tilemap.load();
            this.centerMap();
        } catch (error) {
            console.error('Failed to load tilemap:', error);
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // Restore image smoothing setting after canvas resize
        this.ctx.imageSmoothingEnabled = false;
    }

    centerMap() {
        const center = calculateMapCenter(
            this.canvas.width,
            this.canvas.height,
            this.mapData[0][0].length,
            this.mapData[0].length,
            this.tilemap.tileWidth,
            this.tilemap.tileHeight
        );
        this.offsetX = center.x;
        this.offsetY = center.y;
    }

    update() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.drawMap();
        this.drawGrid();
        this.drawPalette();
    }

    drawBackground() {
        this.ctx.fillStyle = "#4a4a4a";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawMap() {
        if (!this.tilemap.isLoaded()) return;

        // Apply zoom and offset transformation
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Draw each layer from bottom to top
        for (let layer = 0; layer < this.MAX_LAYERS; layer++) {
            // Skip hidden layers
            if (!this.layerVisibility[layer]) continue;

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

    drawGrid() {
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
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.zoomLevel, this.zoomLevel);

        // Draw brush preview if hovering over map and not in all layers mode
        if (this.hoverX >= 0 && this.hoverY >= 0 && this.currentLayer !== -1) {
            if (this.isFloodFillMode) {
                // Draw flood fill preview
                const targetValue = this.mapData[this.currentLayer][this.hoverY][this.hoverX];
                const previewLayer = this.mapData[this.currentLayer].map(row => [...row]);
                const filledPoints = floodFill(previewLayer, this.hoverX, this.hoverY, targetValue, -2);
                
                // Draw filled area preview
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 2 / this.zoomLevel;
                
                filledPoints.forEach(point => {
                    const screenPos = mapToScreen(
                        point.x,
                        point.y,
                        0,
                        0,
                        1,
                        this.tilemap.tileWidth,
                        this.tilemap.tileHeight
                    );
                    this.ctx.fillRect(
                        screenPos.x,
                        screenPos.y,
                        this.tilemap.tileWidth,
                        this.tilemap.tileHeight
                    );
                    this.ctx.strokeRect(
                        screenPos.x,
                        screenPos.y,
                        this.tilemap.tileWidth,
                        this.tilemap.tileHeight
                    );
                });
            } else if (this.isCustomBrushMode && this.selectedCustomBrush) {
                const { tiles, width: brushWidth, height: brushHeight } = this.selectedCustomBrush;
                
                // Calculate target dimensions based on brush size
                const targetArea = getBrushArea(this.hoverX, this.hoverY, this.brushSize);
                
                // Calculate brush pattern
                const pattern = calculateBrushPattern(
                    targetArea,
                    { width: brushWidth, height: brushHeight },
                    this.useWorldAlignedRepeat
                );

                // Draw semi-transparent preview
                this.ctx.globalAlpha = 0.5;

                // Draw preview tiles using pattern
                for (let ty = 0; ty < targetArea.height; ty++) {
                    for (let tx = 0; tx < targetArea.width; tx++) {
                        const worldX = targetArea.x + tx;
                        const worldY = targetArea.y + ty;

                        if (isInMapBounds(worldX, worldY, this.getMapDimensions())) {
                            const { sourceX, sourceY } = pattern[ty][tx];
                            const tileIndex = tiles[sourceY][sourceX];
                            if (tileIndex !== -1) {
                                const tile = this.tilemap.getTile(tileIndex);
                                if (tile) {
                                    const screenPos = mapToScreen(
                                        worldX,
                                        worldY,
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
                    }
                }

                this.ctx.globalAlpha = 1.0;

                // Draw border around the entire brush area
                const startPos = mapToScreen(
                    targetArea.x,
                    targetArea.y,
                    0,
                    0,
                    1,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight
                );
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 2 / this.zoomLevel;
                this.ctx.strokeRect(
                    startPos.x,
                    startPos.y,
                    targetArea.width * this.tilemap.tileWidth,
                    targetArea.height * this.tilemap.tileHeight
                );
            } else {
                // Regular brush preview
                const brushArea = getBrushArea(this.hoverX, this.hoverY, this.brushSize);
                const startPos = mapToScreen(
                    brushArea.x,
                    brushArea.y,
                    0,
                    0,
                    1,
                    this.tilemap.tileWidth,
                    this.tilemap.tileHeight
                );

                // Draw semi-transparent fill
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                this.ctx.fillRect(
                    startPos.x,
                    startPos.y,
                    brushArea.width * this.tilemap.tileWidth,
                    brushArea.height * this.tilemap.tileHeight
                );

                // Draw border
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 2 / this.zoomLevel;
                this.ctx.strokeRect(
                    startPos.x,
                    startPos.y,
                    brushArea.width * this.tilemap.tileWidth,
                    brushArea.height * this.tilemap.tileHeight
                );
            }
        }

        this.ctx.restore();
    }

    drawPalette() {
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
            const selectedX = paletteX + (this.selectedTile % tilesPerRow) * (this.tilemap.tileWidth + this.tilemap.spacing);
            const selectedY = paletteY + Math.floor(this.selectedTile / tilesPerRow) * (this.tilemap.tileHeight + this.tilemap.spacing);
            
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

    handleWheel(e: WheelEvent) {
        e.preventDefault();

        // Get mouse position before zoom
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Update zoom level
        const zoomDelta = -e.deltaY * 0.001;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel * (1 + zoomDelta))) as ZoomLevel;
        
        // Only proceed if zoom actually changed
        if (newZoom !== this.zoomLevel) {
            const transform = calculateZoomTransform(
                newZoom,
                this.zoomLevel,
                { x: mouseX, y: mouseY },
                { x: this.offsetX, y: this.offsetY }
            );
            
            this.zoomLevel = transform.zoom as ZoomLevel;
            this.offsetX = transform.offset.x;
            this.offsetY = transform.offset.y;

            // Emit zoom change event
            const event = new CustomEvent('zoomchange', { detail: { zoomLevel: this.zoomLevel } });
            this.canvas.dispatchEvent(event);
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
            const tileX = Math.floor((x - 10) / (this.tilemap.tileWidth + this.tilemap.spacing));
            const tileY = Math.floor((y - 10) / (this.tilemap.tileHeight + this.tilemap.spacing));
            const tileIndex = tileY * this.tilemap.width + tileX;
            
            if (tileX >= 0 && tileX < this.tilemap.width && 
                tileY >= 0 && tileIndex < this.tilemap.width * this.tilemap.height) {
                this.selectedTile = tileIndex;
                this.selectCustomBrush(null);
            }
            return;
        }
        
        // Handle click in custom brushes section
        let currentY = tilemapHeight + 20; // Add spacing for separator
        
        // Check if clicked on "Add Brush" button
        if (y >= currentY && y <= currentY + 32 && x >= 10 && x <= 10 + 32) {
            // Emit custom event for add brush
            const event = new CustomEvent('addbrushrequested');
            this.canvas.dispatchEvent(event);
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

        // Don't allow painting in "all layers" mode
        if (this.currentLayer === -1) {
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
            console.log('=== PAINT START ===');

            if (e.button === 0 || e.button === 2) { // Left or right click
                this.isPainting = true;
                this.paintTile = e.button === 0 ? this.selectedTile : -1;

                if (this.isFloodFillMode && e.button === 0) {
                    // Get the target value (the tile we're replacing)
                    const targetValue = this.mapData[this.currentLayer][mapPos.y][mapPos.x];
                    
                    // Only flood fill if we're changing to a different tile
                    if (targetValue !== this.paintTile) {
                        // Create a copy of the current layer for undo
                        const layerCopy = this.mapData[this.currentLayer].map(row => [...row]);
                        
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
                } else {
                    // Use the new applyBrush method
                    this.applyBrush(mapPos.x, mapPos.y, e.button === 2);
                }
            }
        }
    }

    handleMouseMove(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

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
        if (!this.isWithinPalette(mouseX, mouseY) && 
            isInMapBounds(mapPos.x, mapPos.y, this.getMapDimensions())) {
            this.hoverX = mapPos.x;
            this.hoverY = mapPos.y;
        } else {
            this.hoverX = -1;
            this.hoverY = -1;
        }

        // Handle painting
        if (this.isPainting && !this.isWithinPalette(mouseX, mouseY)) {
            if (this.isFloodFillMode) {
                // Skip flood fill during drag
                return;
            }
            
            // Use the new applyBrush method
            this.applyBrush(mapPos.x, mapPos.y, this.paintTile === -1);
        }
    }

    handleMouseUp() {
        // If we modified anything during this paint operation, save the state
        if (this.hasModifiedDuringPaint) {
            console.log('=== PAINT END - Saving State ===');
            this.saveToUndoStack();
        }
        
        this.isPanning = false;
        this.isPainting = false;
        this.paintTile = null;
        this.hasModifiedDuringPaint = false;
    }

    // Export the current map data
    exportMap(useCompression: boolean = true, includeCustomBrushes: boolean = true): string {
        // Get the tilemap image as base64
        const tilemapCanvas = document.createElement('canvas');
        const tilemapImage = this.tilemap.getImage();
        tilemapCanvas.width = tilemapImage?.width || 0;
        tilemapCanvas.height = tilemapImage?.height || 0;
        const ctx = tilemapCanvas.getContext('2d');
        
        let tilemapSettings = null;
        if (ctx && tilemapImage) {
            // Draw first, then get the data URL
            ctx.drawImage(tilemapImage, 0, 0);
            tilemapSettings = {
                imageData: tilemapCanvas.toDataURL('image/png'),
                tileWidth: this.tileWidth,
                tileHeight: this.tileHeight,
                spacing: this.tileSpacing
            };
        }

        // Export custom brushes data if enabled
        const customBrushesData = includeCustomBrushes ? this.customBrushes.map(brush => ({
            id: brush.id,
            name: brush.name,
            tiles: brush.tiles,
            width: brush.width,
            height: brush.height
        })) : [];

        return JSON.stringify(createMapMetadata(
            this.mapData,
            tilemapSettings,
            customBrushesData,
            useCompression
        ));
    }

    // Import map data
    async importMap(data: { version: number, format: string, mapData: any, tilemap: any, customBrushes?: any[] }) {
        console.log('Importing map data:', data);
        if (!data.mapData) {
            throw new Error('Invalid map data format');
        }

        // Handle tilemap data if present
        if (data.tilemap) {
            try {
                console.log('Loading tilemap...');
                // Create a temporary canvas to convert base64 back to blob URL
                const img = new Image();
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Load the base64 image
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        console.log('Image loaded:', img.width, 'x', img.height);
                        resolve(null);
                    };
                    img.onerror = (err) => {
                        console.error('Image load error:', err);
                        reject(err);
                    };
                    img.src = data.tilemap.imageData;
                });

                // Draw to canvas and convert to blob
                canvas.width = img.width;
                canvas.height = img.height;
                ctx?.drawImage(img, 0, 0);
                const blob = await new Promise<Blob>((resolve) => 
                    canvas.toBlob(blob => resolve(blob!), 'image/png')
                );
                const url = URL.createObjectURL(blob);
                console.log('Created blob URL:', url);

                // Change tilemap with the new settings
                await this.changeTilemap(
                    url,
                    data.tilemap.tileWidth,
                    data.tilemap.tileHeight,
                    data.tilemap.spacing
                );
                console.log('Tilemap changed successfully');
            } catch (error) {
                console.error('Failed to load tilemap:', error);
                throw new Error('Failed to load tilemap from import data');
            }
        }

        // Handle map data based on format
        let unpackedData: MapData;
        try {
            console.log('Unpacking map data, format:', data.format);
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
            console.log('Unpacked data:', unpackedData.length, 'layers');

            // Ensure we have exactly MAX_LAYERS layers
            while (unpackedData.length < this.MAX_LAYERS) {
                const emptyLayer = Array(unpackedData[0].length).fill(0)
                    .map(() => Array(unpackedData[0][0].length).fill(-1));
                unpackedData.push(emptyLayer);
            }
            this.mapData = unpackedData.slice(0, this.MAX_LAYERS);

            // Import custom brushes if present
            if (data.customBrushes) {
                // Clear existing brushes
                this.customBrushes = [];
                
                // Import each brush
                for (const brushData of data.customBrushes) {
                    this.createCustomBrush(brushData.name, brushData.tiles);
                }
            }

            this.centerMap();
            console.log('Import completed successfully');
        } catch (error) {
            console.error('Failed to unpack map data:', error);
            throw error;
        }
    }

    // Undo the last action
    undo() {
        if (this.undoStack.length > 1) {
            console.log('=== UNDO ===');
            console.log('Before undo - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
            
            // Get the current state
            const currentState = this.undoStack.pop()!;
            
            // Add to redo stack
            this.redoStack.push(currentState);
            
            // Apply the previous state (which is now the top of the stack)
            const previousState = this.undoStack[this.undoStack.length - 1];
            this.mapData = cloneMapData(previousState);
            
            console.log('After undo - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
        }
    }

    // Redo the last undone action
    redo() {
        if (this.redoStack.length > 0) {
            console.log('=== REDO ===');
            console.log('Before redo - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
            
            const stateToRedo = this.redoStack.pop()!;
            this.undoStack.push(stateToRedo);
            this.mapData = cloneMapData(stateToRedo);
            
            console.log('After redo - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
        }
    }

    // Save current state to undo stack
    private saveToUndoStack() {
        console.log('=== SAVE STATE ===');
        console.log('Before save - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
        
        const currentState = cloneMapData(this.mapData);
        this.undoStack.push(currentState);
        
        if (this.undoStack.length > this.maxUndoSteps) {
            // Always keep at least the initial state
            if (this.undoStack.length > 1) {
                this.undoStack.shift();
            }
        }
        this.redoStack = [];
        
        console.log('After save - undo stack:', this.undoStack.length, 'redo stack:', this.redoStack.length);
    }

    // Handle keyboard shortcuts
    handleKeyDown(e: KeyboardEvent) {
        // Skip handling if target is an input element
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Check if dialog is open (passed as custom property)
        const isDialogOpen = (e as any).isDialogOpen;

        // Add flood fill toggle
        if (e.key === 'f') {
            e.preventDefault();
            this.isFloodFillMode = !this.isFloodFillMode;
            return;
        }

        // Change brush size controls from [] to Z/X
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (!e.ctrlKey && !e.metaKey) {  // Only if not using Ctrl/Cmd+Z for undo
                this.setBrushSize(this.brushSize - 1);
                return;
            }
        }
        if (e.key.toLowerCase() === 'x') {
            e.preventDefault();
            this.setBrushSize(this.brushSize + 1);
            return;
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

        // Skip WASD handling if dialog is open
        if (isDialogOpen) {
            return;
        }

        // Check for number keys (0-9) for layer selection
        if (/^\d$/.test(e.key)) {
            e.preventDefault();
            const layer = parseInt(e.key);
            if (layer < this.MAX_LAYERS) {
                this.currentLayer = layer;
            }
            return;
        }

        // Check for number keys (0-9) for tile selection
        if (/^\d$/.test(e.key)) {
            e.preventDefault();
            
            // Clear any existing timeout
            if (this.numberTimeout !== null) {
                window.clearTimeout(this.numberTimeout);
            }

            // Add to number buffer
            this.numberBuffer += e.key;

            // Convert to tile index (subtract 1 since we want 1-based input for users)
            const tileIndex = parseInt(this.numberBuffer) - 1;
            
            // If valid tile index, select it
            if (tileIndex >= 0 && tileIndex < this.tilemap.width * this.tilemap.height) {
                this.selectedTile = tileIndex;
            }

            // Set timeout to clear buffer
            this.numberTimeout = window.setTimeout(() => {
                this.numberBuffer = '';
                this.numberTimeout = null;
            }, 500); // 500ms window to type numbers

            return;
        }

        // Clear number buffer on non-number keys
        this.numberBuffer = '';
        if (this.numberTimeout !== null) {
            window.clearTimeout(this.numberTimeout);
            this.numberTimeout = null;
        }

        switch (e.key.toLowerCase()) {
            case 'z':
                if (e.ctrlKey || e.metaKey) {
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case ' ':
                e.preventDefault();
                this.centerMap();
                break;
            case 'r':
                this.centerMap();
                break;
            case 'a':
                e.preventDefault();
                if (this.selectedTile > 0) {
                    this.selectedTile--;
                }
                break;
            case 'd':
                e.preventDefault();
                if (this.selectedTile < this.tilemap.width * this.tilemap.height - 1) {
                    this.selectedTile++;
                }
                break;
            case 'w':
                e.preventDefault();
                if (this.selectedTile >= this.tilemap.width) {
                    this.selectedTile -= this.tilemap.width;
                }
                break;
            case 's':
                e.preventDefault();
                if (this.selectedTile < (this.tilemap.width * (this.tilemap.height - 1))) {
                    this.selectedTile += this.tilemap.width;
                }
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

    // Update brush size (1, 2, 3, etc.)
    setBrushSize(size: number) {
        this.brushSize = Math.max(1, Math.floor(size));
        
        // If we have a valid hover position, recalculate it for the new brush size
        if (this.hoverX >= 0 && this.hoverY >= 0) {
            // Get the current mouse position
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = this.lastPanX;  // Use last known mouse position
            const mouseY = this.lastPanY;

            // Convert to map coordinates
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
                this.hoverX = mapPos.x;
                this.hoverY = mapPos.y;
            }
        }
    }

    private updatePanning() {
        const friction = 0.85; // Adjust this value to change how quickly panning slows down
        const acceleration = 2.0; // Adjust this value to change how quickly panning speeds up
        const maxVelocity = 20; // Maximum panning speed

        if (this.isKeyPanning) {
            // Apply acceleration based on key states (inverted for natural movement)
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

    // Add methods to get current tilemap settings
    getTilemapSettings() {
        return {
            url: this.tilemapUrl,
            tileWidth: this.tileWidth,
            tileHeight: this.tileHeight,
            spacing: this.tileSpacing
        };
    }

    // Add method to change tilemap settings
    async changeTilemap(url: string, tileWidth: number, tileHeight: number, spacing: number) {
        // Store new settings
        this.tilemapUrl = url;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.tileSpacing = spacing;

        // Create new tilemap with updated settings
        this.tilemap = new Tilemap(url, tileWidth, tileHeight, spacing);
        
        // Reset selected tile
        this.selectedTile = 0;

        // Load the new tilemap
        try {
            await this.tilemap.load();
            // Emit a custom event to notify of tilemap change
            const event = new CustomEvent('tilemapchange', { 
                detail: { 
                    url,
                    tileWidth,
                    tileHeight,
                    spacing,
                    width: this.tilemap.width,
                    height: this.tilemap.height
                }
            });
            this.canvas.dispatchEvent(event);
        } catch (error) {
            console.error('Failed to load new tilemap:', error);
            throw error;
        }
    }

    private packMapData(mapData: MapData): any {
        // Convert numbers to a more compact format
        const packLayers = mapData.map(layer => {
            const packed: number[] = [];
            let currentRun = {
                value: layer[0][0],
                count: 1  // Start at 1 instead of 0
            };

            // Flatten the 2D layer and count runs
            for (let y = 0; y < layer.length; y++) {
                for (let x = 0; x < layer[y].length; x++) {
                    // Skip the first cell since we already counted it
                    if (y === 0 && x === 0) continue;
                    
                    const value = layer[y][x];
                    if (value === currentRun.value && currentRun.count < 255) {
                        currentRun.count++;
                    } else {
                        // Store runs as [count, value]
                        packed.push(currentRun.count, currentRun.value);
                        currentRun = { value, count: 1 };
                    }
                }
            }
            // Push the last run
            packed.push(currentRun.count, currentRun.value);
            return packed;
        });

        // Convert to binary format
        const headerSize = 4; // 2 bytes each for width and height
        const totalSize = headerSize + packLayers.reduce((sum, layer) => sum + layer.length, 0);
        const buffer = new Int16Array(totalSize);

        // Write header (width and height)
        buffer[0] = mapData[0][0].length;  // width
        buffer[1] = mapData[0].length;     // height

        // Write layer data
        let offset = headerSize;
        packLayers.forEach(layer => {
            layer.forEach(value => {
                buffer[offset++] = value;
            });
        });

        // Convert to base64
        const bytes = new Uint8Array(buffer.buffer);
        return btoa(String.fromCharCode(...bytes));
    }

    private unpackMapData(base64Data: string): MapData {
        try {
            // Convert from base64 to binary
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const data = new Int16Array(bytes.buffer);

            // Read header
            const width = data[0];
            const height = data[1];
            const headerSize = 4;

            if (width <= 0 || height <= 0 || width > 1000 || height > 1000) {
                throw new Error('Invalid map dimensions');
            }

            // Read layer data
            const layers: MapData = [];
            let offset = headerSize;

            while (offset < data.length - 1) {  // Need at least 2 more values for a run
                // Start a new layer
                const layer: number[][] = Array(height).fill(null).map(() => Array(width).fill(-1));
                let x = 0, y = 0;
                let cellsInLayer = 0;
                const totalCells = width * height;

                // Read runs until layer is full
                while (cellsInLayer < totalCells && offset < data.length - 1) {
                    const count = data[offset++];
                    const value = data[offset++];

                    if (count <= 0) continue;  // Skip invalid runs

                    // Process this run
                    for (let i = 0; i < count; i++) {
                        layer[y][x] = value;
                        x++;
                        if (x >= width) {
                            x = 0;
                            y++;
                        }
                        cellsInLayer++;
                    }
                }

                layers.push(layer);

                // If we've read all the data, break
                if (offset >= data.length - 1) break;
            }

            return layers;
        } catch (error) {
            console.error('Error unpacking map data:', error);
            // Return a minimal valid map on error
            return [Array(10).fill(null).map(() => Array(10).fill(-1))];
        }
    }

    // Create a new custom brush
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

    // Update an existing custom brush
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

    // Select a custom brush
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

    // Delete a custom brush
    deleteCustomBrush(brushId: string) {
        const index = this.customBrushes.findIndex(b => b.id === brushId);
        if (index !== -1) {
            if (this.selectedCustomBrush?.id === brushId) {
                this.selectCustomBrush(null);
            }
            this.customBrushes.splice(index, 1);
        }
    }

    // Override the existing paint logic to handle custom brushes
    private applyBrush(mapX: number, mapY: number, isErasing: boolean = false) {
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
                                this.hasModifiedDuringPaint = true;
                                this.mapData[this.currentLayer][worldY][worldX] = tileIndex;
                            }
                        }
                    }
                }
            }
        } else {
            // Regular brush painting
            const brushArea = getBrushArea(mapX, mapY, this.brushSize);
            const newTile = isErasing ? -1 : this.selectedTile;
            
            for (let dy = 0; dy < brushArea.height; dy++) {
                for (let dx = 0; dx < brushArea.width; dx++) {
                    const tx = brushArea.x + dx;
                    const ty = brushArea.y + dy;
                    
                    if (isInMapBounds(tx, ty, this.getMapDimensions())) {
                        if (this.mapData[this.currentLayer][ty][tx] !== newTile) {
                            this.hasModifiedDuringPaint = true;
                            this.mapData[this.currentLayer][ty][tx] = newTile;
                        }
                    }
                }
            }
        }
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
                    // Emit custom event for brush settings
                    const event = new CustomEvent('brushsettingsrequested', {
                        detail: { brushId: brush.id }
                    });
                    this.canvas.dispatchEvent(event);
                    return;
                }
                
                currentY += height + 10; // brush height + spacing
            }
        }
    }

    // Layer management methods
    swapLayers(layerA: number, layerB: number) {
        if (layerA >= 0 && layerA < this.MAX_LAYERS && 
            layerB >= 0 && layerB < this.MAX_LAYERS) {
            // Swap layer data
            [this.mapData[layerA], this.mapData[layerB]] = 
            [this.mapData[layerB], this.mapData[layerA]];
            // Swap visibility
            [this.layerVisibility[layerA], this.layerVisibility[layerB]] = 
            [this.layerVisibility[layerB], this.layerVisibility[layerA]];
            // Save state
            this.saveToUndoStack();
        }
    }

    toggleLayerVisibility(layer: number) {
        if (layer >= 0 && layer < this.MAX_LAYERS) {
            this.layerVisibility[layer] = !this.layerVisibility[layer];
        }
    }

    isLayerVisible(layer: number): boolean {
        return layer >= 0 && layer < this.MAX_LAYERS ? this.layerVisibility[layer] : false;
    }
} 