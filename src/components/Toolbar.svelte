<script lang="ts">
    import { editorStore } from '../lib/state/EditorStore.svelte';
    import { layerFSM } from '../lib/state/LayerState.svelte';
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
  import IconMagnifyingGlass from './icons/IconMagnifyingGlass.svelte';
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

    let audio: HTMLAudioElement | null = $state(null);

    function playClickSound(fn: () => void) {
        if (audio) {
            audio.play();
        }
        fn();
    }
</script>

{#if editorStore.editor}
<div class="controls">
    <audio src="/START.mp3" bind:this={audio}></audio>
    <IconButton Icon={IconGrid} title="Toggle grid (V)" onclick={() => playClickSound(() => editorStore.editor?.toggleGrid())} active={editorStore.showGrid}>
        Grid (V)
    </IconButton>
    <div class="brush-controls">
        <div class="tool-buttons">
            <IconButton Icon={IconBrush} title="Brush tool (B)" onclick={() => playClickSound(() => editorStore.selectTool('brush'))} active={editorStore.currentTool === 'brush'}>
                Brush (B)
            </IconButton>
            <IconButton Icon={IconPaintBucket} title="Flood fill tool (G)" onclick={() => playClickSound(() => editorStore.selectTool('fill'))} active={editorStore.currentTool === 'fill'}>
                Fill (G)
            </IconButton>
            <IconButton Icon={IconRectangle} title="Rectangle tool (R)" onclick={() => playClickSound(() => editorStore.selectTool('rectangle'))} active={editorStore.currentTool === 'rectangle'}>
                Rect (R)
            </IconButton>
        </div>
    </div>
    <div class="stack">
        <span><IconBrush /> Size (Z/X)</span>
        <div class="buttons">
            <button 
                onclick={() => playClickSound(() => editorStore.setBrushSize(editorStore.brushSize - 1))}
                title="Decrease brush size (Z)"
                class="small bold"
            >-</button>
            <span class="brush-size">{editorStore.brushSize}</span>
            <button 
                onclick={() => playClickSound(() => editorStore.setBrushSize(editorStore.brushSize + 1))}
                title="Increase brush size (X)"
                class="small bold"
            >+</button>
        </div>
    </div>
    <div class="stack">
        <span>
            <IconLayer /> Layers (0-9)
            <button class="small" onclick={() => playClickSound(() => editorStore.setShowLayerDialog(true))}>Edit..</button>
        </span>
        <div class="buttons">
            <button 
                class:active={editorStore.currentLayer === -1}
                onclick={() => editorStore.selectLayer(-1)}
                title="Show all layers (press §)"
                class="small bold"
            >
                All
            </button>
            {#each Array(9) as _, i}
                <button 
                    class:active={editorStore.currentLayer === i}
                    onclick={() => playClickSound(() => editorStore.selectLayer(i))}
                    class="small"
                    title="Select layer {i + 1} (press {i + 1})"
                    disabled={!layerFSM.context.layerVisibility[i]}
                >
                    {i + 1}
                </button>
            {/each}
            <button 
                class:active={editorStore.currentLayer === 9}
                onclick={() => playClickSound(() => editorStore.selectLayer(9))}
                title="Select layer 10 (press 0)"
                class="small"
                disabled={!layerFSM.context.layerVisibility[9]}
            >
                10
            </button>
        </div>
    </div>
    <div class="stack">
        <span>
            <IconMagnifyingGlass /> Zoom (Z/X)
        </span>
        <div class="buttons">
            <button 
                onclick={() => playClickSound(() => handleToolbarZoom('down'))}
                title="Zoom out (-)"
                class="small"
            >
                <IconZoomOut />
            </button>
            <button 
                onclick={() => playClickSound(resetZoom)}
                title="Reset zoom (Ctrl/Cmd + 0)"
                class="zoom-reset"
            >{Math.round(editorStore.zoomLevel * 100)}%</button>
            <button 
                onclick={() => playClickSound(() => handleToolbarZoom('up'))}
                title="Zoom in (+)"
                class="small"
            >
                <IconZoomIn />
            </button>
        </div>
    </div>
</div>
{/if}

<style>
    .controls {
        display: flex;
        align-items: center;
        gap: 16px;
        padding-bottom: 8px;
    }

    button {
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .stack {
        display: flex;
        flex-direction: column;
        align-items: start;
        justify-content: space-between;
        height: 100%;
    }

    .stack span button {
        padding: 0 6px;
        line-height: 1;
        min-height: 16px;
    }

    span {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: bold;
    }

    span.brush-size {
        justify-content: center;
    }

    .buttons {
        display: flex;
        gap: 2px;
    }

    .brush-controls {
        display: flex;
        gap: 0;
        align-items: center;
    }

    .tool-buttons {
        display: flex;
        gap: 0px;
    }

    .brush-size {
        min-width: 20px;
        text-align: center;
        font-weight: bold;
    }

</style> 