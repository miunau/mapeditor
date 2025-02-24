<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte.js';
    import type { ResizeAlignment } from '../../lib/types/map.js';
    import Dialog from './Dialog.svelte';

    let width = $state(20);
    let height = $state(15);
    let selectedAlignment = $state<ResizeAlignment>('middle-center');

    const alignments = [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-center', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
    ] as const;

    $effect(() => {
        if (editorStore.showResizeDialog && editorStore.editor) {
            const dims = editorStore.editor.getMapDimensions();
            width = dims.width;
            height = dims.height;
        }
    });

    function resizeMap() {
        if (width > 0 && height > 0 && editorStore.editor) {
            editorStore.editor.resizeMap(width, height, selectedAlignment);
            closeDialog();
        }
    }

    function closeDialog() {
        editorStore.setShowResizeDialog(false);
    }
</script>

<Dialog title="Resize Map" show={editorStore.showResizeDialog} onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={resizeMap}>Resize</button>
        <button onclick={closeDialog}>Cancel</button>
    {/snippet}

    <div class="dialog-content">
        <label>
            Width:
            <input type="number" bind:value={width} min="1" max="100" />
        </label>
        <label>
            Height:
            <input type="number" bind:value={height} min="1" max="100" />
        </label>
        <hr/>
        <h4>Content Alignment</h4>
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