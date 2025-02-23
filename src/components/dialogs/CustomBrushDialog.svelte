<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';
    import { drawTile } from '../../lib/drawTile';

    let name: string | null = $state('');
    let width = $state(2);
    let height = $state(2);
    let tiles: number[][] = $state([]);
    let selectedTile = $state(-1);

    // For WASD navigation
    function handleKeyDown(e: KeyboardEvent) {
        if (!editorStore.showCustomBrushDialog) return;
        
        // Prevent map navigation while dialog is open
        e.stopPropagation();

        if (e.target instanceof HTMLInputElement) return;

        const tilemapWidth = editorStore.editor?.tilemap.width || 0;
        const tilemapHeight = editorStore.editor?.tilemap.height || 0;
        const totalTiles = tilemapWidth * tilemapHeight;

        switch (e.key.toLowerCase()) {
            case 'w':
                e.preventDefault();
                if (selectedTile >= tilemapWidth) {
                    selectedTile -= tilemapWidth;
                }
                break;
            case 's':
                e.preventDefault();
                if (selectedTile < (tilemapWidth * (tilemapHeight - 1))) {
                    selectedTile += tilemapWidth;
                }
                break;
            case 'a':
                e.preventDefault();
                if (selectedTile > 0) {
                    selectedTile--;
                }
                break;
            case 'd':
                e.preventDefault();
                if (selectedTile < totalTiles - 1) {
                    selectedTile++;
                }
                break;
        }
    }

    $effect(() => {
        if (editorStore.showCustomBrushDialog && editorStore.customBrushDialogId) {
            const brush = editorStore.customBrush;
            if (brush && brush.id === editorStore.customBrushDialogId) {
                name = brush.name;
                width = brush.width;
                height = brush.height;
                tiles = brush.tiles.map(row => [...row]);
                selectedTile = -1;
            }
        }
    });

    $effect(() => {
        if (editorStore.showCustomBrushDialog) {
            // Initialize empty brush pattern
            tiles = Array(height).fill(null)
                .map(() => Array(width).fill(-1));
            
            // Add event listener for WASD navigation
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    });

    function handleTileClick(x: number, y: number) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            tiles[y][x] = selectedTile;
        }
    }

    function handleSave() {
        if (editorStore.customBrushDialogId) {
            editorStore.editor?.updateCustomBrush(editorStore.customBrushDialogId, name, tiles);
        } else {
            editorStore.editor?.createCustomBrush(name, tiles);
        }
        editorStore.setShowCustomBrushDialog(false);
    }

    function handleDelete() {
        if (editorStore.customBrushDialogId) {
            editorStore.editor?.deleteCustomBrush(editorStore.customBrushDialogId);
        }
        editorStore.setShowCustomBrushDialog(false);
    }

    function updateBrushDimensions() {
        // Ensure dimensions are within reasonable limits
        width = Math.max(1, Math.min(9, width));
        height = Math.max(1, Math.min(9, height));

        // Create new tiles array with new dimensions
        const newTiles = Array(height).fill(null)
            .map((_, y) => Array(width).fill(null)
                .map((_, x) => (tiles[y]?.[x] ?? -1)));
        tiles = newTiles;
    }
</script>

{#if editorStore.showCustomBrushDialog}
<div class="dialog">
    <h3>{editorStore.customBrushDialogId ? 'Edit' : 'Create'} Custom Brush</h3>
    <div class="dialog-content">
        <div class="brush-dimensions">
            <label>
                Width:
                <input 
                    type="number" 
                    bind:value={width} 
                    min="1" 
                    max="9"
                    onchange={updateBrushDimensions}
                />
            </label>
            <label>
                Height:
                <input 
                    type="number" 
                    bind:value={height} 
                    min="1" 
                    max="9"
                    onchange={updateBrushDimensions}
                />
            </label>
        </div>
        <div class="brush-options">
            <label class="checkbox-label">
                <input 
                    type="checkbox" 
                    checked={editorStore.editor?.useWorldAlignedRepeat}
                    onchange={(e) => editorStore.editor && (editorStore.editor.useWorldAlignedRepeat = e.currentTarget.checked)}
                />
                World-aligned repeat (Pattern repeats relative to world grid instead of brush position)
            </label>
        </div>

        <div class="brush-editor">
            <div class="tile-picker">
                <h4>Select Tile (WASD to navigate)</h4>
                <div class="tile-grid">
                    <button 
                        class="tile-cell eraser"
                        class:selected={selectedTile === -1}
                        onclick={() => selectedTile = -1}
                    >
                        ❌
                    </button>
                    {#if editorStore.editor}
                        <div class="tilemap-grid" style="--tilemap-width: {editorStore.editor.tilemap.width}">
                            {#each Array(editorStore.editor.tilemap.width * editorStore.editor.tilemap.height) as _, i}
                                <button 
                                    class="tile-cell"
                                    class:selected={selectedTile === i}
                                    onclick={() => selectedTile = i}
                                >
                                    <canvas 
                                        width={editorStore.editor.tilemap.tileWidth}
                                        height={editorStore.editor.tilemap.tileHeight}
                                        style="width: var(--tile-size); height: var(--tile-size); image-rendering: pixelated;"
                                        use:drawTile={{ editor: editorStore.editor, tileIndex: i }}
                                    ></canvas>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="brush-grid-section">
                <h4>Brush Pattern</h4>
                <div class="brush-grid" style="--grid-width: {width}; --grid-height: {height}">
                    {#each tiles as row, y}
                        {#each row as tile, x}
                            <button 
                                class="tile-cell"
                                class:empty={tile === -1}
                                onclick={() => handleTileClick(x, y)}
                            >
                                {#if tile !== -1 && editorStore.editor}
                                    <canvas 
                                        width={editorStore.editor.tilemap.tileWidth}
                                        height={editorStore.editor.tilemap.tileHeight}
                                        style="width: var(--tile-size); height: var(--tile-size); image-rendering: pixelated;"
                                        use:drawTile={{ editor: editorStore.editor, tileIndex: tile }}
                                    ></canvas>
                                {/if}
                            </button>
                        {/each}
                    {/each}
                </div>
            </div>
        </div>

        <div class="dialog-buttons">
            <button onclick={handleSave}>{editorStore.customBrushDialogId ? 'Save' : 'Create'}</button>
            {#if editorStore.customBrushDialogId}
                <button class="delete" onclick={handleDelete}>Delete</button>
            {/if}
            <button onclick={() => editorStore.setShowCustomBrushDialog(false)}>Cancel</button>
        </div>
    </div>
</div>
{/if}

<style>
    .dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        padding: 20px;
        border-radius: 8px;
        border: 1px solid #555;
        color: white;
        z-index: 1000;
        max-height: 90vh;
        overflow-y: auto;
    }

    .dialog h3 {
        margin: 0 0 15px 0;
        font-size: 18px;
    }

    .dialog-content {
        width: 800px;
        max-width: 90vw;
    }

    .brush-dimensions {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
    }

    .brush-dimensions label {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .brush-dimensions input {
        width: 60px;
        padding: 4px;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
    }

    .brush-editor {
        display: flex;
        gap: 10px;
    }

    .tile-picker {
        flex: 1;
        min-width: 0;
    }

    .tile-picker h4 {
        margin: 0 0 6px 0;
        font-size: 14px;
    }

    .tile-grid {
        padding: 6px;
        background: #444;
        border-radius: 4px;
        max-height: 400px;
        overflow: auto;
        display: flex;
        gap: 1px;
    }

    .tilemap-grid {
        display: grid;
        grid-template-columns: repeat(var(--tilemap-width), var(--tile-size, 32px));
        gap: 1px;
        flex-shrink: 0;
    }

    .brush-grid-section {
        flex: 1;
        min-width: 0;
    }

    .brush-grid-section h4 {
        margin: 0 0 6px 0;
        font-size: 14px;
    }

    .brush-grid {
        display: grid;
        grid-template-columns: repeat(var(--grid-width), var(--tile-size, 32px));
        grid-template-rows: repeat(var(--grid-height), var(--tile-size, 32px));
        gap: 1px;
        padding: 6px;
        background: #444;
        border-radius: 4px;
        justify-content: center;
    }

    .tile-cell {
        --tile-size: 28px;
        width: var(--tile-size);
        height: var(--tile-size);
        padding: 0;
        background: #333;
        border: 1px solid #555;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
    }

    .tile-cell:hover {
        background: #3a3a3a;
    }

    .tile-cell.empty {
        background: #2a2a2a;
    }

    .tile-cell.selected {
        position: relative;
    }

    .tile-cell.selected::before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        width: calc(100% + 4px);
        height: calc(100% + 4px);
        border: 2px solid #000;
        pointer-events: none;
    }

    .tile-cell.selected::after {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        width: calc(100% + 4px);
        height: calc(100% + 4px);
        border: 1px solid #00ff00;
        pointer-events: none;
    }

    .tile-cell.eraser {
        font-size: 14px;
        margin-right: 1px;
    }

    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #555;
    }

    .dialog-buttons button {
        padding: 8px 16px;
        background: #555;
        border: 1px solid #666;
        border-radius: 4px;
        color: white;
        cursor: pointer;
    }

    .dialog-buttons button:hover {
        background: #666;
    }

    .dialog-buttons button.delete {
        background: #aa0000;
        border-color: #cc0000;
    }

    .dialog-buttons button.delete:hover {
        background: #cc0000;
    }

    .brush-options {
        margin-bottom: 20px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
    }
</style> 