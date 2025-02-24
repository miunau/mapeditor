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
    {#snippet buttonArea()}
        <button onclick={updateSettings}>Apply</button>
        <button onclick={closeDialog}>Cancel</button>
    {/snippet}

    {#if settings.url}
        <div class="image-preview">
            <img src={settings.url} alt="Tilemap preview" />
        </div>
    {/if}
    <div class="dialog-content">
        <div class="fields row">
            <div class="field">
                <label for="tilemap-image">
                    Tilemap Image:
                </label>
                <input 
                    id="tilemap-image"
                    type="file" 
                    accept="image/*"
                    onchange={handleFileSelect}
                    bind:this={fileInput}
                />
            </div>
        </div>
        <div class="fields row">
            <div class="field">
                <label for="tile-width">
                    Tile Width:
                </label>
                <input 
                    id="tile-width"
                    type="number" 
                    bind:value={settings.tileWidth} 
                    min="1" 
                    max="128"
            />
            </div>
            <div class="field">
                <label for="tile-height">
                    Tile Height:
                </label>
                <input 
                    id="tile-height"
                    type="number" 
                    bind:value={settings.tileHeight} 
                    min="1" 
                    max="128"
                />
            </div>
            <div class="field">
                <label for="spacing">
                    Spacing:
                </label>
                <input 
                    id="spacing"
                    type="number" 
                    bind:value={settings.spacing} 
                    min="0" 
                    max="16"
                />
            </div>
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