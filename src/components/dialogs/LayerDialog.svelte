<script lang="ts">
    import IconDrag from '../icons/IconDrag.svelte';
    import { removeDialog } from './diag.svelte.js';
    import Dialog from './Dialog.svelte';
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    function closeDialog() {
        removeDialog("layers");
    }

    let layerNames = $state(Array(10).fill('').map((_, i) => `Layer ${i + 1}`));
    let draggedLayer: number | null = $state(null);

    function handleDragStart(e: DragEvent, layerIndex: number) {
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            draggedLayer = layerIndex;
        }
    }

    function handleDrop(e: DragEvent, targetIndex: number) {
        e.preventDefault();
        if (draggedLayer !== null && draggedLayer !== targetIndex) {
            // Create new arrays for names and visibilities
            const newNames = [...layerNames];
            const visibilities = [...editorFSM.context.layerVisibility];
            
            // Store the dragged items
            const draggedName = newNames[draggedLayer];
            const draggedVisibility = visibilities[draggedLayer];
            
            // Remove items from original position
            newNames.splice(draggedLayer, 1);
            visibilities.splice(draggedLayer, 1);
            
            // Insert items at new position
            newNames.splice(targetIndex, 0, draggedName);
            visibilities.splice(targetIndex, 0, draggedVisibility);
            
            // Update the arrays
            layerNames = newNames;
            editorFSM.send('toggleLayerVisibility', draggedLayer);
            editorFSM.send('toggleLayerVisibility', targetIndex);
            
            // Move the layer in the editor
            editorFSM.send('moveLayer', draggedLayer, targetIndex);
            
            // Update current layer selection if needed
            if (editorFSM.context.currentLayer === draggedLayer) {
                editorFSM.send('selectLayer', targetIndex);
            } else if (editorFSM.context.currentLayer > draggedLayer && editorFSM.context.currentLayer <= targetIndex) {
                editorFSM.send('selectLayer', editorFSM.context.currentLayer - 1);
            } else if (editorFSM.context.currentLayer < draggedLayer && editorFSM.context.currentLayer >= targetIndex) {
                editorFSM.send('selectLayer', editorFSM.context.currentLayer + 1);
            }
        }
        draggedLayer = null;
    }

    function handleDragEnd() {
        draggedLayer = null;
    }

    function handleLayerNameChange(index: number, newName: string) {
        const newNames = [...layerNames];
        newNames[index] = newName || `Layer ${index + 1}`;
        layerNames = newNames;
    }

    // Check if all layers are visible
    let areAllLayersVisible = $derived(editorFSM.context.layerVisibility.every(v => v));
</script>

<Dialog title="Layer Manager" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button class="close-button" onclick={closeDialog}>Close</button>
    {/snippet}

    <div class="layer-list">
        <div class="layer-header">
            <button 
                class="show-all-button"
                onclick={() => areAllLayersVisible ? editorFSM.send('disableAllLayers') : editorFSM.send('enableAllLayers')}
                title={areAllLayersVisible ? 'Disable all layers' : 'Enable all layers'}
            >
                {areAllLayersVisible ? 'Disable All Layers' : 'Enable All Layers'}
            </button>
        </div>

        {#each Array(editorFSM.context.MAX_LAYERS) as _, i}
            {@const layerIndex = editorFSM.context.MAX_LAYERS - 1 - i}
            <div 
                role="listitem"
                class="layer-item" 
                class:active={editorFSM.context.currentLayer === layerIndex}
                class:dragging={draggedLayer === layerIndex}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => handleDrop(e, layerIndex)}
            >
                <div class="layer-item-header">
                    <div 
                        role="button"
                        tabindex="0"
                        class="drag-handle button-none small"
                        draggable="true"
                        ondragstart={(e) => handleDragStart(e, layerIndex)}
                        ondragend={handleDragEnd}
                        title="Drag to reorder layer"
                    >
                        <IconDrag />
                    </div>
                    <span class="layer-number">{layerIndex + 1}</span>
                    <button 
                        class="visibility-toggle"
                        class:active={editorFSM.context.layerVisibility[layerIndex]}
                        onclick={() => editorFSM.send('toggleLayerVisibility', layerIndex)}
                        title={editorFSM.context.layerVisibility[layerIndex] ? 'Disable layer' : 'Enable layer'}
                    >
                        {editorFSM.context.layerVisibility[layerIndex] ? 'Enabled' : 'Disabled'}
                    </button>
                    <input 
                        type="text"
                        class="layer-name"
                        value={layerNames[layerIndex]}
                        onchange={(e) => handleLayerNameChange(layerIndex, (e.target as HTMLInputElement).value)}
                        title={`Layer ${layerIndex + 1} (press ${layerIndex === 9 ? '0' : layerIndex + 1})`}
                        disabled={!editorFSM.context.layerVisibility[layerIndex]}
                    />
                </div>
            </div>
        {/each}
    </div>
</Dialog>

<style>
    .layer-list {
        display: flex;
        flex-direction: column;
        gap: 0px;
        overflow-y: auto;
        position: relative;
    }

    .layer-header {
        display: flex;
        justify-content: center;
        margin-bottom: 8px;
    }

    .show-all-button {
        width: 100%;
        padding: 8px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    .layer-item {
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 2px 0;
        position: relative;
        height: 34px;
    }

    .layer-item.dragging {
        opacity: 0.5;
    }

    .layer-item-header {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .drag-handle {
        cursor: grab;
        user-select: none;
        color: var(--button-face);
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
    }

    .drag-handle:active {
        cursor: grabbing;
    }

    .layer-number {
        min-width: 12px;
        text-align: right;
        color: var(--button-face);
        user-select: none;
    }
</style> 