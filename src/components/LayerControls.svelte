<script lang="ts">
    import { editorStore } from '../lib/state/EditorStore.svelte';

    let layerNames = $state(Array(10).fill('').map((_, i) => `Layer ${i + 1}`));
    let draggedLayer: number | null = $state(null);
    let dragOverLayer: number | null = $state(null);

    function handleDragStart(e: DragEvent, layerIndex: number) {
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            draggedLayer = layerIndex;
        }
    }

    function handleDragOver(e: DragEvent, layerIndex: number) {
        e.preventDefault();
        if (draggedLayer !== null && draggedLayer !== layerIndex) {
            dragOverLayer = layerIndex;
        }
    }

    function handleDrop(e: DragEvent, targetIndex: number) {
        e.preventDefault();
        if (draggedLayer !== null && draggedLayer !== targetIndex) {
            // Swap layer data in the editor
            editorStore.editor?.swapLayers(draggedLayer, targetIndex);
            
            // Swap layer names
            const newNames = [...layerNames];
            [newNames[draggedLayer], newNames[targetIndex]] = [newNames[targetIndex], newNames[draggedLayer]];
            layerNames = newNames;
        }
        draggedLayer = null;
        dragOverLayer = null;
    }

    function handleDragEnd() {
        draggedLayer = null;
        dragOverLayer = null;
    }

    function handleLayerNameChange(index: number, newName: string) {
        const newNames = [...layerNames];
        newNames[index] = newName || `Layer ${index + 1}`;
        layerNames = newNames;
    }
</script>

<div class="layer-controls">
    <div class="layer-header">
        <h3>Layers</h3>
        <button 
            class:active={editorStore.currentLayer === -1}
            onclick={() => editorStore.selectLayer(-1)}
            title="Show all layers (press §)"
        >
            {editorStore.currentLayer === -1 ? 'Hide All' : 'Show All'}
        </button>
    </div>

    <div class="layer-list">
        {#each Array(editorStore.MAX_LAYERS) as _, i}
            {@const layerIndex = editorStore.MAX_LAYERS - 1 - i}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div 
                class="layer-item" 
                class:active={editorStore.currentLayer === layerIndex}
                class:dragging={draggedLayer === layerIndex}
                class:drag-over={dragOverLayer === layerIndex}
                draggable="true"
                ondragstart={(e) => handleDragStart(e, layerIndex)}
                ondragover={(e) => handleDragOver(e, layerIndex)}
                ondrop={(e) => handleDrop(e, layerIndex)}
                ondragend={handleDragEnd}
            >
                <div class="layer-item-header">
                    <button 
                        class="visibility-toggle"
                        onclick={() => editorStore.toggleLayerVisibility(layerIndex)}
                        title={editorStore.layerVisibility[layerIndex] ? 'Hide layer' : 'Show layer'}
                    >
                        {editorStore.layerVisibility[layerIndex] ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <input 
                        type="text"
                        class="layer-name"
                        value={layerNames[layerIndex]}
                        onchange={(e) => handleLayerNameChange(layerIndex, (e.target as HTMLInputElement).value)}
                        onclick={() => editorStore.selectLayer(layerIndex)}
                        title={`Select layer ${layerIndex + 1} (press ${layerIndex === 9 ? '0' : layerIndex + 1})`}
                    />
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .layer-controls {
        position: absolute;
        top: 60px;
        right: 10px;
        width: 250px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 8px;
        border: 1px solid #555;
        color: white;
        padding: 15px;
    }

    .layer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }

    .layer-header h3 {
        margin: 0;
        font-size: 16px;
    }

    .layer-header button {
        background: #555;
        border: 1px solid #666;
        border-radius: 4px;
        color: white;
        padding: 4px 8px;
        cursor: pointer;
    }

    .layer-header button:hover {
        background: #666;
    }

    .layer-header button.active {
        background: #00aa00;
        border-color: #00cc00;
    }

    .layer-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 400px;
        overflow-y: auto;
    }

    .layer-item {
        background: #444;
        border-radius: 4px;
        padding: 8px;
        cursor: move;
    }

    .layer-item.active {
        background: #555;
        border: 1px solid #666;
    }

    .layer-item.dragging {
        opacity: 0.5;
    }

    .layer-item.drag-over {
        border: 2px dashed #00aa00;
    }

    .layer-item-header {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .visibility-toggle {
        width: 24px;
        height: 24px;
        padding: 0;
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .layer-name {
        flex: 1;
        background: #333;
        border: 1px solid #444;
        border-radius: 4px;
        color: white;
        padding: 4px 8px;
    }

    .layer-name:hover {
        background: #3a3a3a;
    }

    .layer-name:focus {
        outline: none;
        border-color: #00aa00;
    }
</style> 