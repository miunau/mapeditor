<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';

    let mapData = $state('');

    function importMap() {
        if (mapData && editorStore.editor) {
            try {
                const data = JSON.parse(mapData);
                // Check for version and required fields
                if (typeof data === 'object' && data.version === 1 && data.mapData && data.tilemap) {
                    editorStore.editor.importMap(data);
                    editorStore.setShowImportDialog(false);
                    mapData = '';  // Clear the textarea after successful import
                } else {
                    throw new Error('Incompatible map data version');
                }
            } catch (error) {
                console.error('Failed to import map data:', error);
                alert('Invalid or incompatible map data format');
            }
        }
    }

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            try {
                const text = await file.text();
                mapData = text;
                importMap();
            } catch (error) {
                console.error('Failed to read import file:', error);
                alert('Failed to read import file. Please check the file format.');
            }
        }
    }
</script>

<div class="dialog" class:show={editorStore.showImportDialog}>
    <h3>Import Map</h3>
    <div class="dialog-content">
        <div class="file-input">
            <label>
                Import from file:
                <input 
                    type="file" 
                    accept=".json"
                    onchange={handleFileSelect}
                />
            </label>
        </div>
        <div class="separator">
            <span>or paste JSON data</span>
        </div>
        <textarea 
            bind:value={mapData}
            placeholder="Paste map data JSON here..."
            rows="10"
        ></textarea>
        <div class="dialog-buttons">
            <button onclick={importMap}>Import</button>
            <button onclick={() => {
                editorStore.setShowImportDialog(false);
                mapData = '';  // Clear textarea when closing
            }}>Cancel</button>
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
        width: 500px;
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

    .separator {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 15px 0;
        color: #888;
    }

    .separator::before,
    .separator::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid #555;
    }

    .separator span {
        padding: 0 10px;
        font-size: 14px;
    }

    textarea {
        width: 100%;
        min-height: 200px;
        padding: 8px;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        font-family: monospace;
        resize: vertical;
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