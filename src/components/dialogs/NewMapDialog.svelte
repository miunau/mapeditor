<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';

    let width = $state(20);
    let height = $state(15);

    $effect(() => {
        if (editorStore.showNewMapDialog && editorStore.editor) {
            const dims = editorStore.editor.getMapDimensions();
            width = dims.width;
            height = dims.height;
        }
    });

    function createNewMap() {
        if (width > 0 && height > 0 && editorStore.editor) {
            editorStore.editor.newMap(width, height);
            editorStore.setShowNewMapDialog(false);
        }
    }
</script>

<div class="dialog" class:show={editorStore.showNewMapDialog}>
    <h3>New Map</h3>
    <div class="dialog-content">
        <label>
            Width:
            <input type="number" bind:value={width} min="1" max="100" />
        </label>
        <label>
            Height:
            <input type="number" bind:value={height} min="1" max="100" />
        </label>
        <div class="dialog-buttons">
            <button onclick={createNewMap}>Create</button>
            <button onclick={() => editorStore.setShowNewMapDialog(false)}>Cancel</button>
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