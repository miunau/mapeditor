<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';
    import type { ResizeAlignment } from '../../lib/mapeditor';

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
            editorStore.setShowResizeDialog(false);
        }
    }
</script>

<div class="dialog" class:show={editorStore.showResizeDialog}>
    <h3>Resize Map</h3>
    <div class="dialog-content">
        <label>
            Width:
            <input type="number" bind:value={width} min="1" max="100" />
        </label>
        <label>
            Height:
            <input type="number" bind:value={height} min="1" max="100" />
        </label>
        <div class="alignment-picker">
            <h4>Content Alignment</h4>
            <div class="alignment-grid">
                {#each alignments as align}
                    <button 
                        class:selected={selectedAlignment === align}
                        onclick={() => selectedAlignment = align}
                        title={align}
                    >
                        <div class="dot"></div>
                    </button>
                {/each}
            </div>
        </div>
        <div class="dialog-buttons">
            <button onclick={resizeMap}>Resize</button>
            <button onclick={() => editorStore.setShowResizeDialog(false)}>Cancel</button>
        </div>
    </div>
</div>

<style>
    .dialog {
        display: none;
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
    }

    .dialog.show {
        display: block;
    }

    h3 {
        margin: 0 0 15px 0;
        font-size: 18px;
    }

    h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
    }

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

    input {
        width: 80px;
        padding: 5px;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        font-size: 14px;
    }

    .alignment-picker {
        margin-top: 10px;
    }

    .alignment-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin: 0 auto;
    }

    .alignment-grid button {
        width: 35px;
        height: 35px;
        padding: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
    }

    .alignment-grid button:hover {
        background: #555;
    }

    .alignment-grid button.selected {
        background: #666;
        border-color: #888;
    }

    .alignment-grid .dot {
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
    }

    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 10px;
    }

    button {
        min-width: 80px;
        padding: 8px 16px;
        background: #555;
        border: 1px solid #666;
        border-radius: 4px;
        color: white;
        cursor: pointer;
    }

    button:hover {
        background: #666;
    }
</style> 