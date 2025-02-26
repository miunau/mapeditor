<script lang="ts">
    import { editorFSM } from '../../lib/state/EditorStore.svelte.js';
    import { drawTile } from '../../lib/drawTile';
    import Dialog from './Dialog.svelte';

    let name: string | null = $state('');
    let width = $state(3);
    let height = $state(3);
    let tiles: number[][] = $state([]);
    let selectedTile = $state(-1);
    let dragSource: { x: number, y: number } | null = $state(null);
    let dragTarget: { x: number, y: number } | null = $state(null);
    let isDragCopy = $state(false);
    let isShiftPressed = $state(false);
    let isDragging = $state(false);
    let previewTarget: { x: number, y: number } | null = $state(null);
    let draggedPaletteTile = $state<number | null>(null);

    // Compute the display tile size (2x actual size, max 32px)
    let displayTileSize = $derived(Math.min(32, (editorFSM.context.tilemap?.tileWidth || 16) * 2));

    $inspect(displayTileSize);

    // Track shift key state
    function handleKeyDown(e: KeyboardEvent) {
        if (e.target instanceof HTMLInputElement) return;

        // Track shift key state
        if (e.key === 'Shift') {
            e.preventDefault(); // Prevent shift from focusing buttons
            isShiftPressed = true;
            if (isDragging) {
                isDragCopy = true;
            }
        }

        const tilemapWidth = editorFSM.context.tilemap?.width || 0;
        const tilemapHeight = editorFSM.context.tilemap?.height || 0;
        const totalTiles = tilemapWidth * tilemapHeight;

        switch (e.key.toLowerCase()) {
            case 'w':
                e.preventDefault();
                e.stopPropagation();
                if (selectedTile >= tilemapWidth) {
                    selectedTile -= tilemapWidth;
                }
                break;
            case 's':
                e.preventDefault();
                e.stopPropagation();
                if (selectedTile < (tilemapWidth * (tilemapHeight - 1))) {
                    selectedTile += tilemapWidth;
                }
                break;
            case 'a':
                e.preventDefault();
                e.stopPropagation();
                if (selectedTile > 0) {
                    selectedTile--;
                }
                break;
            case 'd':
                e.preventDefault();
                e.stopPropagation();
                if (selectedTile < totalTiles - 1) {
                    selectedTile++;
                }
                break;
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        // Track shift key state
        if (e.key === 'Shift') {
            isShiftPressed = false;
            if (isDragging) {
                isDragCopy = false;
            }
        }
    }

    $effect(() => {
        if (editorFSM.context.currentBrush && editorFSM.context.currentBrush.type === 'custom') {
            const brush = editorFSM.context.currentBrush.brush;
            name = brush.name;
            width = brush.width;
            height = brush.height;
            tiles = brush.tiles.map(row => [...row]);
            selectedTile = -1;
        } else {
            // Initialize empty brush pattern
            tiles = Array(height).fill(null)
                .map(() => Array(width).fill(-1));
        }
    });

    $effect(() => {
        // Add event listeners for keyboard events
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    });

    function handleTileClick(x: number, y: number) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            tiles[y][x] = selectedTile;
        }
    }

    function handleMouseDown(x: number, y: number, e: MouseEvent) {
        if (x >= 0 && x < width && y >= 0 && y < height && tiles[y][x] !== -1) {
            isDragging = true;
            dragSource = { x, y };
            isDragCopy = isShiftPressed || e.shiftKey;
        }
    }

    function handleMouseUp() {
        if (dragSource && dragTarget) {
            if (isDragCopy) {
                // Copy the tile to the target location
                tiles[dragTarget.y][dragTarget.x] = tiles[dragSource.y][dragSource.x];
            } else {
                // Swap tiles between source and target
                const temp = tiles[dragSource.y][dragSource.x];
                tiles[dragSource.y][dragSource.x] = tiles[dragTarget.y][dragTarget.x];
                tiles[dragTarget.y][dragTarget.x] = temp;
            }
        }
        isDragging = false;
        dragSource = null;
        dragTarget = null;
        isDragCopy = false;
    }

    function handleMouseMove(x: number, y: number, e: MouseEvent) {
        if (isDragging && x >= 0 && x < width && y >= 0 && y < height) {
            dragTarget = { x, y };
            previewTarget = { x, y };
            isDragCopy = isShiftPressed || e.shiftKey;
        } else if (x >= 0 && x < width && y >= 0 && y < height) {
            previewTarget = { x, y };
        }
    }

    function handleMouseLeave() {
        if (!isDragging) {
            dragTarget = null;
        }
        previewTarget = null;
    }

    function handleSave() {
        if (editorFSM.context.currentBrush && typeof editorFSM.context.currentBrush === 'object') {
            editorFSM.send('updateCustomBrush', { name, tiles });
        } else {
            editorFSM.send('createCustomBrush', { name, tiles });
        }
        closeDialog();
    }

    function handleDelete() {
        if (editorFSM.context.currentBrush && typeof editorFSM.context.currentBrush === 'object') {
            editorFSM.send('deleteCustomBrush', { name, tiles });
        }
        closeDialog();
    }

    function closeDialog() {
        editorFSM.send('setShowCustomBrushDialog', false);
    }

    function updateBrushDimensions() {
        // Store old dimensions
        const oldWidth = width;
        const oldHeight = height;

        // Ensure dimensions are within reasonable limits
        width = Math.max(1, Math.min(9, width));
        height = Math.max(1, Math.min(9, height));

        // If tiles array is empty or undefined, initialize it with -1
        if (!tiles || !tiles.length) {
            tiles = Array(oldHeight).fill(null)
                .map(() => Array(oldWidth).fill(-1));
        }

        // Create new tiles array with new dimensions
        const newTiles = Array(height).fill(null)
            .map((_, y) => Array(width).fill(null)
                .map((_, x) => {
                    // If within old bounds, keep existing tile
                    if (y < oldHeight && x < oldWidth && tiles[y] && typeof tiles[y][x] !== 'undefined') {
                        return tiles[y][x];
                    }
                    
                    // For new cells, copy from nearest edge
                    const sourceY = Math.min(y, oldHeight - 1);
                    const sourceX = Math.min(x, oldWidth - 1);
                    return tiles[sourceY]?.[sourceX] ?? -1;
                }));
        
        tiles = newTiles;
    }
</script>

<Dialog 
    title={editorFSM.context.currentBrush ? 'Edit Custom Brush' : 'Create Custom Brush'} 
    onClose={closeDialog}
>
    {#snippet buttonArea()}
        <div class="button-area">
            <div class="left">
                {#if editorFSM.context.currentBrush}
                    <button class="delete" onclick={handleDelete}>Delete</button>
                {/if}
            </div>
            <div class="right">
                <button onclick={handleSave}>{editorFSM.context.currentBrush ? 'Save' : 'Create'}</button>
                <button onclick={closeDialog}>Cancel</button>
            </div>
        </div>
    {/snippet}

    <div class="dialog-content">
        <div class="options">
            <p><strong>Options</strong></p>
            <div class="brush-dimensions">
                <label for="width">
                    Width:
                </label>
                <input 
                    id="width"
                    type="number" 
                    bind:value={width} 
                    min="1" 
                    max="9"
                    onchange={updateBrushDimensions}
                />
                <label for="height">
                    Height:
                </label>
                <input 
                    id="height"
                    type="number" 
                    bind:value={height} 
                    min="1" 
                    max="9"
                    onchange={updateBrushDimensions}
                />
            </div>
            <div class="brush-options">
                <input 
                    id="world-aligned-repeat"
                    type="checkbox" 
                    checked={(editorFSM.context.currentBrush?.type === 'custom' && editorFSM.context.currentBrush.brush.worldAligned)}
                    onchange={(e) => {
                        if (editorFSM.context.currentBrush && editorFSM.context.currentBrush.type === 'custom') {
                            editorFSM.context.currentBrush.brush.worldAligned = e.currentTarget.checked;
                        }
                    }}
                />
                <label for="world-aligned-repeat">
                    World-aligned repeat
                </label>
            </div>
        </div>

        <div class="brush-editor">
            <div class="tile-picker">
                <h4>Select Tile (WASD to navigate)</h4>
                <div class="tile-grid">
                    <button 
                        class="tile-cell eraser"
                        class:selected={selectedTile === -1}
                        onclick={() => selectedTile = -1}
                        tabindex="-1"
                    >
                        ❌
                    </button>
                    <div class="tilemap-grid" style="--tilemap-width: {editorFSM.context.tilemap!.width}">
                        {#each Array(editorFSM.context.tilemap?.width! * editorFSM.context.tilemap?.height!) as _, i}
                            <button 
                                class="tile-cell button-none"
                                class:selected={selectedTile === i}
                                aria-label={`Select tile ${i}`}
                                onclick={() => selectedTile = i}
                                draggable="true"
                                ondragstart={(e) => {
                                    e.dataTransfer?.setData('text/plain', i.toString());
                                    draggedPaletteTile = i;
                                }}
                                ondragend={() => {
                                    draggedPaletteTile = null;
                                }}
                                tabindex="-1"
                                style="--tile-size: {displayTileSize}px"
                            >
                                <canvas 
                                    width={editorFSM.context.tilemap!.tileWidth}
                                    height={editorFSM.context.tilemap!.tileHeight}
                                    style="width: var(--tile-size); height: var(--tile-size); image-rendering: pixelated;"
                                ></canvas>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>

            <div class="brush-grid-section">
                <h4>Brush Pattern</h4>
                <div class="brush-grid" style="--grid-width: {width}; --grid-height: {height}">
                    {#each tiles as row, y}
                        {#each row as tile, x}
                            <button 
                                class="tile-cell button-none"
                                class:empty={tile === -1}
                                class:dragging={dragSource?.x === x && dragSource?.y === y}
                                class:drag-target={(dragTarget?.x === x && dragTarget?.y === y) || (!isDragging && previewTarget?.x === x && previewTarget?.y === y)}
                                class:drag-copy={isDragCopy && dragTarget?.x === x && dragTarget?.y === y}
                                class:preview={false}
                                onclick={() => handleTileClick(x, y)}
                                onmousedown={(e) => handleMouseDown(x, y, e)}
                                onmousemove={(e) => handleMouseMove(x, y, e)}
                                onmouseup={handleMouseUp}
                                onmouseleave={handleMouseLeave}
                                ondragover={(e) => {
                                    if (draggedPaletteTile !== null) {
                                        e.preventDefault();
                                        previewTarget = { x, y };
                                    }
                                }}
                                ondragleave={() => {
                                    if (draggedPaletteTile !== null) {
                                        previewTarget = null;
                                    }
                                }}
                                ondrop={(e) => {
                                    e.preventDefault();
                                    if (draggedPaletteTile !== null) {
                                        tiles[y][x] = draggedPaletteTile;
                                        previewTarget = null;
                                    }
                                }}
                                tabindex="-1"
                                style="--tile-size: {displayTileSize}px"
                            >
                                {#if tile !== -1}
                                    <canvas 
                                        width={editorFSM.context.tilemap!.tileWidth}
                                        height={editorFSM.context.tilemap!.tileHeight}
                                        style="width: var(--tile-size); height: var(--tile-size); image-rendering: pixelated;"
                                    ></canvas>
                                {/if}
                                {#if (isDragging && dragTarget?.x === x && dragTarget?.y === y && dragSource) || 
                                    (!isDragging && previewTarget?.x === x && previewTarget?.y === y && draggedPaletteTile !== null)}
                                    <canvas 
                                        class="preview-tile"
                                        width={editorFSM.context.tilemap!.tileWidth}
                                        height={editorFSM.context.tilemap!.tileHeight}
                                        style="width: var(--tile-size); height: var(--tile-size); image-rendering: pixelated;"
                                    ></canvas>
                                {/if}
                            </button>
                        {/each}
                    {/each}
                </div>
            </div>
        </div>
    </div>
</Dialog>

<style>
    .dialog-content {
        width: 800px;
        max-width: 90vw;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .options {
        display: flex;
        gap: 10px;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
    }

    .options p {
        margin: 0;
    }

    .brush-dimensions {
        display: flex;
        gap: 10px;
    }

    .brush-dimensions label {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .tile-picker {
        flex: 2;
        min-width: 0;
        background: #c0c0c0;
        border: 1px solid #888;
        padding: 10px;
    }

    h4 {
        font-weight: bold;
    }

    .tile-grid {
        padding: 6px;
        background: #333;
        border: 1px solid #888;
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
        background: #c0c0c0;
        border: 1px solid #888;
        padding: 10px;
    }

    .brush-grid {
        display: grid;
        grid-template-columns: repeat(var(--grid-width), var(--tile-size, 32px));
        grid-template-rows: repeat(var(--grid-height), var(--tile-size, 32px));
        gap: 1px;
        padding: 6px;
        background: #333;
        border: 1px solid #888;
        justify-content: center;
    }

    .tile-cell {
        width: var(--tile-size);
        height: var(--tile-size);
        padding: 0;
        margin: 0;
        background: #333;
        border: 1px solid #555;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        user-select: none;
        -webkit-user-select: none;
        position: relative;
        outline: none;
    }

    .tile-cell:hover {
        background: #3a3a3a;
        z-index: 1;
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

    .brush-options {
        margin-bottom: 10px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
        color: black;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
    }

    .tile-cell.preview::before {
        content: '';
        position: absolute;
        top: -1px;
        left: -1px;
        width: calc(100% + 2px);
        height: calc(100% + 2px);
        border: 1px solid rgba(255, 255, 255, 0.5);
        pointer-events: none;
        z-index: 1;
    }

    .tile-cell.dragging {
        opacity: 0.5;
    }

    .tile-cell.dragging::before {
        content: '';
        position: absolute;
        top: -1px;
        left: -1px;
        width: calc(100% + 2px);
        height: calc(100% + 2px);
        border: 1px dashed #888;
        pointer-events: none;
        z-index: 1;
    }

    .tile-cell.drag-target::before {
        content: '';
        position: absolute;
        top: -2px;
        left: -2px;
        width: calc(100% + 4px);
        height: calc(100% + 4px);
        border: 2px solid #00ff00;
        pointer-events: none;
        z-index: 1;
    }

    .tile-cell.drag-copy::before {
        border-style: dashed;
    }

    .tile-cell .preview-tile {
        position: absolute;
        top: 0;
        left: 0;
        opacity: 0.5;
        pointer-events: none;
    }

    .button-area {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    button.delete {
        background: #aa0000;
        border-color: #cc0000;
        color: white;
    }

</style> 