<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte.js';
  import IconButton from '../IconButton.svelte';
  import IconCopy from '../icons/IconCopy.svelte';
  import IconExport from '../icons/IconExport.svelte';
  import IconSave from '../icons/IconSave.svelte';
    import Dialog from './Dialog.svelte';

    let activeTab = $state<'export' | 'docs'>('export');
    let useCompression = $state(true);
    let includeCustomBrushes = $state(true);
    let exportedData = $state('');

    $effect(() => {
        if (editorStore.showExportDialog && editorStore.editor) {
            exportMap();
        }
    });

    function exportMap() {
        if (!editorStore.editor) return;
        exportedData = editorStore.editor.exportMap(useCompression, includeCustomBrushes);
    }

    function downloadJson() {
        const blob = new Blob([exportedData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'map.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function closeDialog() {
        editorStore.setShowExportDialog(false);
        exportedData = '';
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(exportedData);
            alert('Copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy to clipboard');
        }
    }
</script>

<Dialog title="Export Map" show={editorStore.showExportDialog} onClose={closeDialog}>
    {#snippet buttonArea()}
        <button onclick={closeDialog}>
            Close
        </button>
    {/snippet}
    <div class="dialog-content">
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <menu role="tablist">
            <li role="tab" aria-selected={activeTab === 'export'}>
                <a href="#" onclick={(e) => { e.preventDefault(); activeTab = 'export'; }}>Export</a>
            </li>
            <li role="tab" aria-selected={activeTab === 'docs'}>
                <a href="#" onclick={(e) => { e.preventDefault(); activeTab = 'docs'; }}>Documentation</a>
            </li>
        </menu>

        <div class="window" role="tabpanel">
            <div class="window-body">
                {#if activeTab === 'export'}
                    <div class="export-options">
                        <p><strong>Export Options</strong></p>
                        <input 
                            type="checkbox" 
                            bind:checked={useCompression}
                            onchange={exportMap}
                            id="use-compression"
                        >
                        <label for="use-compression" class="checkbox-label">
                            Use compression
                            <span class="help-text">
                                {useCompression ? 
                                    '(Binary format, smaller file size)' : 
                                    '(JSON format, human readable)'}
                            </span>
                        </label>
                        <input 
                            type="checkbox" 
                            bind:checked={includeCustomBrushes}
                            onchange={exportMap}
                            id="include-custom-brushes"
                        >
                        <label for="include-custom-brushes" class="checkbox-label">
                            Include custom brushes
                            <span class="help-text">
                                (Export custom brush patterns with the map)
                            </span>
                        </label>
                    </div>
                    <div class="export-buttons">
                        <IconButton title="Download JSON" Icon={IconSave} onclick={downloadJson}>
                            Download JSON
                        </IconButton>
                        <IconButton title="Copy to Clipboard" Icon={IconCopy} onclick={copyToClipboard}>
                            Copy to Clipboard
                        </IconButton>
                    </div>
                    <div class="separator">
                        <span>or copy from here</span>
                    </div>
                    <textarea 
                        value={exportedData}
                        placeholder="Map data will appear here..."
                        rows="10"
                        readonly
                    ></textarea>
                {:else}
                    <div class="documentation">
                        <h4>Map Data Format</h4>
                        <p>The map data can be stored in two formats:</p>

                        <h5>Compressed Format (Binary)</h5>
                        <p>A compressed binary format, encoded as base64, structured as follows:</p>
                        <ul>
                            <li>Header (4 bytes):
                                <ul>
                                    <li>Width (2 bytes): Map width in tiles</li>
                                    <li>Height (2 bytes): Map height in tiles</li>
                                </ul>
                            </li>
                            <li>Layer Data (series of runs):
                                <ul>
                                    <li>Count (2 bytes): Number of times to repeat the value</li>
                                    <li>Value (2 bytes): The tile index (-1 for empty)</li>
                                </ul>
                            </li>
                        </ul>

                        <h5>Uncompressed Format (JSON)</h5>
                        <p>A standard JSON format with the following structure:</p>
                        <pre><code>{`{
    "version": 1,
    "format": "json",
    "mapData": {
        "width": number,
        "height": number,
        "layers": number[][][]  // [layer][row][column]
    },
    "tilemap": {
        "imageData": string,  // Base64 PNG
        "tileWidth": number,
        "tileHeight": number,
        "spacing": number
    },
    "customBrushes": [
        {
            "id": string,
            "name": string | null,
            "tiles": number[][],  // 2D array of tile indices
            "width": number,
            "height": number
        }
    ]
}`}</code></pre>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</Dialog>

<style>
    .dialog-content {
        display: flex;
        flex-direction: column;
        max-height: 80vh;
        width: 400px;
        overflow-y: auto;
    }

    .export-options {
        display: block;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 10px;
    }
    .help-text {
        color: #555;
        margin-left: 0.25rem;
    }

    .export-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }

    .separator {
        display: flex;
        align-items: center;
        text-align: center;
        margin: 15px 0;
    }

    .separator::before,
    .separator::after {
        content: '';
        flex: 1;
        border-bottom: 1px solid #555;
    }

    .separator span {
        padding: 0 10px;
    }

    textarea {
        width: 100%;
        min-height: 200px;
        font-family: monospace;
        resize: vertical;
    }

    .documentation h4 {
        margin: 0 0 15px 0;
    }

    .documentation h5 {
        margin: 15px 0 8px 0;
    }

    .documentation p {
        margin: 8px 0;
    }

    .documentation ul {
        margin: 8px 0;
        padding-left: 20px;
    }

    .documentation li {
        margin: 4px 0;
    }

    .documentation pre {
        padding: 12px;
        border-radius: 4px;
        overflow-x: auto;
        margin: 12px 0;
    }
</style> 