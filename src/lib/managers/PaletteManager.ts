import type { BrushManager } from './BrushManager';
import type { Brush } from '../utils/drawing';
import type { Tilemap } from '../utils/tilemap';
import { editorFSM } from '../state/EditorStore.svelte';

export class PaletteManager {
    private paletteX = 10;
    private paletteY = 10;
    private hasShownHelpMessage = false;
    private readonly ADD_BRUSH_ID = 'add_brush';

    private boundHandlePaletteMouseDown: (e: MouseEvent) => void;
    private boundHandlePaletteMouseMove: (e: MouseEvent) => void;
    private boundHandlePaletteMouseUp: (e: MouseEvent) => void;

    constructor(
        private tilemap: Tilemap,
        private brushManager: BrushManager
    ) {
        this.boundHandlePaletteMouseDown = this.handlePaletteMouseDown.bind(this);
        this.boundHandlePaletteMouseMove = this.handlePaletteMouseMove.bind(this);
        this.boundHandlePaletteMouseUp = this.handlePaletteMouseUp.bind(this);
    }

    createCanvas(width: number, height: number) {
        // Calculate the actual size needed for the palette
        const paletteArea = this.getPaletteArea();
        
        // Set size based on the actual palette content
        const canvasWidth = paletteArea.width + this.paletteX * 2;  // Add padding
        const canvasHeight = paletteArea.height + this.paletteY * 2; // Add padding
        
        // Position the canvas to only cover the palette area
        editorFSM.context.paletteCanvas!.style.position = 'absolute';
        editorFSM.context.paletteCanvas!.style.left = '0px';
        editorFSM.context.paletteCanvas!.style.top = '0px';
        editorFSM.context.paletteCanvas!.style.width = canvasWidth + 'px';
        editorFSM.context.paletteCanvas!.style.height = canvasHeight + 'px';
        editorFSM.context.paletteCanvas!.style.zIndex = '20';
        editorFSM.context.paletteCanvas!.style.backgroundColor = '#2a2a2a'; // Dark background
        editorFSM.context.paletteCanvas!.style.border = '1px solid #444'; // Subtle border
        editorFSM.context.paletteCanvas!.style.borderRadius = '4px'; // Rounded corners
        
        // Set the actual canvas dimensions
        editorFSM.context.paletteCanvas!.width = canvasWidth;
        editorFSM.context.paletteCanvas!.height = canvasHeight;
        
        // Get the context for drawing the palette
        editorFSM.context.paletteCtx = editorFSM.context.paletteCanvas!.getContext('2d', { alpha: true })!; // Use alpha context for transparency
        editorFSM.context.paletteCtx.imageSmoothingEnabled = false;
        
        // Add it to the DOM as a sibling to the main canvas
        if (editorFSM.context.canvas!.parentElement) {
            editorFSM.context.canvas!.parentElement.appendChild(editorFSM.context.paletteCanvas!);
        }

        // Add event listeners for palette interaction
        editorFSM.context.paletteCanvas!.addEventListener('mousedown', this.boundHandlePaletteMouseDown);
        editorFSM.context.paletteCanvas!.addEventListener('mousemove', this.boundHandlePaletteMouseMove);
        editorFSM.context.paletteCanvas!.addEventListener('mouseup', this.boundHandlePaletteMouseUp);
        
        // Also prevent context menu on the palette canvas, but only within the palette area
        editorFSM.context.paletteCanvas!.addEventListener('contextmenu', (e) => {
            const rect = editorFSM.context.paletteCanvas!.getBoundingClientRect();
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


    // Handle mouse events on the palette canvas
    private handlePaletteMouseDown(e: MouseEvent) {
        const rect = editorFSM.context.paletteCanvas!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        console.log('PaletteManager: Palette mouse down at', x, y);
        
        // Check if the click is within the palette area
        if (!this.isWithinPalette(x, y)) {
            console.log('PaletteManager: Click outside palette area');
            
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
                editorFSM.context.selectionStartX = tilePos.tileX;
                editorFSM.context.selectionStartY = tilePos.tileY;
                editorFSM.context.selectionEndX = tilePos.tileX;
                editorFSM.context.selectionEndY = tilePos.tileY;
                
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
        const rect = editorFSM.context.paletteCanvas!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if the mouse is within the palette area
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
        
        if (editorFSM.context.isSelectingTiles && editorFSM.context.selectionStartX !== null && editorFSM.context.selectionStartY !== null) {
            const tilePos = this.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                editorFSM.context.selectionEndX = tilePos.tileX;
                editorFSM.context.selectionEndY = tilePos.tileY;
                
                // Only enter selection mode if we're selecting more than one tile
                const width = Math.abs((editorFSM.context.selectionEndX || 0) - editorFSM.context.selectionStartX) + 1;
                const height = Math.abs((editorFSM.context.selectionEndY || 0) - editorFSM.context.selectionStartY) + 1;
                if (width > 1 || height > 1) {
                    editorFSM.context.isSelectingTiles = true;
                    // Clear the single tile selection when entering drag mode
                    this.brushManager?.selectBrush(null);
                } else {
                    editorFSM.context.isSelectingTiles = false;
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
                    editorFSM.send('selectTile', tileIndex);
                }
                
                // Force a redraw of the palette
                this.drawPalette();
            }
        }
    }


    // Custom brush methods
    private createTemporaryBrushFromSelection() {
        if (!this.brushManager) return;
        console.log('Creating brush from selection');
        if (editorFSM.context.selectionStartX === null || editorFSM.context.selectionStartY === null || 
            editorFSM.context.selectionEndX === null || editorFSM.context.selectionEndY === null) {
            console.log('Selection coordinates are invalid:', {
                startX: editorFSM.context.selectionStartX,
                startY: editorFSM.context.selectionStartY,
                endX: editorFSM.context.selectionEndX,
                endY: editorFSM.context.selectionEndY
            });
            return;
        }

        const startX = Math.min(editorFSM.context.selectionStartX, editorFSM.context.selectionEndX);
        const startY = Math.min(editorFSM.context.selectionStartY, editorFSM.context.selectionEndY);
        const endX = Math.max(editorFSM.context.selectionStartX, editorFSM.context.selectionEndX);
        const endY = Math.max(editorFSM.context.selectionStartY, editorFSM.context.selectionEndY);

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
        editorFSM.send('selectCustomBrush', brush.id);
        
        console.log('Selected brush:', this.brushManager.getSelectedBrush());

        // Reset selection state
        editorFSM.context.isSelectingTiles = false;
        editorFSM.context.selectionStartX = null;
        editorFSM.context.selectionStartY = null;
        editorFSM.context.selectionEndX = null;
        editorFSM.context.selectionEndY = null;
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

    private handlePaletteMouseUp(e: MouseEvent) {
        const rect = editorFSM.context.paletteCanvas!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Check if the mouse is within the palette area
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
        
        // If we've been selecting tiles, create a custom brush
        if (editorFSM.context.isSelectingTiles && 
            editorFSM.context.selectionStartX !== null && editorFSM.context.selectionStartY !== null &&
            editorFSM.context.selectionEndX !== null && editorFSM.context.selectionEndY !== null) {
            
            // Create a custom brush from the selection
            this.createTemporaryBrushFromSelection();
            
            // Reset selection state
            editorFSM.context.isSelectingTiles = false;
            editorFSM.context.selectionStartX = null;
            editorFSM.context.selectionStartY = null;
            editorFSM.context.selectionEndX = null;
            editorFSM.context.selectionEndY = null;
            
            // Force a redraw of the palette
            this.drawPalette();
        }
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
                editorFSM.context.selectionStartX = tilePos.tileX;
                editorFSM.context.selectionStartY = tilePos.tileY;
                editorFSM.context.selectionEndX = tilePos.tileX;
                editorFSM.context.selectionEndY = tilePos.tileY;
                // Also select the single tile initially
                const tileIndex = tilePos.tileY * this.tilemap.width + tilePos.tileX;
                const brushId = `tile_${tileIndex}`;
                this.brushManager.selectBrush(brushId);
                editorFSM.send('selectTile', tileIndex);
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
            editorFSM.send('setShowCustomBrushDialog', true);
            return;
        }

        // Check each custom brush
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.brushManager.getCustomBrushes();
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
                this.brushManager.selectBrush(brush.id);
                editorFSM.send('selectCustomBrush', brush.id);
                return;
            }

            currentX += width + brushSpacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }
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

        const customBrushes = this.brushManager.getCustomBrushes();
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
                editorFSM.send('setShowCustomBrushDialog', true);
                editorFSM.send('setCustomBrushDialogId', brush.id);
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
        const customBrushes = this.brushManager.getCustomBrushes();
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
        
        const ctx = editorFSM.context.paletteCtx!;
        
        // Clear the canvas first with the background color
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, editorFSM.context.paletteCanvas!.width, editorFSM.context.paletteCanvas!.height);
        
        // Draw a subtle grid pattern in the background
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.5;
        const gridSize = 10;
        
        for (let x = 0; x < editorFSM.context.paletteCanvas!.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, editorFSM.context.paletteCanvas!.height);
            ctx.stroke();
        }
        
        for (let y = 0; y < editorFSM.context.paletteCanvas!.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(editorFSM.context.paletteCanvas!.width, y);
            ctx.stroke();
        }
        
        // Draw built-in brushes (tiles)
        const builtInBrushes = this.brushManager.getBuiltInBrushes();
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

        // Draw help message if not shown before
        this.drawHelpMessage();

        // Draw selection highlight
        this.drawSelectionHighlight();

        // Draw selection rectangle if selecting tiles
        if (editorFSM.context.isSelectingTiles) {
            this.drawSelectionRectangle(
                ctx,
                editorFSM.context.selectionStartX,
                editorFSM.context.selectionStartY,
                editorFSM.context.selectionEndX,
                editorFSM.context.selectionEndY
            );
        }

        // Draw custom brushes section
        this.drawCustomBrushes();
    }

    private drawHelpMessage(): void {
        if (this.hasShownHelpMessage) return;
        const ctx = editorFSM.context.paletteCtx!;

        const tilesPerRow = this.tilemap.width;
        const tilemapWidth = tilesPerRow * (this.tilemap.tileWidth + this.tilemap.spacing);
        const messageX = this.paletteX + tilemapWidth + 20;
        const messageY = this.paletteY + 20;

        ctx.font = '11px MS Sans Serif';
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.imageSmoothingEnabled = false;
        
        // Draw with a dark outline for better visibility
        const messages = [
            'Palette usage:',
            '- WASD to navigate tiles.',
            '- Click to select a tile.',
            '- Drag to create a custom brush (esc to cancel).'
        ];

        messages.forEach((msg, i) => {
            // Draw dilated text by drawing at slight offsets
            ctx.fillStyle = '#000000';
            [-1, 0, 1].forEach(dx => {
                [-1, 0, 1].forEach(dy => {
                    ctx.fillText(msg, messageX + dx, messageY + i * 20 + dy);
                });
            });
            
            // Draw main text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(msg, messageX, messageY + i * 20);
        });
    }

    private drawSelectionHighlight(): void {
        const selectedBrush = this.brushManager.getSelectedBrush();
        if (!selectedBrush) return;
        const ctx = editorFSM.context.paletteCtx!;

        let highlightX: number;
        let highlightY: number;
        let highlightWidth: number;
        let highlightHeight: number;

        if (selectedBrush.isBuiltIn) {
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
                highlightWidth = selectedBrush.preview!.width;
                highlightHeight = selectedBrush.preview!.height;
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
        const ctx = editorFSM.context.paletteCtx!;
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + this.tilemap.spacing;
        
        let currentX = this.paletteX;
        let currentY = brushSectionY;
        let maxHeightInRow = 0;

        const customBrushes = this.brushManager.getCustomBrushes();
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

            const customBrushes = this.brushManager.getCustomBrushes();
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

        const customBrushes = this.brushManager.getCustomBrushes();
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

    private drawSelectionRectangle(ctx: CanvasRenderingContext2D, startX: number | null, startY: number | null, endX: number | null, endY: number | null): void {
        if (startX === null || startY === null || endX === null || endY === null) return;

        // Calculate pixel coordinates
        const x1 = this.paletteX + Math.min(startX, endX) * (this.tilemap.tileWidth + this.tilemap.spacing);
        const y1 = this.paletteY + Math.min(startY, endY) * (this.tilemap.tileHeight + this.tilemap.spacing);
        const x2 = this.paletteX + (Math.max(startX, endX) + 1) * (this.tilemap.tileWidth + this.tilemap.spacing) - this.tilemap.spacing;
        const y2 = this.paletteY + (Math.max(startY, endY) + 1) * (this.tilemap.tileHeight + this.tilemap.spacing) - this.tilemap.spacing;

        // Draw semi-transparent fill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        // Draw black border first
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(x1 - 2, y1 - 2, x2 - x1 + 4, y2 - y1 + 4);

        // Draw yellow highlight on top
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x1 - 2, y1 - 2, x2 - x1 + 4, y2 - y1 + 4);
    }

    // Helper method to find the nearest brush in the custom brushes section
    findNearestCustomBrush(x: number): string | null {
        const customBrushes = this.brushManager.getCustomBrushes();
        if (customBrushes.length === 0) return null;

        let nearestBrush = null;
        let minDistance = Infinity;

        // Get position of each brush and find the nearest one in the first row
        for (const brush of customBrushes) {
            const pos = this.getBrushRowAndColumn(brush.id);
            if (!pos || pos.row !== 0) continue;  // Only consider first row

            const centerPos = this.getBrushCenterPosition(brush.id);
            if (!centerPos) continue;

            const distance = Math.abs(centerPos.x - x);
            if (distance < minDistance) {
                minDistance = distance;
                nearestBrush = brush;
            }
        }

        // If no brush found in first row, just return the first brush
        return nearestBrush?.id || customBrushes[0]?.id || null;
    }

    // Helper method to find the nearest tile in the tilemap section
    findNearestTile(x: number, direction: 'up' | 'down' = 'up'): string | null {
        const tileX = Math.min(
            Math.max(0, Math.floor((x - this.paletteX) / (this.tilemap.tileWidth + this.tilemap.spacing))),
            this.tilemap.width - 1
        );
        
        // For 'up' direction, use the bottom row of the tilemap
        // For 'down' direction, use the top row
        const row = direction === 'up' ? 
            Math.floor((this.brushManager.getBuiltInBrushes().length - 1) / this.tilemap.width) : 
            0;
            
        const tileIndex = row * this.tilemap.width + tileX;
        return `tile_${tileIndex}`;
    }

    // Helper method to get the X coordinate of a brush
    getBrushCenterX(brushId: string): number {
        const brush = this.brushManager.getBrush(brushId);
        if (!brush) return this.paletteX;

        if (brush.isBuiltIn) {
            const index = parseInt(brush.id.replace('tile_', ''));
            return this.paletteX + (index % this.tilemap.width) * (this.tilemap.tileWidth + this.tilemap.spacing) + 
                   this.tilemap.tileWidth / 2;
        }

        const pos = this.getBrushPosition(brush);
        if (!pos) return this.paletteX;

        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const scale = Math.min(1, maxBrushWidth / brush.preview!.width);
        return pos.x + (brush.preview!.width * scale) / 2;
    }

    // Add this method to help with navigation
    getBrushRowAndColumn(brushId: string): { row: number, col: number } | null {
        const brush = this.brushManager.getBrush(brushId);
        if (!brush) return null;

        if (brush.isBuiltIn) {
            const index = parseInt(brush.id.replace('tile_', ''));
            return {
                row: Math.floor(index / this.tilemap.width),
                col: index % this.tilemap.width
            };
        }

        // Calculate position in custom brush grid
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing);
        const brushSpacing = this.tilemap.spacing;
        let currentX = this.paletteX + this.tilemap.tileWidth + brushSpacing;
        let currentY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + brushSpacing;
        let currentRow = 0;
        let currentCol = 0;

        const customBrushes = this.brushManager.getCustomBrushes();
        for (const b of customBrushes) {
            const gridWidth = Math.ceil(b.preview!.width / this.tilemap.tileWidth) * this.tilemap.tileWidth;
            const scale = Math.min(1, gridWidth / b.preview!.width);
            const width = b.preview!.width * scale;

            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += this.tilemap.tileHeight + brushSpacing;
                currentRow++;
                currentCol = 0;
            }

            if (b.id === brushId) {
                return { row: currentRow, col: currentCol };
            }

            currentX += Math.ceil(width / (this.tilemap.tileWidth + this.tilemap.spacing)) * 
                (this.tilemap.tileWidth + this.tilemap.spacing);
            currentCol++;
        }

        return null;
    }

    getBrushCenterPosition(brushId: string): { x: number, y: number } | null {
        const brush = this.brushManager.getBrush(brushId);
        if (!brush) return null;

        const pos = this.getBrushPosition(brush);
        if (!pos) return null;

        const { width, height } = this.getBrushDimensions(brush);
        return {
            x: pos.x + width / 2,
            y: pos.y + height / 2
        };
    }

    findNearestBrushInRow(x: number, row: number): string | null {
        let nearestBrush = null;
        let minDistance = Infinity;

        const customBrushes = this.brushManager.getCustomBrushes();
        for (const brush of customBrushes) {
            const pos = this.getBrushRowAndColumn(brush.id);
            if (!pos || pos.row !== row) continue;

            const centerPos = this.getBrushCenterPosition(brush.id);
            if (!centerPos) continue;

            const distance = Math.abs(centerPos.x - x);
            if (distance < minDistance) {
                minDistance = distance;
                nearestBrush = brush;
            }
        }

        return nearestBrush?.id || null;
    }

    getBrushCenterY(brushId: string): number {
        const brush = this.brushManager.getBrush(brushId);
        if (!brush) return this.paletteY;

        const pos = this.getBrushPosition(brush);
        if (!pos) return this.paletteY;

        const { height } = this.getBrushDimensions(brush);
        return pos.y + height / 2;
    }

    // New method for WASD navigation
    navigateBrushGrid(currentBrushId: string, direction: 'up' | 'down' | 'left' | 'right'): string | null {
        const currentBrush = this.brushManager.getBrush(currentBrushId);
        if (!currentBrush) return null;

        // Get the center X position of the current brush for horizontal alignment
        const centerX = this.getBrushCenterX(currentBrushId);
        
        // Handle built-in tiles (regular tilemap tiles)
        if (currentBrush.isBuiltIn) {
            const tileId = parseInt(currentBrush.id.replace('tile_', ''));
            const tilesPerRow = this.tilemap.width;
            const totalTiles = this.brushManager.getBuiltInBrushes().length;
            const tilesPerColumn = Math.ceil(totalTiles / tilesPerRow);
            const currentRow = Math.floor(tileId / tilesPerRow);
            const currentCol = tileId % tilesPerRow;
            
            console.log('PaletteManager: Navigating from built-in tile', {
                tileId,
                currentRow,
                currentCol,
                tilesPerRow,
                tilesPerColumn,
                direction
            });
            
            switch (direction) {
                case 'up':
                    if (currentRow > 0) {
                        // Move up one row within tilemap
                        return `tile_${tileId - tilesPerRow}`;
                    } else {
                        // We're at the top row, try to move to custom brushes
                        return this.findNearestCustomBrush(centerX);
                    }
                
                case 'down':
                    if (currentRow < tilesPerColumn - 1 && tileId + tilesPerRow < totalTiles) {
                        // Move down one row within tilemap
                        return `tile_${tileId + tilesPerRow}`;
                    } else {
                        // We're at the bottom row, try to move to custom brushes
                        return this.findNearestCustomBrush(centerX);
                    }
                
                case 'left':
                    if (currentCol > 0) {
                        // Move left one column
                        return `tile_${tileId - 1}`;
                    } else {
                        // Wrap to end of previous row
                        const prevRow = (currentRow + tilesPerColumn - 1) % tilesPerColumn;
                        const lastColInPrevRow = Math.min(tilesPerRow - 1, Math.floor((totalTiles - 1 - prevRow * tilesPerRow) % tilesPerRow));
                        const newTileId = prevRow * tilesPerRow + lastColInPrevRow;
                        
                        // Ensure we don't exceed the total number of tiles
                        if (newTileId < totalTiles) {
                            return `tile_${newTileId}`;
                        } else {
                            return `tile_${totalTiles - 1}`;
                        }
                    }
                
                case 'right':
                    if (currentCol < tilesPerRow - 1 && tileId + 1 < totalTiles) {
                        // Move right one column
                        return `tile_${tileId + 1}`;
                    } else {
                        // Wrap to start of next row
                        const nextRow = (currentRow + 1) % tilesPerColumn;
                        const newTileId = nextRow * tilesPerRow;
                        
                        // Ensure we don't exceed the total number of tiles
                        if (newTileId < totalTiles) {
                            return `tile_${newTileId}`;
                        } else {
                            return `tile_0`; // Wrap to first tile
                        }
                    }
            }
        } 
        // Handle custom brushes
        else {
            const pos = this.getBrushRowAndColumn(currentBrushId);
            if (!pos) return null;
            
            console.log('PaletteManager: Navigating from custom brush', {
                brushId: currentBrush.id,
                row: pos.row,
                col: pos.col,
                direction
            });
            
            switch (direction) {
                case 'up':
                    if (pos.row > 0) {
                        // Try to find a brush in the previous row at a similar column
                        const brushId = this.findNearestBrushInRow(centerX, pos.row - 1);
                        if (brushId) return brushId;
                    }
                    // If no brush found or we're at the top row, move to tilemap
                    return this.findNearestTile(centerX, 'down');
                
                case 'down':
                    // Try to find a brush in the next row at a similar column
                    const brushId = this.findNearestBrushInRow(centerX, pos.row + 1);
                    if (brushId) return brushId;
                    
                    // If no brush found in next row, wrap to tilemap
                    return this.findNearestTile(centerX, 'up');
                
                case 'left':
                    // Find all brushes in the same row
                    const brushesInRow = this.brushManager.getCustomBrushes().filter(brush => {
                        const brushPos = this.getBrushRowAndColumn(brush.id);
                        return brushPos && brushPos.row === pos.row && brushPos.col < pos.col;
                    });
                    
                    if (brushesInRow.length > 0) {
                        // Get the brush with the highest column index that's less than current
                        let closestBrushCol = -1;
                        let closestBrushId = null;
                        
                        for (const brush of brushesInRow) {
                            const brushPos = this.getBrushRowAndColumn(brush.id);
                            if (brushPos && brushPos.col > closestBrushCol) {
                                closestBrushCol = brushPos.col;
                                closestBrushId = brush.id;
                            }
                        }
                        
                        if (closestBrushId) {
                            return closestBrushId;
                        }
                    }
                    
                    // If no brush found to the left, wrap to the rightmost brush in the previous row
                    // or to the tilemap if we're at the first row
                    if (pos.row > 0) {
                        const prevRowBrushes = this.brushManager.getCustomBrushes().filter(brush => {
                            const brushPos = this.getBrushRowAndColumn(brush.id);
                            return brushPos && brushPos.row === pos.row - 1;
                        });
                        
                        if (prevRowBrushes.length > 0) {
                            let rightmostBrush = prevRowBrushes[0];
                            let rightmostCol = -1;
                            
                            for (const brush of prevRowBrushes) {
                                const brushPos = this.getBrushRowAndColumn(brush.id);
                                if (brushPos && brushPos.col > rightmostCol) {
                                    rightmostCol = brushPos.col;
                                    rightmostBrush = brush;
                                }
                            }
                            
                            return rightmostBrush.id;
                        }
                    }
                    
                    // If all else fails, go to the tilemap
                    return this.findNearestTile(centerX, 'down');
                
                case 'right':
                    // Find all brushes in the same row
                    const brushesInRowRight = this.brushManager.getCustomBrushes().filter(brush => {
                        const brushPos = this.getBrushRowAndColumn(brush.id);
                        return brushPos && brushPos.row === pos.row && brushPos.col > pos.col;
                    });
                    
                    if (brushesInRowRight.length > 0) {
                        // Get the brush with the lowest column index that's greater than current
                        let closestBrushCol = Infinity;
                        let closestBrushId = null;
                        
                        for (const brush of brushesInRowRight) {
                            const brushPos = this.getBrushRowAndColumn(brush.id);
                            if (brushPos && brushPos.col < closestBrushCol) {
                                closestBrushCol = brushPos.col;
                                closestBrushId = brush.id;
                            }
                        }
                        
                        if (closestBrushId) {
                            return closestBrushId;
                        }
                    }
                    
                    // If no brush found to the right, wrap to the leftmost brush in the next row
                    // or to the tilemap if we're at the last row
                    const nextRowBrushes = this.brushManager.getCustomBrushes().filter(brush => {
                        const brushPos = this.getBrushRowAndColumn(brush.id);
                        return brushPos && brushPos.row === pos.row + 1;
                    });
                    
                    if (nextRowBrushes.length > 0) {
                        let leftmostBrush = nextRowBrushes[0];
                        let leftmostCol = Infinity;
                        
                        for (const brush of nextRowBrushes) {
                            const brushPos = this.getBrushRowAndColumn(brush.id);
                            if (brushPos && brushPos.col < leftmostCol) {
                                leftmostCol = brushPos.col;
                                leftmostBrush = brush;
                            }
                        }
                        
                        return leftmostBrush.id;
                    }
                    
                    // If all else fails, go to the tilemap
                    return this.findNearestTile(centerX, 'up');
            }
        }
        
        return null;
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
} 