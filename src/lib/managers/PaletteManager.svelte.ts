import type { Brush } from '../types/drawing';
import type { Tilemap } from '../utils/tilemap';
import { editorFSM } from '../state/EditorStore.svelte';
import { addDialog } from '../../components/dialogs/diag.svelte';
import CustomBrushDialog from '../../components/dialogs/CustomBrushDialog.svelte';

export class PaletteManager {
    private tilemap: Tilemap;
    private paletteX = 10;
    private paletteY = 10;
    private readonly ADD_BRUSH_ID = 'add_brush';
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    // Selection state variables (moved from EditorStore)
    private isSelectingTiles = false;
    private selectionStartX: number | null = null;
    private selectionStartY: number | null = null;
    private selectionEndX: number | null = null;
    private selectionEndY: number | null = null;

    private boundHandlePaletteMouseDown: (e: MouseEvent) => void;
    private boundHandlePaletteMouseMove: (e: MouseEvent) => void;
    private boundHandlePaletteMouseUp: (e: MouseEvent) => void;

    // Add a new type for brush bounding boxes with spatial information
    private brushBoundingBoxes: Map<string, {
        id: string,
        x: number,
        y: number,
        width: number,
        height: number,
        centerX: number,
        centerY: number,
        row: number,
        col: number,
        section: 'tilemap' | 'custom'
    }> = new Map();

    constructor(
        canvas: HTMLCanvasElement,
        tilemap: Tilemap,
        width: number,
        height: number
    ) {
        this.boundHandlePaletteMouseDown = this.handlePaletteMouseDown.bind(this);
        this.boundHandlePaletteMouseMove = this.handlePaletteMouseMove.bind(this);
        this.boundHandlePaletteMouseUp = this.handlePaletteMouseUp.bind(this);
        this.tilemap = tilemap;
        this.initializeBrushes();
        this.canvas = canvas;
        console.log('Palette manager created');
        this.ctx = this.canvas.getContext('2d', { alpha: true })!; // Use alpha context for transparency
        this.ctx.imageSmoothingEnabled = false;
        this.createCanvas(width, height);
    }

    createCanvas(width: number, height: number) {
        // Calculate the actual size needed for the palette
        const paletteArea = this.getPaletteArea();
        
        // Set size based on the actual palette content
        const canvasWidth = paletteArea.width + this.paletteX * 2;  // Add padding
        const canvasHeight = paletteArea.height + this.paletteY * 2; // Add padding
        
        // Position the canvas to only cover the palette area
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0px';
        this.canvas.style.top = '0px';
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        this.canvas.style.zIndex = '20';
        this.canvas.style.backgroundColor = '#2a2a2a'; // Dark background
        this.canvas.style.border = '1px solid #444'; // Subtle border
        this.canvas.style.borderRadius = '4px'; // Rounded corners
        
        // Set the actual canvas dimensions
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        
        // Get the context for drawing the palette
        
        // Add it to the DOM as a sibling to the main canvas
        if (editorFSM.context.canvas!.parentElement) {
            editorFSM.context.canvas!.parentElement.appendChild(this.canvas);
        }

        // Add mousedown event listener to the canvas
        this.canvas.addEventListener('mousedown', this.boundHandlePaletteMouseDown);
        
        // Add mousemove and mouseup event listeners to the window instead of the canvas
        // This allows us to continue tracking the mouse even when it moves outside the canvas
        window.addEventListener('mousemove', this.boundHandlePaletteMouseMove);
        window.addEventListener('mouseup', this.boundHandlePaletteMouseUp);
        
        // Also prevent context menu on the palette canvas, but only within the palette area
        this.canvas.addEventListener('contextmenu', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (this.isWithinPalette(x, y)) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        
        // Draw the initial palette
        this.drawPalette();
    }

    initializeBrushes() {
        for (let i = 0; i < this.tilemap.width * this.tilemap.height; i++) {
            const brush = this.createBuiltInBrush(i, this.tilemap);
            editorFSM.context.brushes.set(brush.id, brush);
        }
        // Select the first tile and ensure the selection is visible
        editorFSM.send('selectBrush', 'tile_0');
        
        // Force a redraw to ensure the selection highlight is visible
        setTimeout(() => this.drawPalette(), 50);
    }

    createBuiltInBrush(tileIndex: number, tilemap: Tilemap): Brush {
        const brushData = {
            id: `tile_${tileIndex}`,
            type: 'tile' as const,
            name: `Tile ${tileIndex}`,
            tiles: [[tileIndex]],
            width: 1,
            height: 1,
            worldAligned: true,
        };

        const preview = this.createBrushPreview(brushData, 
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
        );

        return {
            ...brushData,
            preview
        };
    }

    createBrushPreview(
        brush: Omit<Brush, 'preview' | 'id'>,
        getTile: (index: number) => HTMLCanvasElement | null,
        tileWidth: number,
        tileHeight: number
    ): HTMLCanvasElement {
        const preview = document.createElement('canvas');
        preview.width = brush.width * tileWidth;
        preview.height = brush.height * tileHeight;
        const ctx = preview.getContext('2d');
        
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            // Draw each tile in the brush
            for (let y = 0; y < brush.height; y++) {
                for (let x = 0; x < brush.width; x++) {
                    const tileIndex = brush.tiles[y][x];
                    if (tileIndex === -1) continue;
                    
                    const tile = getTile(tileIndex);
                    if (tile) {
                        ctx.drawImage(
                            tile,
                            x * tileWidth,
                            y * tileHeight
                        );
                    }
                }
            }
        }

        return preview;
    }

    createCustomBrush(name: string, tiles: number[][], tilemap: Tilemap): Brush {
        const brushData = {
            id: crypto.randomUUID(),
            type: 'custom' as const,
            name: name || `${tiles[0].length}x${tiles.length} Brush`,
            tiles,
            width: tiles[0].length,
            height: tiles.length,
            worldAligned: true,
        };

        const brush: Brush = {
            ...brushData,
            preview: this.createBrushPreview(brushData, 
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
            )
        };
        
        editorFSM.context.brushes.set(brush.id, brush);
        return brush;
    }

    updateBrush(brushId: string, name: string, tiles: number[][], tilemap: Tilemap, worldAligned: boolean): Brush | null {
        const brush = editorFSM.context.brushes.get(brushId);
        if (!brush) return null;

        const brushData = {
            ...brush,
            name: name || brush.name,
            tiles,
            width: tiles[0].length,
            height: tiles.length,
            worldAligned,
        };

        const updatedBrush: Brush = {
            ...brushData,
            preview: this.createBrushPreview(brushData, 
                (idx) => tilemap.getTile(idx),
                tilemap.tileWidth,
                tilemap.tileHeight
            )
        };

        editorFSM.context.brushes.set(brushId, updatedBrush);
        return updatedBrush;
    }

    deleteBrush(brushId: string): boolean {
        const brush = editorFSM.context.brushes.get(brushId);
        if (!brush) return false;

        if (editorFSM.context.currentBrush?.id === brushId) {
            editorFSM.context.currentBrush = null;
        }

        return editorFSM.context.brushes.delete(brushId);
    }

    // Handle mouse events on the palette canvas
    private handlePaletteMouseDown(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if the click is within the palette area
        if (!this.isWithinPalette(x, y)) {
            // If the click is outside the palette area but within the canvas,
            // we need to explicitly allow the event to propagate to the main canvas
            if (this.isWithinCanvas(x, y)) {
                // Create a new event and dispatch it on the main canvas
                this.forwardEventToMainCanvas(e);
            }
            return; // Allow event to propagate to the main canvas
        }
        
        // Stop propagation since we're handling this event
        e.stopPropagation();
        
        if (e.button === 0) { // Left click
            // Get the tile position from the coordinates
            const tilePos = this.getTileFromPaletteCoords(x, y);
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
                
                editorFSM.send('selectBrush', brushId);

                // Redraw the palette to show the selection
                this.drawPalette();
            } else {
                // Handle click on custom brushes or other elements
                this.handlePaletteClick(x, y);
            }
        } else if (e.button === 2) { // Right click
            this.handlePaletteRightClick(x, y);
            // Prevent the context menu
            e.preventDefault();
        }
    }

    private handlePaletteMouseMove(e: MouseEvent) {
        // If we're not in a selection operation, just return
        if (this.selectionStartX === null || this.selectionStartY === null) {
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // If we're already in selection mode, we need to handle mouse movement
        // even if it's outside the palette area
        if (this.isSelectingTiles) {
            // Calculate the nearest valid tile position, clamping to the tilemap boundaries
            const tilesPerRow = this.tilemap.width;
            const tilesPerCol = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width);
            
            // Convert screen coordinates to tile coordinates
            let tileX = Math.floor((x - this.paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing));
            let tileY = Math.floor((y - this.paletteY) / (this.tilemap.tileHeight + this.tilemap.spacing));
            
            // Clamp to valid tile range
            tileX = Math.max(0, Math.min(tileX, this.tilemap.width - 1));
            tileY = Math.max(0, Math.min(tileY, tilesPerCol - 1));
            
            // Ensure the tile index is valid
            const tileIndex = tileY * tilesPerRow + tileX;
            if (tileIndex < this.tilemap.width * this.tilemap.height) {
                this.selectionEndX = tileX;
                this.selectionEndY = tileY;
                
                // Force a redraw of the palette
                this.drawPalette();
            }
            
            return;
        }
        
        // For non-selection operations, check if within palette area
        if (!this.isWithinPalette(x, y)) {
            // If the mouse is outside the palette area but within the canvas,
            // we need to explicitly allow the event to propagate to the main canvas
            if (this.isWithinCanvas(x, y)) {
                // Create a new event and dispatch it on the main canvas
                this.forwardEventToMainCanvas(e);
            }
            
            return; // Allow event to propagate to the main canvas
        }
        
        // Stop propagation since we're handling this event
        e.stopPropagation();
        
        if (this.selectionStartX !== null && this.selectionStartY !== null) {
            const tilePos = this.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                // Only update the end position if it's different from the start position
                // This prevents entering selection mode when just clicking on a tile
                if (tilePos.tileX !== this.selectionStartX || tilePos.tileY !== this.selectionStartY) {
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;
                
                // Only enter selection mode if we're selecting more than one tile
                const width = Math.abs((this.selectionEndX || 0) - this.selectionStartX) + 1;
                const height = Math.abs((this.selectionEndY || 0) - this.selectionStartY) + 1;
                if (width > 1 || height > 1) {
                    this.isSelectingTiles = true;
                    // Clear the single tile selection when entering drag mode
                    editorFSM.send('selectBrush', null);
                        
                        // Force a redraw of the palette
                        this.drawPalette();
                    }
                }
                // If we're still on the same tile as where we started, just update the single tile selection
                else {
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
                    
                    editorFSM.send('selectBrush', brushId);
                    editorFSM.send('selectTile', tileIndex);
                }
            }
        }
    }

    private handlePaletteMouseUp(e: MouseEvent) {
        // If we're not in a selection operation, just return
        if (this.selectionStartX === null || this.selectionStartY === null) {
            return;
        }
        
        // If we've been selecting tiles, create a custom brush regardless of where the mouse is
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
            
            // Stop propagation since we're handling this event
            e.stopPropagation();
            return;
        }
        
        // If we're not in selection mode, just reset the selection state
        // This handles the case where the user just clicked on a tile without dragging
        if (!this.isSelectingTiles) {
            this.selectionStartX = null;
            this.selectionStartY = null;
            this.selectionEndX = null;
            this.selectionEndY = null;
            return;
        }
        
        // For non-selection operations, check if within palette area
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (!this.isWithinPalette(x, y)) {
            // If the mouse is outside the palette area but within the canvas,
            // we need to explicitly allow the event to propagate to the main canvas
            if (this.isWithinCanvas(x, y)) {
                // Create a new event and dispatch it on the main canvas
                this.forwardEventToMainCanvas(e);
            }
            
            // Reset selection state
            this.isSelectingTiles = false;
            this.selectionStartX = null;
            this.selectionStartY = null;
            this.selectionEndX = null;
            this.selectionEndY = null;
            
            return; // Allow event to propagate to the main canvas
        }
        
        // Stop propagation since we're handling this event
        e.stopPropagation();
        
        // Reset selection state
        this.isSelectingTiles = false;
        this.selectionStartX = null;
        this.selectionStartY = null;
        this.selectionEndX = null;
        this.selectionEndY = null;
    }

    // Custom brush methods
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

        // Create and select the brush using the brush manager
        const brush = this.createCustomBrush(`${width}x${height} Selection`, tiles, this.tilemap);
        
        // Use editorStore to select the brush
        editorFSM.send('selectBrush', brush.id);

        // Reset selection state
        this.isSelectingTiles = false;
        this.selectionStartX = null;
        this.selectionStartY = null;
        this.selectionEndX = null;
        this.selectionEndY = null;
    }

    getTileFromPaletteCoords(x: number, y: number): { tileX: number, tileY: number } | null {
        const tilesPerRow = this.tilemap.width;

        // Calculate the tile position within the palette
        const tileX = Math.floor((x - this.paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing));
        const tileY = Math.floor((y - this.paletteY) / (this.tilemap.tileHeight + this.tilemap.spacing));
        
        // Check if the click is within the actual tilemap bounds
        if (tileX >= 0 && tileX < this.tilemap.width && 
            tileY >= 0 && (tileY * tilesPerRow + tileX) < this.tilemap.width * this.tilemap.height) {
            return { tileX, tileY };
        }
        return null;
    }

    isWithinPalette(x: number, y: number): boolean {
        if (!this.tilemap.isLoaded()) return false;
        
        const paletteArea = this.getPaletteArea();
        
        // Check if the point is within the palette bounds
        if (x < paletteArea.x || x > paletteArea.x + paletteArea.width || 
            y < paletteArea.y || y > paletteArea.y + paletteArea.height) {
            return false;
        }
        
        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Check if within tilemap section
        if (y < tilemapHeight) {
            // Calculate the tile position within the palette
            const tileX = Math.floor((x - this.paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing));
            const tileY = Math.floor((y - this.paletteY) / (this.tilemap.tileHeight + this.tilemap.spacing));
            const tileIndex = tileY * this.tilemap.width + tileX;
            
            // Check if the click is within the actual tilemap bounds
            return tileX >= 0 && 
                   tileX < this.tilemap.width && 
                   tileY >= 0 && 
                   tileIndex < this.tilemap.width * this.tilemap.height;
        }
        
        // If not in tilemap section but within overall palette bounds, it's in the custom brushes section
        return true;
    }

    handlePaletteClick(x: number, y: number): void {
        if (!this.tilemap.isLoaded()) return;

        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Handle click in tilemap section
        if (y < tilemapHeight) {
            const tilePos = this.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                // Start tile selection
                this.selectionStartX = tilePos.tileX;
                this.selectionStartY = tilePos.tileY;
                this.selectionEndX = tilePos.tileX;
                this.selectionEndY = tilePos.tileY;
                // Also select the single tile initially
                const tileIndex = tilePos.tileY * this.tilemap.width + tilePos.tileX;
                const brushId = `tile_${tileIndex}`;
                editorFSM.send('selectBrush', brushId);
            }
            return;
        }

        // Handle click in custom brushes section
        const brushSectionY = tilemapHeight + 20; // Add spacing for separator
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        const addBrushSize = 32;

        // Check if clicked on "Add Brush" button
        const addBrushPos = this.getBrushPosition({ id: this.ADD_BRUSH_ID });
        const addBrushDim = this.getBrushDimensions({ id: this.ADD_BRUSH_ID });
        if (addBrushPos && addBrushDim && 
            x >= addBrushPos.x && x <= addBrushPos.x + addBrushDim.width &&
            y >= addBrushPos.y && y <= addBrushPos.y + addBrushDim.height) {
            addDialog('custom-brush', CustomBrushDialog);
            return;
        }

        // Check each custom brush
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.getCustomBrushes();
        for (const brush of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / brush.preview!.width);
            const width = brush.preview!.width * scale;
            const height = brush.preview!.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            if (y >= currentY && y <= currentY + height && 
                x >= currentX && x <= currentX + width) {
                editorFSM.send('selectCustomBrush', brush.id);
                return;
            }

            currentX += width + brushSpacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }
    }

    getBuiltInBrushes(): Brush[] {
        return Array.from(editorFSM.context.brushes.values()).filter(brush => brush.type === 'tile');
    }

    getCustomBrushes(): Brush[] {
        return Array.from(editorFSM.context.brushes.values()).filter(brush => brush.type === 'custom');
    }

    handlePaletteRightClick(x: number, y: number): void {
        if (!this.tilemap.isLoaded()) return;
        
        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Skip if clicking in tilemap section
        if (y < tilemapHeight) {
            return;
        }
        
        // Handle right click in custom brushes section
        const brushSectionY = tilemapHeight + 20; // Add spacing for separator
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        const addBrushSize = 32;
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.getCustomBrushes();
        for (const brush of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / brush.preview!.width);
            const width = brush.preview!.width * scale;
            const height = brush.preview!.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            if (y >= currentY && y <= currentY + height && 
                x >= currentX && x <= currentX + width) {
                addDialog('custom-brush', CustomBrushDialog);
                return;
            }

            currentX += width + brushSpacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }
    }

    getPaletteHeight(): number {
        if (!this.tilemap.isLoaded()) return 0;
        const rowCount = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width);
        const tilemapHeight = 10 + rowCount * (this.tilemap.tileHeight + this.tilemap.spacing);
        
        // Add height for custom brushes section
        let customBrushesHeight = 20; // Spacing and separator
        
        // Calculate height needed for custom brushes
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        let currentX = this.paletteX;
        let currentRowHeight = 32; // Start with height of Add Brush button
        let totalHeight = currentRowHeight;

        // Calculate height considering wrapping
        const customBrushes = this.getCustomBrushes();
        for (const brush of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / brush.preview!.width);
            const width = brush.preview!.width * scale;
            const height = brush.preview!.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                totalHeight += currentRowHeight + brushSpacing;
                currentRowHeight = height;
                currentX = this.paletteX;
            } else {
                currentRowHeight = Math.max(currentRowHeight, height);
            }

            currentX += width + brushSpacing;
        }

        // Add the height of the last row
        totalHeight += brushSpacing;
        
        return tilemapHeight + customBrushesHeight + totalHeight;
    }

    getPaletteArea(): { x: number, y: number, width: number, height: number } {
        if (!this.tilemap.isLoaded()) {
            return { x: this.paletteX, y: this.paletteY, width: 0, height: 0 };
        }
        
        // Calculate width based on tilemap dimensions
        const paletteWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing);
        
        // Use existing method to get height
        const paletteHeight = this.getPaletteHeight();
        
        return {
            x: this.paletteX,
            y: this.paletteY,
            width: paletteWidth,
            height: paletteHeight
        };
    }

    drawPalette(): void {
        if (!this.tilemap.isLoaded()) return;
        
        // Update the canvas size to match the palette content
        this.updateCanvasSize();
        
        const ctx = this.ctx!;
        
        // Clear the canvas first with the background color
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw a subtle grid pattern in the background
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.5;
        const gridSize = 10;
        
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
        
        // Draw built-in brushes (tiles)
        const builtInBrushes = this.getBuiltInBrushes();
        for (const brush of builtInBrushes) {
            const index = parseInt(brush.id.replace('tile_', ''));
            const x = this.paletteX + (index % this.tilemap.width) * (this.tilemap.tileWidth + this.tilemap.spacing);
            const y = this.paletteY + Math.floor(index / this.tilemap.width) * (this.tilemap.tileHeight + this.tilemap.spacing);
            
            // Draw tile
            const tile = this.tilemap.getTile(index);
            if (tile) {
                ctx.drawImage(tile, x, y);
            }
        }

        // Draw selection highlight
        this.drawSelectionHighlight();

        // Draw selection rectangle if selecting tiles
        if (this.isSelectingTiles) {
            this.drawSelectionRectangle(
                this.selectionStartX,
                this.selectionStartY,
                this.selectionEndX,
                this.selectionEndY
            );
        }

        // Draw custom brushes section
        this.drawCustomBrushes();
        
        // Recalculate bounding boxes after drawing
        this.calculateBrushBoundingBoxes();
    }

    private drawSelectionHighlight(): void {
        const selectedBrush = editorFSM.context.currentBrush;
        if (!selectedBrush) return;
        const ctx = this.ctx!;

        let highlightX: number;
        let highlightY: number;
        let highlightWidth: number;
        let highlightHeight: number;

        if (selectedBrush.type === 'tile') {
            // Highlight single tile
            const index = parseInt(selectedBrush.id.replace('tile_', ''));
            highlightX = this.paletteX + (index % this.tilemap.width) * (this.tilemap.tileWidth + this.tilemap.spacing);
            highlightY = this.paletteY + Math.floor(index / this.tilemap.width) * (this.tilemap.tileHeight + this.tilemap.spacing);
            highlightWidth = this.tilemap.tileWidth;
            highlightHeight = this.tilemap.tileHeight;
        } else {
            // Find custom brush position
            const brushPos = this.getBrushPosition(selectedBrush);
            if (brushPos) {
                highlightX = brushPos.x;
                highlightY = brushPos.y;
                const { width, height } = this.getBrushDimensions(selectedBrush);
                highlightWidth = width;
                highlightHeight = height;
            } else {
                return;
            }
        }

        // Draw black border first
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            highlightX - 2,
            highlightY - 2,
            highlightWidth + 4,
            highlightHeight + 4
        );

        // Draw yellow highlight on top
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            highlightX - 2,
            highlightY - 2,
            highlightWidth + 4,
            highlightHeight + 4
        );
    }

    private drawCustomBrushes(): void {
        // Draw custom brushes first
        const ctx = this.ctx!;
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + this.tilemap.spacing;
        
        let currentX = this.paletteX;
        let currentY = brushSectionY;
        let maxHeightInRow = 0;

        const customBrushes = this.getCustomBrushes();
        for (const brush of customBrushes) {
            const { width, height } = this.getBrushDimensions(brush);

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing)) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + this.tilemap.spacing;
                maxHeightInRow = 0;
            }

            // Draw brush preview
            ctx.drawImage(
                brush.preview!,
                currentX,
                currentY,
                width,
                height
            );

            currentX += width + this.tilemap.spacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }

        // Draw "Add Brush" button last
        const addBrushPos = this.getBrushPosition({ id: this.ADD_BRUSH_ID });
        const addBrushDim = this.getBrushDimensions({ id: this.ADD_BRUSH_ID });
        if (addBrushPos && addBrushDim) {
            ctx.fillStyle = '#444';
            ctx.fillRect(addBrushPos.x, addBrushPos.y, addBrushDim.width, addBrushDim.height);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.strokeRect(addBrushPos.x, addBrushPos.y, addBrushDim.width, addBrushDim.height);

            // Draw plus symbol
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            const center = addBrushDim.width / 2;
            const size = addBrushDim.width / 3;
            ctx.beginPath();
            ctx.moveTo(addBrushPos.x + center, addBrushPos.y + center - size/2);
            ctx.lineTo(addBrushPos.x + center, addBrushPos.y + center + size/2);
            ctx.moveTo(addBrushPos.x + center - size/2, addBrushPos.y + center);
            ctx.lineTo(addBrushPos.x + center + size/2, addBrushPos.y + center);
            ctx.stroke();
        }
    }

    getBrushDimensions(brush: Brush | { id: string }): { width: number, height: number } {
        if (brush.id === this.ADD_BRUSH_ID) {
            return {
                width: Math.floor(this.tilemap.tileWidth * 1.5),
                height: Math.floor(this.tilemap.tileHeight * 1.5)
            };
        }

        if ('preview' in brush) {
            const tilesWide = Math.ceil(brush.preview!.width / this.tilemap.tileWidth);
            const tilesHigh = Math.ceil(brush.preview!.height / this.tilemap.tileHeight);
            return {
                width: tilesWide * (this.tilemap.tileWidth + this.tilemap.spacing) - this.tilemap.spacing,
                height: tilesHigh * (this.tilemap.tileHeight + this.tilemap.spacing) - this.tilemap.spacing
            };
        }

        return {
            width: this.tilemap.tileWidth,
            height: this.tilemap.tileHeight
        };
    }

    getBrushPosition(brush: Brush | { id: string }): { x: number, y: number } | null {
        if (brush.id === this.ADD_BRUSH_ID) {
            // Calculate position after all custom brushes
            const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
                (this.tilemap.tileHeight + this.tilemap.spacing) + this.tilemap.spacing;
            
            let currentX = this.paletteX;
            let currentY = brushSectionY;
            let maxHeightInRow = 0;

            const customBrushes = this.getCustomBrushes();
            for (const b of customBrushes) {
                const { width, height } = this.getBrushDimensions(b);
                
                if (currentX + width > this.paletteX + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing)) {
                    currentX = this.paletteX;
                    currentY += maxHeightInRow + this.tilemap.spacing;
                    maxHeightInRow = 0;
                }
                
                currentX += width + this.tilemap.spacing;
                maxHeightInRow = Math.max(maxHeightInRow, height);
            }

            // Add extra margin before the add button
            currentX += 5;

            // If currentX would overflow with the larger button, move to next row
            const { width: addButtonWidth } = this.getBrushDimensions({ id: this.ADD_BRUSH_ID });
            if (currentX + addButtonWidth > this.paletteX + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing)) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + this.tilemap.spacing;
            }

            return { x: currentX, y: currentY };
        }

        if ('isBuiltIn' in brush && brush.isBuiltIn) {
            const index = parseInt(brush.id.replace('tile_', ''));
            return {
                x: this.paletteX + (index % this.tilemap.width) * (this.tilemap.tileWidth + this.tilemap.spacing),
                y: this.paletteY + Math.floor(index / this.tilemap.width) * (this.tilemap.tileHeight + this.tilemap.spacing)
            };
        }

        // Calculate custom brush position
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + this.tilemap.spacing;
        
        let currentX = this.paletteX;
        let currentY = brushSectionY;
        let maxHeightInRow = 0;

        const customBrushes = this.getCustomBrushes();
        for (const b of customBrushes) {
            const { width, height } = this.getBrushDimensions(b);

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing)) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + this.tilemap.spacing;
                maxHeightInRow = 0;
            }

            if (b.id === brush.id) {
                return { x: currentX, y: currentY };
            }

            currentX += width + this.tilemap.spacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }

        return null;
    }

    private drawSelectionRectangle(startX: number | null, startY: number | null, endX: number | null, endY: number | null): void {
        if (startX === null || startY === null || endX === null || endY === null) return;

        // Calculate pixel coordinates
        const x1 = this.paletteX + Math.min(startX, endX) * (this.tilemap.tileWidth + this.tilemap.spacing);
        const y1 = this.paletteY + Math.min(startY, endY) * (this.tilemap.tileHeight + this.tilemap.spacing);
        const x2 = this.paletteX + (Math.max(startX, endX) + 1) * (this.tilemap.tileWidth + this.tilemap.spacing) - this.tilemap.spacing;
        const y2 = this.paletteY + (Math.max(startY, endY) + 1) * (this.tilemap.tileHeight + this.tilemap.spacing) - this.tilemap.spacing;

        // Draw semi-transparent fill
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        // Draw black border first
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x1 - 2, y1 - 2, x2 - x1 + 4, y2 - y1 + 4);

        // Draw yellow highlight on top
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x1 - 2, y1 - 2, x2 - x1 + 4, y2 - y1 + 4);
    }

    // Add a method to calculate and cache all brush bounding boxes
    private calculateBrushBoundingBoxes(): void {
        this.brushBoundingBoxes.clear();
        
        // Calculate bounding boxes for built-in tile brushes
        const builtInBrushes = this.getBuiltInBrushes();
        const tilesPerRow = this.tilemap.width;
        
        for (const brush of builtInBrushes) {
            const index = parseInt(brush.id.replace('tile_', ''));
            const col = index % this.tilemap.width;
            const row = Math.floor(index / this.tilemap.width);
            
            const x = this.paletteX + col * (this.tilemap.tileWidth + this.tilemap.spacing);
            const y = this.paletteY + row * (this.tilemap.tileHeight + this.tilemap.spacing);
            const width = this.tilemap.tileWidth;
            const height = this.tilemap.tileHeight;
            
            this.brushBoundingBoxes.set(brush.id, {
                id: brush.id,
                x,
                y,
                width,
                height,
                centerX: x + width / 2,
                centerY: y + height / 2,
                row,
                col,
                section: 'tilemap'
            });
        }
        
        // Calculate bounding boxes for custom brushes
        const customBrushes = this.getCustomBrushes();
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + this.tilemap.spacing;
        
        let currentX = this.paletteX;
        let currentY = brushSectionY;
        let currentRow = 0;
        let currentCol = 0;
        let maxHeightInRow = 0;
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing);
        
        for (const brush of customBrushes) {
            const { width, height } = this.getBrushDimensions(brush);
            
            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + this.tilemap.spacing;
                maxHeightInRow = 0;
                currentRow++;
                currentCol = 0;
            }

            this.brushBoundingBoxes.set(brush.id, {
                id: brush.id,
                x: currentX,
                y: currentY,
                width,
                height,
                centerX: currentX + width / 2,
                centerY: currentY + height / 2,
                row: currentRow,
                col: currentCol,
                section: 'custom'
            });
            
            currentX += width + this.tilemap.spacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
            currentCol++;
        }

        // Also add the "Add Brush" button
        const addBrushPos = this.getBrushPosition({ id: this.ADD_BRUSH_ID });
        const addBrushDim = this.getBrushDimensions({ id: this.ADD_BRUSH_ID });
        
        if (addBrushPos && addBrushDim) {
            this.brushBoundingBoxes.set(this.ADD_BRUSH_ID, {
                id: this.ADD_BRUSH_ID,
                x: addBrushPos.x,
                y: addBrushPos.y,
                width: addBrushDim.width,
                height: addBrushDim.height,
                centerX: addBrushPos.x + addBrushDim.width / 2,
                centerY: addBrushPos.y + addBrushDim.height / 2,
                row: currentRow,
                col: currentCol,
                section: 'custom'
            });
        }
    }
    
    // Unified method to find the nearest brush in any direction
    findNearestBrush(currentBrushId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null {
        // Ensure bounding boxes are calculated
        if (this.brushBoundingBoxes.size === 0) {
            this.calculateBrushBoundingBoxes();
        }
        
        const currentBox = this.brushBoundingBoxes.get(currentBrushId);
        if (!currentBox) return null;
        
        // Get all brushes, excluding the Add Brush button from navigation
        const allBoxes = Array.from(this.brushBoundingBoxes.values())
            .filter(box => box.id !== this.ADD_BRUSH_ID);
        
        // Check if we have any custom brushes
        const hasCustomBrushes = allBoxes.some(box => box.section === 'custom');
        const tilemapBoxes = allBoxes.filter(box => box.section === 'tilemap');
        const customBoxes = allBoxes.filter(box => box.section === 'custom');
        
        // Filter boxes based on direction
        let candidates: typeof currentBox[] = [];
            
            switch (direction) {
                case 'up':
                // Find brushes above the current one
                candidates = allBoxes.filter(box => 
                    // Either in the row above in the same section
                    (box.section === currentBox.section && box.row === currentBox.row - 1) ||
                    // Or in the bottom row of the tilemap if we're in the top row of custom brushes
                    (currentBox.section === 'custom' && currentBox.row === 0 && 
                     box.section === 'tilemap' && box.row === Math.max(...tilemapBoxes.map(b => b.row))) ||
                    // Or in the bottom row of custom brushes if we're in the top row of tilemap
                    (currentBox.section === 'tilemap' && currentBox.row === 0 && 
                     hasCustomBrushes && box.section === 'custom' && box.row === Math.max(...customBoxes.map(b => b.row)))
                );
                
                // If no candidates found and we're not at the top of the entire palette,
                // wrap around to the bottom
                if (candidates.length === 0) {
                    // If we're in the tilemap section and there are no custom brushes,
                    // wrap to the bottom of the tilemap
                    if (currentBox.section === 'tilemap' && !hasCustomBrushes) {
                        const maxRow = Math.max(...tilemapBoxes.map(box => box.row));
                        candidates = tilemapBoxes.filter(box => box.row === maxRow);
                    } else {
                        // Otherwise, find the bottom-most row in the entire palette
                        const maxRow = Math.max(...allBoxes.map(box => box.row));
                        candidates = allBoxes.filter(box => box.row === maxRow);
                    }
                }
                break;
                
                case 'down':
                // Find brushes below the current one
                candidates = allBoxes.filter(box => 
                    // Either in the row below in the same section
                    (box.section === currentBox.section && box.row === currentBox.row + 1) ||
                    // Or in the top row of the tilemap if we're in the bottom row of custom brushes
                    (currentBox.section === 'custom' && 
                     currentBox.row === Math.max(...customBoxes.map(b => b.row || 0)) && 
                     box.section === 'tilemap' && box.row === 0) ||
                    // Or in the top row of custom brushes if we're in the bottom row of tilemap
                    (currentBox.section === 'tilemap' && 
                     currentBox.row === Math.max(...tilemapBoxes.map(b => b.row)) && 
                     hasCustomBrushes && box.section === 'custom' && box.row === 0)
                );
                
                // If no candidates found, wrap around to the top
                if (candidates.length === 0) {
                    // If we're in the tilemap section and there are no custom brushes,
                    // wrap to the top of the tilemap
                    if (currentBox.section === 'tilemap' && !hasCustomBrushes) {
                        candidates = tilemapBoxes.filter(box => box.row === 0);
                    } else {
                        // Otherwise, find the top-most row in the entire palette
                        candidates = allBoxes.filter(box => box.row === 0);
                    }
                }
                break;
                
                case 'left':
                // Find brushes to the left of the current one
                candidates = allBoxes.filter(box => 
                    // In the same row and to the left
                    (box.section === currentBox.section && box.row === currentBox.row && box.col < currentBox.col)
                );
                
                // If no candidates found, wrap to the end of the previous row
                // or to the end of the last row if we're at the first position
                if (candidates.length === 0) {
                    if (currentBox.row > 0 || currentBox.section === 'custom') {
                        // Find the previous row
                        let targetRow: number;
                        let targetSection: 'tilemap' | 'custom';
                        
                        if (currentBox.row > 0) {
                            // Previous row in the same section
                            targetRow = currentBox.row - 1;
                            targetSection = currentBox.section;
                        } else if (currentBox.section === 'custom') {
                            // Last row of tilemap
                            targetRow = Math.max(...tilemapBoxes.map(b => b.row));
                            targetSection = 'tilemap';
                        } else {
                            // Should not happen, but just in case
                            targetRow = 0;
                            targetSection = 'tilemap';
                        }
                        
                        // Find the rightmost brush in the target row
                        const rowBoxes = allBoxes.filter(box => 
                            box.section === targetSection && box.row === targetRow
                        );
                        
                        if (rowBoxes.length > 0) {
                            const maxCol = Math.max(...rowBoxes.map(box => box.col));
                            candidates = rowBoxes.filter(box => box.col === maxCol);
                        }
                        } else {
                        // We're at the first position of the first row of tilemap
                        // If there are custom brushes, wrap to the last position of the last row of custom brushes
                        // Otherwise, wrap to the last position of the last row of tilemap
                        if (hasCustomBrushes) {
                            const maxRow = Math.max(...customBoxes.map(box => box.row || 0));
                            const lastRowBoxes = customBoxes.filter(box => box.row === maxRow);
                            if (lastRowBoxes.length > 0) {
                                const maxCol = Math.max(...lastRowBoxes.map(box => box.col));
                                candidates = lastRowBoxes.filter(box => box.col === maxCol);
                            }
                        } else {
                            const maxRow = Math.max(...tilemapBoxes.map(box => box.row));
                            const lastRowBoxes = tilemapBoxes.filter(box => box.row === maxRow);
                            const maxCol = Math.max(...lastRowBoxes.map(box => box.col));
                            candidates = lastRowBoxes.filter(box => box.col === maxCol);
                        }
                    }
                }
                break;
                
            case 'right':
                // Find brushes to the right of the current one
                candidates = allBoxes.filter(box => 
                    // In the same row and to the right
                    (box.section === currentBox.section && box.row === currentBox.row && box.col > currentBox.col)
                );
                
                // If no candidates found, wrap to the start of the next row
                // or to the start of the first row if we're at the last position
                if (candidates.length === 0) {
                    // Special case: if we're on a custom brush,
                    // check if it's the last custom brush in its row
                    if (currentBox.section === 'custom') {
                        const sameRowBrushes = customBoxes.filter(b => b.row === currentBox.row);
                        const isLastInRow = currentBox.col === Math.max(...sameRowBrushes.map(b => b.col));
                        
                        // If it's the last custom brush in its row, check if it's also the last row
                        if (isLastInRow) {
                            const isLastRow = currentBox.row === Math.max(...customBoxes.map(b => b.row || 0));
                            
                            // If it's the last custom brush in the last row, wrap to the first tile
                            if (isLastRow) {
                                candidates = tilemapBoxes.filter(box => box.row === 0 && box.col === 0);
                                break;
                            }
                        }
                    }
                    
                    // Check if we're at the last position of the custom brushes section
                    const isLastPositionInCustom = 
                        currentBox.section === 'custom' && 
                        (currentBox.row === Math.max(...customBoxes.map(b => b.row || 0)) &&
                         currentBox.col === Math.max(...customBoxes.filter(b => 
                             b.row === currentBox.row
                         ).map(b => b.col || 0)));
                        
                    const isLastPositionInTilemap = 
                        currentBox.section === 'tilemap' && 
                        currentBox.row === Math.max(...tilemapBoxes.map(b => b.row)) &&
                        currentBox.col === Math.max(...allBoxes.filter(b => 
                            b.section === 'tilemap' && b.row === currentBox.row
                        ).map(b => b.col));
                        
                    // If we're at the last position in custom brushes, wrap to the first position of tilemap
                    if (isLastPositionInCustom) {
                        candidates = tilemapBoxes.filter(box => 
                            box.row === 0 && box.col === 0
                        );
                    } 
                    // If we're at the last position in tilemap and there are no custom brushes,
                    // wrap to the first position of tilemap
                    else if (isLastPositionInTilemap && !hasCustomBrushes) {
                        candidates = tilemapBoxes.filter(box => 
                            box.row === 0 && box.col === 0
                        );
                    }
                    // Otherwise, find the next row or section
                    else {
                        // Check if we're at the end of a row but not the last row
                        const isEndOfRow = currentBox.col === Math.max(...allBoxes.filter(b => 
                            b.section === currentBox.section && b.row === currentBox.row
                        ).map(b => b.col));
                        
                        if (isEndOfRow) {
                            let targetRow: number;
                            let targetSection: 'tilemap' | 'custom';
                            
                            if (currentBox.section === 'tilemap' && 
                                currentBox.row === Math.max(...tilemapBoxes.map(b => b.row))) {
                                // Last row of tilemap, move to first row of custom if there are custom brushes
                                if (hasCustomBrushes) {
                                    targetRow = 0;
                                    targetSection = 'custom';
                                } else {
                                    // If no custom brushes, wrap to the first row of tilemap
                                    targetRow = 0;
                                    targetSection = 'tilemap';
                                }
                            } else {
                                // Move to next row in same section
                                targetRow = currentBox.row + 1;
                                targetSection = currentBox.section;
                            }
                            
                            // Find the leftmost brush in the target row
                            candidates = allBoxes.filter(box => 
                                box.section === targetSection && box.row === targetRow && box.col === 0
                            );
                        }
                    }
                }
                break;
        }
        
        // If we have candidates, find the closest one based on the center position
        if (candidates.length > 0) {
            let closestBrush = candidates[0];
            let minDistance = Infinity;
            
            for (const box of candidates) {
                let distance: number;
                
                // Calculate distance based on direction
                if (direction === 'up' || direction === 'down') {
                    // For vertical movement, prioritize horizontal alignment
                    distance = Math.abs(box.centerX - currentBox.centerX);
                } else {
                    // For horizontal movement, prioritize the closest in the direction
                    distance = direction === 'left' 
                        ? currentBox.centerX - box.centerX  // Distance to the left
                        : box.centerX - currentBox.centerX; // Distance to the right
                }
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestBrush = box;
                }
            }
            
            return closestBrush.id;
        }
        
        return null;
    }

    // Replace the old navigation method with our new unified approach
    getBrushGridNavigationTarget(currentBrushId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null {
        return this.findNearestBrush(currentBrushId, direction);
    }

    // Add back the navigateBrushGrid method
    navigateBrushGrid(currentBrushId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null {
        const target = this.getBrushGridNavigationTarget(currentBrushId, direction);
        if (target) {
            editorFSM.send('selectBrush', target);
            // Redraw the palette to update the selection highlight
            this.drawPalette();
        }
        return target;
    }

    // Add a method to update the canvas size based on palette content
    private updateCanvasSize(): void {
        if (!this.tilemap.isLoaded() || !editorFSM.context.paletteCanvas) return;
        
        const paletteArea = this.getPaletteArea();
        const newWidth = paletteArea.width + this.paletteX * 2;
        const newHeight = paletteArea.height + this.paletteY * 2;
        
        // Only resize if dimensions have changed
        if (editorFSM.context.paletteCanvas.width !== newWidth || 
            editorFSM.context.paletteCanvas.height !== newHeight) {
            
            console.log('PaletteManager: Resizing palette canvas to', newWidth, 'x', newHeight);
            
            // Update both the canvas dimensions and CSS dimensions
            editorFSM.context.paletteCanvas.width = newWidth;
            editorFSM.context.paletteCanvas.height = newHeight;
            editorFSM.context.paletteCanvas.style.width = newWidth + 'px';
            editorFSM.context.paletteCanvas.style.height = newHeight + 'px';
            
            // Ensure the background color is maintained after resize
            editorFSM.context.paletteCanvas.style.backgroundColor = '#2a2a2a';
            editorFSM.context.paletteCanvas.style.border = '1px solid #444';
            editorFSM.context.paletteCanvas.style.borderRadius = '4px';
        }
    }

    // Check if a point is within the palette canvas but outside the actual palette area
    private isWithinCanvas(x: number, y: number): boolean {
        if (!editorFSM.context.paletteCanvas) return false;
        
        return x >= 0 && x < editorFSM.context.paletteCanvas.width && 
               y >= 0 && y < editorFSM.context.paletteCanvas.height;
    }
    
    // Forward an event to the main canvas
    private forwardEventToMainCanvas(originalEvent: MouseEvent): void {
        if (!editorFSM.context.canvas) return;
        
        // Get the original coordinates relative to the page
        const globalX = originalEvent.pageX;
        const globalY = originalEvent.pageY;
        
        // Create a new event with the same properties
        const newEvent = new MouseEvent(originalEvent.type, {
            bubbles: true,
            cancelable: true,
            view: window,
            detail: originalEvent.detail,
            screenX: originalEvent.screenX,
            screenY: originalEvent.screenY,
            clientX: originalEvent.clientX,
            clientY: originalEvent.clientY,
            ctrlKey: originalEvent.ctrlKey,
            altKey: originalEvent.altKey,
            shiftKey: originalEvent.shiftKey,
            metaKey: originalEvent.metaKey,
            button: originalEvent.button,
            buttons: originalEvent.buttons,
            relatedTarget: originalEvent.relatedTarget
        });
        
        // Dispatch the event on the main canvas
        editorFSM.context.canvas.dispatchEvent(newEvent);
    }

    // Add a cleanup method to remove event listeners
    cleanup() {
        // Remove event listeners
        this.canvas.removeEventListener('mousedown', this.boundHandlePaletteMouseDown);
        window.removeEventListener('mousemove', this.boundHandlePaletteMouseMove);
        window.removeEventListener('mouseup', this.boundHandlePaletteMouseUp);
        
        // Remove the canvas from the DOM if it's still there
        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
    }
} 