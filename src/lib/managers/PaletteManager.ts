import type { Tilemap } from '../tilemap';
import type { BrushManager } from './BrushManager';
import type { Brush } from '../types/brush';
import { editorStore } from '../state/EditorStore.svelte';

export class PaletteManager {
    private paletteX = 10;
    private paletteY = 10;
    private hasShownHelpMessage = false;

    constructor(
        private tilemap: Tilemap,
        private brushManager: BrushManager
    ) {}

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
        
        // Check if within custom brushes section
        return y <= this.getPaletteHeight() && x >= this.paletteX && 
               x <= this.paletteX + this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing);
    }

    handlePaletteClick(x: number, y: number): void {
        if (!this.tilemap.isLoaded()) return;

        const tilemapHeight = Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 10;
        
        // Handle click in tilemap section
        if (y < tilemapHeight) {
            const tilePos = this.getTileFromPaletteCoords(x, y);
            if (tilePos) {
                // Select the built-in brush
                const tileIndex = tilePos.tileY * this.tilemap.width + tilePos.tileX;
                const brushId = `tile_${tileIndex}`;
                this.brushManager.selectBrush(brushId);
            }
            return;
        }

        // Handle click in custom brushes section
        const brushSectionY = tilemapHeight + 20; // Add spacing for separator

        // Check if clicked on "Add Brush" button
        if (y >= brushSectionY && y <= brushSectionY + 32 && x >= this.paletteX && x <= this.paletteX + 32) {
            editorStore.setShowCustomBrushDialog(true);
            return;
        }

        // Check each custom brush
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        const addBrushSize = 32;
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.brushManager.getCustomBrushes();
        for (const brush of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / brush.preview.width);
            const width = brush.preview.width * scale;
            const height = brush.preview.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            if (y >= currentY && y <= currentY + height && 
                x >= currentX && x <= currentX + width) {
                this.brushManager.selectBrush(brush.id);
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
            const scale = Math.min(1, maxBrushWidth / brush.preview.width);
            const width = brush.preview.width * scale;
            const height = brush.preview.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            if (y >= currentY && y <= currentY + height && 
                x >= currentX && x <= currentX + width) {
                editorStore.setShowCustomBrushDialog(true);
                editorStore.setCustomBrushDialogId(brush.id);
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
            const scale = Math.min(1, maxBrushWidth / brush.preview.width);
            const width = brush.preview.width * scale;
            const height = brush.preview.height * scale;

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

    drawPalette(ctx: CanvasRenderingContext2D): void {
        if (!this.tilemap.isLoaded()) return;

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
        this.drawHelpMessage(ctx);

        // Draw selection highlight
        this.drawSelectionHighlight(ctx);

        // Draw selection rectangle if selecting tiles
        if (editorStore.editor?.isSelectingTiles) {
            this.drawSelectionRectangle(
                ctx,
                editorStore.editor.selectionStartX,
                editorStore.editor.selectionStartY,
                editorStore.editor.selectionEndX,
                editorStore.editor.selectionEndY
            );
        }

        // Draw custom brushes section
        this.drawCustomBrushes(ctx);
    }

    private drawHelpMessage(ctx: CanvasRenderingContext2D): void {
        if (this.hasShownHelpMessage) return;

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

    private drawSelectionHighlight(ctx: CanvasRenderingContext2D): void {
        const selectedBrush = this.brushManager.getSelectedBrush();
        if (!selectedBrush) return;

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
                highlightWidth = selectedBrush.preview.width;
                highlightHeight = selectedBrush.preview.height;
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

    private drawCustomBrushes(ctx: CanvasRenderingContext2D): void {
        const tilesPerRow = this.tilemap.width;
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / tilesPerRow) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 20;
        
        // Draw separator line
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.paletteX, brushSectionY - 10);
        ctx.lineTo(this.paletteX + tilesPerRow * (this.tilemap.tileWidth + this.tilemap.spacing), brushSectionY - 10);
        ctx.stroke();

        // Draw "Add Brush" button
        const addBrushSize = 32;
        ctx.fillStyle = '#444';
        ctx.fillRect(this.paletteX, brushSectionY, addBrushSize, addBrushSize);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.paletteX, brushSectionY, addBrushSize, addBrushSize);
        
        // Draw plus symbol
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        const center = addBrushSize / 2;
        const size = addBrushSize / 3;
        ctx.beginPath();
        ctx.moveTo(this.paletteX + center, brushSectionY + center - size/2);
        ctx.lineTo(this.paletteX + center, brushSectionY + center + size/2);
        ctx.moveTo(this.paletteX + center - size/2, brushSectionY + center);
        ctx.lineTo(this.paletteX + center + size/2, brushSectionY + center);
        ctx.stroke();

        // Draw custom brushes
        const maxBrushWidth = tilesPerRow * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.brushManager.getCustomBrushes();
        for (const brush of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / brush.preview.width);
            const width = brush.preview.width * scale;
            const height = brush.preview.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            // Draw brush preview
            ctx.drawImage(
                brush.preview,
                currentX,
                currentY,
                width,
                height
            );

            currentX += width + brushSpacing;
            maxHeightInRow = Math.max(maxHeightInRow, height);
        }
    }

    private getBrushPosition(brush: Brush): { x: number, y: number } | null {
        if (brush.isBuiltIn) {
            const index = parseInt(brush.id.replace('tile_', ''));
            return {
                x: this.paletteX + (index % this.tilemap.width) * (this.tilemap.tileWidth + this.tilemap.spacing),
                y: this.paletteY + Math.floor(index / this.tilemap.width) * (this.tilemap.tileHeight + this.tilemap.spacing)
            };
        }

        // Calculate custom brush position
        const brushSectionY = this.paletteY + Math.ceil(this.tilemap.width * this.tilemap.height / this.tilemap.width) * 
            (this.tilemap.tileHeight + this.tilemap.spacing) + 20;
        
        const maxBrushWidth = this.tilemap.width * (this.tilemap.tileWidth + this.tilemap.spacing) - 20;
        const brushSpacing = 10;
        const addBrushSize = 32;
        let currentX = this.paletteX + addBrushSize + brushSpacing;
        let currentY = brushSectionY;
        let maxHeightInRow = addBrushSize;

        const customBrushes = this.brushManager.getCustomBrushes();
        for (const b of customBrushes) {
            const scale = Math.min(1, maxBrushWidth / b.preview.width);
            const width = b.preview.width * scale;
            const height = b.preview.height * scale;

            // Check if we need to wrap to next row
            if (currentX + width > this.paletteX + maxBrushWidth) {
                currentX = this.paletteX;
                currentY += maxHeightInRow + brushSpacing;
                maxHeightInRow = 0;
            }

            if (b.id === brush.id) {
                return { x: currentX, y: currentY };
            }

            currentX += width + brushSpacing;
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
} 