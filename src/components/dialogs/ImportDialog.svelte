<script lang="ts">
    import { removeDialog } from './diag.svelte.js';
    import Dialog from './Dialog.svelte';
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    let mapData = $state('');

    function importMap() {
        if (mapData) {
            try {
                const data = JSON.parse(mapData);
                // Check for version and required fields
                if (typeof data === 'object' && data.version === 1 && data.mapData && data.tilemap) {
                    editorFSM.send('importMap', data);
                    closeDialog();
                } else {
                    throw new Error('Incompatible map data version');
                }
            } catch (error) {
                console.error('Failed to import map data:', error);
                alert('Invalid or incompatible map data format');
            }
        }
    }

    function closeDialog() {
        removeDialog("import");
        mapData = '';  // Clear textarea when closing
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

<Dialog title="Import Map" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={importMap}>Import</button>
        <button onclick={closeDialog}>Cancel</button>
    {/snippet}

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
    </div>
</Dialog>

<style>
    .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 15px;
        width: 500px;
    }

    .file-input label {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .separator {
        display: flex;
        align-items: center;
        text-align: center;
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
</style> 