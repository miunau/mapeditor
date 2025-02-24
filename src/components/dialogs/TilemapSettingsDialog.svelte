<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte.js';
    import Dialog from './Dialog.svelte';

    let fileInput: HTMLInputElement;
    let settings = $state({
        url: '',
        tileWidth: 16,
        tileHeight: 16,
        spacing: 1
    });

    $effect(() => {
        if (editorStore.showTilemapDialog && editorStore.editor) {
            settings = editorStore.editor.getTilemapSettings();
        }
    });

    function closeDialog() {
        // Reset to current settings when closing without applying
        if (editorStore.editor) {
            settings = editorStore.editor.getTilemapSettings();
        }
        editorStore.setShowTilemapDialog(false);
    }

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // Create a blob URL for the selected file
            const url = URL.createObjectURL(file);
            settings.url = url;
        }
    }

    // Cleanup blob URL when dialog is closed
    $effect(() => {
        if (!editorStore.showTilemapDialog) {
            if (settings.url.startsWith('blob:')) {
                URL.revokeObjectURL(settings.url);
            }
            if (fileInput) {
                fileInput.value = '';
            }
        }
    });

    async function updateSettings() {
        if (!editorStore.editor) return;
        
        try {
            await editorStore.editor.changeTilemap(
                settings.url,
                settings.tileWidth,
                settings.tileHeight,
                settings.spacing
            );
            editorStore.setShowTilemapDialog(false);
        } catch (error) {
            console.error('Failed to update tilemap settings:', error);
            alert('Failed to update tilemap settings. Please check the values.');
        }
    }
</script>

<Dialog title="Tilemap Settings" onClose={closeDialog} show={editorStore.showTilemapDialog}>
    {#if settings.url}
        <div class="image-preview">
            <img src={settings.url} alt="Tilemap preview" />
        </div>
    {/if}
    <div class="dialog-content">
        <label>
            Tilemap Image:
            <input 
                type="file" 
                accept="image/*"
                onchange={handleFileSelect}
                bind:this={fileInput}
            />
        </label>
        <label>
            Tile Width:
            <input 
                type="number" 
                bind:value={settings.tileWidth} 
                min="1" 
                max="128"
            />
        </label>
        <label>
            Tile Height:
            <input 
                type="number" 
                bind:value={settings.tileHeight} 
                min="1" 
                max="128"
            />
        </label>
        <label>
            Spacing:
            <input 
                type="number" 
                bind:value={settings.spacing} 
                min="0" 
                max="16"
            />
        </label>
        <div class="dialog-buttons">
            <button onclick={updateSettings}>Apply</button>
            <button onclick={closeDialog}>Cancel</button>
        </div>
    </div>
</Dialog>

<style>
    .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 11px;
        margin-top: 16px;
    }

    label {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 10px;
    }

    .image-preview {
        margin-top: 10px;
        align-items: center;
        justify-content: center;
        display: flex;
    }

    .image-preview img {
        max-width: 100%;
        max-height: 200px;
        object-fit: contain;
        display: block;
    }
</style> 