<script lang="ts">
    import { editorStore } from '../lib/state/EditorStore.svelte';
    import { calculateZoomTransform, findClosestZoomLevel } from '../lib/utils/zoom';
    import type { ZoomLevel } from '../lib/utils/zoom';
    import IconButton from './IconButton.svelte';
    import IconAdjustment from './icons/IconAdjustment.svelte';
    import IconBrush from './icons/IconBrush.svelte';
  import IconEllipse from './icons/IconEllipse.svelte';
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

    let audioContext: AudioContext | null = null;
    let audioBuffer: AudioBuffer | null = null;
    let lastClickTime = 0;
    let filterFrequency = 20000; // Start fully open
    let filterResetTimeout: number | null = null;
    let flangerDepth = 0; // Start with no flanger
    let panAmount = 0; // Start centered
    let panDirection = 1; // 1 for right, -1 for left

    async function initAudio() {
        audioContext = new AudioContext();
        try {
            const response = await fetch('/START.mp3');
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('Failed to load audio:', error);
        }
    }

    async function playClickSound(fn: () => void) {
        if (!audioContext) {
            await initAudio();
        }
        if (audioContext && audioBuffer) {
            const now = performance.now();
            const timeSinceLastClick = now - lastClickTime;
            lastClickTime = now;
            
            // Clear any pending reset
            if (filterResetTimeout) {
                clearTimeout(filterResetTimeout);
            }

            // Schedule reset after 500ms of no clicks
            filterResetTimeout = setTimeout(() => {
                filterFrequency = 20000;
                flangerDepth = 0;
                panAmount = 0;
            }, 500);
            
            // Adjust parameters based on click speed
            filterFrequency = Math.min(20000, 
                timeSinceLastClick < 200 
                    ? filterFrequency * 0.8
                    : filterFrequency + 2000
            );
            
            flangerDepth = Math.min(0.01, 
                timeSinceLastClick < 200
                    ? flangerDepth + 0.002
                    : Math.max(0, flangerDepth - 0.001)
            );

            // Increase pan amount with faster clicks
            panAmount = Math.min(0.8,
                timeSinceLastClick < 200
                    ? panAmount + 0.1
                    : Math.max(0, panAmount - 0.05)
            );
            panDirection *= -1; // Alternate between left and right

            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            const filterNode = audioContext.createBiquadFilter();
            const delayNode = audioContext.createDelay();
            const feedbackGain = audioContext.createGain();
            const oscillator = audioContext.createOscillator();
            const oscillatorGain = audioContext.createGain();
            const stereoPanner = audioContext.createStereoPanner();
            
            // Set up stereo panning
            stereoPanner.pan.value = panAmount * panDirection;
            
            // Rest of the audio setup...
            delayNode.delayTime.value = 0.005;
            oscillator.frequency.value = 0.5 + (flangerDepth * 100);
            oscillatorGain.gain.value = flangerDepth;
            feedbackGain.gain.value = Math.min(0.5, (20000 - filterFrequency) / 20000 * 0.8);
            
            oscillator.connect(oscillatorGain);
            oscillatorGain.connect(delayNode.delayTime);
            oscillator.start();
            
            gainNode.gain.value = 0.25;
            filterNode.type = 'lowpass';
            filterNode.frequency.value = filterFrequency;
            source.playbackRate.value = 0.98 + Math.random() * 0.04;
            
            source.buffer = audioBuffer;
            source.connect(filterNode);
            filterNode.connect(delayNode);
            filterNode.connect(stereoPanner); // Direct signal
            delayNode.connect(stereoPanner);  // Delayed signal
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            stereoPanner.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            source.start(0);
        }
        fn();
    }
</script>

{#if editorStore.editor}
<div class="controls">
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
            <IconButton Icon={IconEllipse} title="Ellipse tool (E)" onclick={() => playClickSound(() => editorStore.selectTool('ellipse'))} active={editorStore.currentTool === 'ellipse'}>
                Ellipse (E)
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
                    disabled={!editorStore.layerVisibility[i]}
                >
                    {i + 1}
                </button>
            {/each}
            <button 
                class:active={editorStore.currentLayer === 9}
                onclick={() => playClickSound(() => editorStore.selectLayer(9))}
                title="Select layer 10 (press 0)"
                class="small"
                disabled={!editorStore.layerVisibility[9]}
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