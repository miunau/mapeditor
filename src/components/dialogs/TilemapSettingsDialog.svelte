<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';

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

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // Create a blob URL for the selected file
            const url = URL.createObjectURL(file);
            settings.url = url;
        }
    }

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

<div class="dialog" class:show={editorStore.showTilemapDialog}>
    <h3>Tilemap Settings</h3>
    <div class="dialog-content">
        <div class="file-input">
            <label>
                Tilemap Image:
                <input 
                    type="file" 
                    accept="image/*"
                    onchange={handleFileSelect}
                />
            </label>
        </div>
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
            <button onclick={() => editorStore.setShowTilemapDialog(false)}>Cancel</button>
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

    .file-input {
        margin-bottom: 10px;
    }

    .file-input label {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .file-input input[type="file"] {
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        padding: 5px;
        cursor: pointer;
        width: 100%;
    }

    .file-input input[type="file"]::-webkit-file-upload-button {
        background: #666;
        border: none;
        border-radius: 4px;
        color: white;
        padding: 8px 16px;
        margin-right: 10px;
        cursor: pointer;
    }

    .file-input input[type="file"]::-webkit-file-upload-button:hover {
        background: #777;
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