<script lang="ts">
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    import { onMount } from 'svelte';

    let width = $state(20);
    let height = $state(15);

    onMount(() => {
        width = editorFSM.context.mapWidth;
        height = editorFSM.context.mapHeight;
    });

    function createNewMap() {
        if (width > 0 && height > 0) {
            editorFSM.send('newMap', { width, height });
            closeDialog();
        }
    }

    function closeDialog() {
        removeDialog("new-map");
    }
</script>

<Dialog title="New Map" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={createNewMap}>Create</button>
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
</style> 