<script lang="ts">
    import { editorFSM } from '../lib/state/EditorStore.svelte';
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
    import LayerDialog from './dialogs/LayerDialog.svelte';
  import { addDialog } from './dialogs/diag.svelte';

    function resetZoom() {
        editorFSM.send('setZoom', 1);
    }

    function handleToolbarZoom(direction: 'up' | 'down') {
        editorFSM.send('setZoom', findClosestZoomLevel(editorFSM.context.zoomLevel, direction, 'coarse'));
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

<div class="controls">
    <IconButton Icon={IconGrid} title="Toggle grid (V)" onclick={() => playClickSound(() => editorFSM.send('toggleGrid'))} active={editorFSM.context.showGrid}>
        Grid (V)
    </IconButton>
    <div class="brush-controls">
        <div class="tool-buttons">
            <IconButton Icon={IconBrush} title="Brush tool (B)" onclick={() => playClickSound(() => editorFSM.send('selectTool', 'brush'))} active={editorFSM.context.currentTool === 'brush'}>
                Brush (B)
            </IconButton>
            <IconButton Icon={IconPaintBucket} title="Flood fill tool (G)" onclick={() => playClickSound(() => editorFSM.send('selectTool', 'fill'))} active={editorFSM.context.currentTool === 'fill'}>
                Fill (G)
            </IconButton>
            <IconButton Icon={IconRectangle} title="Rectangle tool (R)" onclick={() => playClickSound(() => editorFSM.send('selectTool', 'rectangle'))} active={editorFSM.context.currentTool === 'rectangle'}>
                Rect (R)
            </IconButton>
            <IconButton Icon={IconEllipse} title="Ellipse tool (E)" onclick={() => playClickSound(() => editorFSM.send('selectTool', 'ellipse'))} active={editorFSM.context.currentTool === 'ellipse'}>
                Ellipse (E)
            </IconButton>
        </div>
    </div>
    <div class="stack">
        <span><IconBrush /> Size (Z/X)</span>
        <div class="buttons">
            <button 
                onclick={() => playClickSound(() => editorFSM.send('setBrushSize', editorFSM.context.brushSize - 1))}
                title="Decrease brush size (Z)"
                class="small bold"
            >-</button>
            <span class="brush-size">{editorFSM.context.brushSize}</span>
            <button 
                onclick={() => playClickSound(() => editorFSM.send('setBrushSize', editorFSM.context.brushSize + 1))}
                title="Increase brush size (X)"
                class="small bold"
            >+</button>
        </div>
    </div>
    <div class="stack">
        <span>
            <IconLayer /> Layers (0-9)
            <button class="small" onclick={() => playClickSound(() => addDialog("layers", LayerDialog))}>Edit..</button>
        </span>
        <div class="buttons">
            <button 
                class:active={editorFSM.context.currentLayer === -1}
                onclick={() => editorFSM.send('selectLayer', -1)}
                title="Show all layers (press §)"
                class="small bold"
            >
                All
            </button>
            {#each Array(editorFSM.context.layerCount) as _, i}
                <button 
                    class:active={editorFSM.context.currentLayer === i}
                    onclick={() => playClickSound(() => editorFSM.send('selectLayer', i))}
                    class="small"
                    title="Select layer {i + 1} (press {i + 1})"
                    disabled={!editorFSM.context.layerVisibility[i]}
                >
                    {i + 1}
                </button>
            {/each}
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
            >{Math.round(editorFSM.context.zoomLevel * 100)}%</button>
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