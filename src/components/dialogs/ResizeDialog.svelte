<script lang="ts">
    import type { ResizeAlignment } from '$lib/utils/map.js';
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    import { onMount } from 'svelte';
    
    let width = $state(20);
    let height = $state(15);
    let selectedAlignment = $state<ResizeAlignment>('middle-center');

    const alignments = [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-center', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
    ] as const;

    onMount(() => {
        width = editorFSM.context.mapWidth;
        height = editorFSM.context.mapHeight;
    });

    function resizeMap() {
        if (width > 0 && height > 0) {
            editorFSM.send('resizeMap', { width, height, alignment: selectedAlignment });
            closeDialog();
        }
    }

    function closeDialog() {
        removeDialog("resize-map");
    }
</script>

<Dialog title="Resize Map" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={resizeMap}>Resize</button>
        <button onclick={closeDialog}>Cancel</button>
    {/snippet}

    <div class="dialog-content">
        <div class="fields row">
            <div class="field">
                <label for="width">
                    Width:
                </label>
                <input id="width" type="number" bind:value={width} min="1" max="100" />
            </div>
            <div class="field">
                <label for="height">
                    Height:
                </label>
                <input id="height" type="number" bind:value={height} min="1" max="100" />
            </div>
        </div>
        <hr/>
        <h4>Content alignment</h4>
        <div class="alignment-picker">
            <div class="alignment-grid">
                {#each alignments as align}
                    <button 
                        class:active={selectedAlignment === align}
                        onclick={() => selectedAlignment = align}
                        title={align}
                        aria-label={align}
                    >
                        <div class="dot"></div>
                    </button>
                {/each}
            </div>
        </div>
    </div>
</Dialog>

<style>
    .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
    }

    .alignment-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin: 0 auto;
    }

    .alignment-grid button {
        width: 30px;
        height: 30px;
        padding: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .alignment-grid .dot {
        width: 6px;
        height: 6px;
        background: white;
        border-radius: 50%;
    }
    .alignment-grid button.active .dot {
        width: 8px;
        height: 8px;
        background: black;
    }
</style> 