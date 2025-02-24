<script lang="ts">
    import { editorStore } from '../lib/state/EditorStore.svelte';
    import { calculateZoomTransform, findClosestZoomLevel } from '../lib/utils/zoom';
    import type { ZoomLevel } from '../lib/utils/zoom';

    function resetZoom() {
        const rect = editorStore.canvas?.getBoundingClientRect();
        if (!rect) return;
        
        const transform = calculateZoomTransform(
            1 as ZoomLevel,
            editorStore.zoomLevel,
            { x: rect.width / 2, y: rect.height / 2 },
            { x: editorStore.offsetX, y: editorStore.offsetY }
        );
        editorStore.setZoom(transform.zoom as ZoomLevel, { x: transform.offset.x, y: transform.offset.y });
    }

    function handleToolbarZoom(direction: 'up' | 'down') {
        const rect = editorStore.canvas?.getBoundingClientRect();
        if (!rect) return;

        const newZoom = findClosestZoomLevel(editorStore.zoomLevel, direction);
        const scale = newZoom / editorStore.zoomLevel;
        
        // Scale the offset directly, maintaining the current pan position
        const newOffset = {
            x: editorStore.offsetX * scale,
            y: editorStore.offsetY * scale
        };

        editorStore.setZoom(newZoom as ZoomLevel, newOffset);
    }
</script>

{#if editorStore.editor}
<div class="controls">
    <button onclick={() => editorStore.setShowNewMapDialog(true)} title="Create new map">📄</button>
    <button onclick={() => editorStore.setShowResizeDialog(true)} title="Resize current map">📐</button>
    <button onclick={() => editorStore.setShowTilemapDialog(true)} title="Change tilemap settings">⚙️</button>
    <button 
        onclick={() => editorStore.editor?.toggleGrid()}
        class:active={editorStore.showGrid}
        title="Toggle grid (V)"
        class="tool-button"
    >
        ⊞
    </button>
    <div class="layer-indicator">
        <span>Layer: </span>
        <div class="layer-buttons">
            <button 
                class:active={editorStore.currentLayer === -1}
                onclick={() => editorStore.selectLayer(-1)}
                title="Show all layers (press §)"
                class="all-layers"
            >
                All
            </button>
            {#each Array(9) as _, i}
                <button 
                    class:active={editorStore.currentLayer === i}
                    onclick={() => editorStore.selectLayer(i)}
                    title="Select layer {i + 1} (press {i + 1})"
                >
                    {i + 1}
                </button>
            {/each}
            <button 
                class:active={editorStore.currentLayer === 9}
                onclick={() => editorStore.selectLayer(9)}
                title="Select layer 10 (press 0)"
            >
                10
            </button>
        </div>
    </div>
    <div class="brush-controls">
        <div class="tool-buttons">
            <button 
                class:active={editorStore.currentTool === 'brush'}
                onclick={() => editorStore.selectTool('brush')}
                title="Brush tool (B)"
                class="tool-button"
            >
                🖌️
            </button>
            <button 
                class:active={editorStore.currentTool === 'fill'}
                onclick={() => editorStore.selectTool('fill')}
                title="Flood fill tool (G)"
                class="tool-button"
            >
                🪣
            </button>
        </div>
        <span>📏 </span>
        <button 
            onclick={() => editorStore.setBrushSize(editorStore.brushSize - 1)}
            title="Decrease brush size (Z)"
        >-</button>
        <span class="brush-size">{editorStore.brushSize}</span>
        <button 
            onclick={() => editorStore.setBrushSize(editorStore.brushSize + 1)}
            title="Increase brush size (X)"
        >+</button>
    </div>
    <div class="zoom-controls">
        <span>🔍 </span>
        <button 
            onclick={() => handleToolbarZoom('down')}
            title="Zoom out (-)"
        >-</button>
        <button 
            onclick={resetZoom}
            title="Reset zoom (Ctrl/Cmd + 0)"
            class="zoom-reset"
        >{Math.round(editorStore.zoomLevel * 100)}%</button>
        <button 
            onclick={() => handleToolbarZoom('up')}
            title="Zoom in (+)"
        >+</button>
    </div>
    <button onclick={() => editorStore.setShowExportDialog(true)} title="Export map (Ctrl/Cmd + E)">📤</button>
    <button onclick={() => editorStore.setShowImportDialog(true)} title="Import map (Ctrl/Cmd + I)">📥</button>
    <button onclick={() => editorStore.setShowShortcuts(!editorStore.showShortcuts)} title="Ctrl/Cmd + H or ?">
        {editorStore.showShortcuts ? '❌' : '❓'}
    </button>
</div>
{/if}

<style>
    .controls {
        padding: 10px;
        background: #333;
        display: flex;
        gap: 10px;
        align-items: center;
    }

    button {
        width: 28px;
        height: 28px;
        padding: 0;
        background: #666;
        border: 1px solid #777;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    button:hover {
        background: #777;
    }

    .layer-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px;
        background: #444;
        border-radius: 4px;
    }

    .layer-indicator span {
        color: #fff;
        font-size: 14px;
    }

    .layer-buttons {
        display: flex;
        gap: 2px;
    }

    .layer-buttons button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 12px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .layer-buttons button:hover {
        background: #666;
    }

    .layer-buttons button.active {
        background: #00aa00;
        border-color: #00cc00;
    }

    .layer-buttons .all-layers {
        width: auto;
        min-width: 42px;
        font-size: 12px;
        font-weight: bold;
    }

    .brush-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: #444;
        border-radius: 4px;
    }

    .brush-controls span {
        color: #fff;
        font-size: 14px;
    }

    .tool-buttons {
        display: flex;
        gap: 4px;
    }

    .brush-size {
        min-width: 20px;
        text-align: center;
        font-weight: bold;
    }

    .zoom-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: #444;
        border-radius: 4px;
    }

    .zoom-controls span {
        color: #fff;
        font-size: 14px;
    }

    .zoom-controls .zoom-reset {
        width: auto;
        min-width: 60px;
        font-size: 14px;
        padding: 0 8px;
    }

    .tool-button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 16px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tool-button:hover {
        background: #666;
    }

    .tool-button.active {
        background: #00aa00;
        border-color: #00cc00;
    }
</style> 