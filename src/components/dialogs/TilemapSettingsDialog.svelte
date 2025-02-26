<script lang="ts">
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    import type { TilemapSettings } from '$lib/utils/settings';
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    import { onMount } from 'svelte';

    let fileInput: HTMLInputElement;
    let settings = $state<TilemapSettings>({
        imageUrl: '',
        tileWidth: 16,
        tileHeight: 16,
        spacing: 1
    });

    onMount(() => {
        settings = editorFSM.context.tilemap?.getSettings() ?? {
            imageUrl: '/tilemap.png',
            tileWidth: 16,
            tileHeight: 16,
            spacing: 1
        };
    });

    function closeDialog() {
        removeDialog("tilemap-settings");
    }

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // Create a blob URL for the selected file
            const url = URL.createObjectURL(file);
            settings.imageUrl = url;
        }
    }

    // Cleanup blob URL when dialog is closed
    $effect(() => {
        if (settings.imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(settings.imageUrl);
        }
        if (fileInput) {
            fileInput.value = '';
        }
    });

    async function updateSettings() {
        try {
            await editorFSM.send('updateTilemapSettings', settings);
            closeDialog();
        } catch (error) {
            console.error('Failed to update tilemap settings:', error);
            alert('Failed to update tilemap settings. Please check the values.');
        }
    }
</script>

<Dialog title="Tilemap Settings" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={updateSettings}>Apply</button>
        <button onclick={closeDialog}>Cancel</button>
    {/snippet}

    {#if settings.imageUrl}
        <div class="image-preview">
            <img src={settings.imageUrl} alt="Tilemap preview" />
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