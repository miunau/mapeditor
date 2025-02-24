<script lang="ts">
    import { editorStore } from '../lib/state/EditorStore.svelte';
    import { calculateZoomTransform, findClosestZoomLevel } from '../lib/utils/zoom';
    import type { ZoomLevel } from '../lib/utils/zoom';
  import IconButton from './IconButton.svelte';
  import IconAdjustment from './icons/IconAdjustment.svelte';
  import IconBrush from './icons/IconBrush.svelte';
  import IconExport from './icons/IconExport.svelte';
  import IconGrid from './icons/IconGrid.svelte';
  import IconImport from './icons/IconImport.svelte';
  import IconInfo from './icons/IconInfo.svelte';
  import IconLayer from './icons/IconLayer.svelte';
  import IconNewFile from './icons/IconNewFile.svelte';
  import IconPaintBucket from './icons/IconPaintBucket.svelte';
  import IconRectangle from './icons/IconRectangle.svelte';
  import IconResize from './icons/IconResize.svelte';
  import IconZoomIn from './icons/IconZoomIn.svelte';
  import IconZoomOut from './icons/IconZoomOut.svelte';

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

        const newZoom = findClosestZoomLevel(editorStore.zoomLevel, direction, 'coarse');
        
        // Calculate the world point at the center of the viewport
        const worldX = (-editorStore.offsetX + rect.width / 2) / editorStore.zoomLevel;
        const worldY = (-editorStore.offsetY + rect.height / 2) / editorStore.zoomLevel;

        // Calculate the new offset to keep this world point at the center
        const newOffset = {
            x: -(worldX * newZoom) + rect.width / 2,
            y: -(worldY * newZoom) + rect.height / 2
        };

        editorStore.setZoom(newZoom, newOffset);
    }
</script>

{#if editorStore.editor}
<div class="controls">
    <IconButton Icon={IconNewFile} title="Create new map" onclick={() => editorStore.setShowNewMapDialog(true)}>
        New map
    </IconButton>
    <IconButton Icon={IconResize} title="Resize current map" onclick={() => editorStore.setShowResizeDialog(true)}>
        Resize
    </IconButton>
    <IconButton Icon={IconAdjustment} title="Change tilemap settings" onclick={() => editorStore.setShowTilemapDialog(true)}>
        Tilemap
    </IconButton>
    <IconButton Icon={IconGrid} title="Toggle grid (V)" onclick={() => editorStore.editor?.toggleGrid()} active={editorStore.showGrid}>
        Grid (V)
    </IconButton>
    <div class="layer-indicator">
        <span>
            <IconLayer />
        </span>
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
            <IconButton Icon={IconBrush} title="Brush tool (B)" onclick={() => editorStore.selectTool('brush')} active={editorStore.currentTool === 'brush'}>
                Brush (B)
            </IconButton>
            <IconButton Icon={IconPaintBucket} title="Flood fill tool (G)" onclick={() => editorStore.selectTool('fill')} active={editorStore.currentTool === 'fill'}>
                Fill (G)
            </IconButton>
            <IconButton Icon={IconRectangle} title="Rectangle tool (R)" onclick={() => editorStore.selectTool('rectangle')} active={editorStore.currentTool === 'rectangle'}>
                Rect (R)
            </IconButton>
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
        <button 
            onclick={() => handleToolbarZoom('down')}
            title="Zoom out (-)"
        >
            <IconZoomOut />
        </button>
        <button 
            onclick={resetZoom}
            title="Reset zoom (Ctrl/Cmd + 0)"
            class="zoom-reset"
        >{Math.round(editorStore.zoomLevel * 100)}%</button>
        <button 
            onclick={() => handleToolbarZoom('up')}
            title="Zoom in (+)"
        >
            <IconZoomIn />
        </button>
    </div>
    <button onclick={() => editorStore.setShowExportDialog(true)} title="Export map (Ctrl/Cmd + E)">
        <IconExport />
    </button>
    <button onclick={() => editorStore.setShowImportDialog(true)} title="Import map (Ctrl/Cmd + I)">
        <IconImport />
    </button>
    <button onclick={() => editorStore.setShowShortcuts(!editorStore.showShortcuts)} title="Ctrl/Cmd + H or ?">
        <IconInfo />
    </button>
</div>
{/if}

<style>
    .controls {
        display: flex;
        align-items: center;
        padding-bottom: 8px;
    }

    button {
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .layer-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 8px;
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
        min-width: 24px;
    }

    .layer-buttons .all-layers {
        width: auto;
        min-width: 42px;
        font-weight: bold;
    }

    .brush-controls {
        display: flex;
        align-items: center;
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
    }

    .zoom-controls .zoom-reset {
        width: auto;
        min-width: 60px;
        font-size: 14px;
        padding: 0 8px;
    }

</style> 