<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';

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

<div class="dialog" class:show={editorStore.showExportDialog}>
    <h3>Export Map</h3>
    <div class="dialog-content">
        <div class="tab-buttons">
            <button 
                class:active={activeTab === 'export'}
                onclick={() => activeTab = 'export'}
            >
                Export
            </button>
            <button 
                class:active={activeTab === 'docs'}
                onclick={() => activeTab = 'docs'}
            >
                Documentation
            </button>
        </div>

        {#if activeTab === 'export'}
            <div class="export-options">
                <label class="checkbox-label">
                    <input 
                        type="checkbox" 
                        bind:checked={useCompression}
                        onchange={exportMap}
                    >
                    Use compression
                    <span class="help-text">
                        {useCompression ? 
                            '(Binary format, smaller file size)' : 
                            '(JSON format, human readable)'}
                    </span>
                </label>
                <label class="checkbox-label">
                    <input 
                        type="checkbox" 
                        bind:checked={includeCustomBrushes}
                        onchange={exportMap}
                    >
                    Include custom brushes
                    <span class="help-text">
                        (Export custom brush patterns with the map)
                    </span>
                </label>
            </div>
            <div class="export-buttons">
                <button onclick={downloadJson} class="primary-button">
                    💾 Download JSON
                </button>
                <button onclick={copyToClipboard}>
                    🔗 Copy to Clipboard
                </button>
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

        <div class="dialog-buttons">
            <button onclick={() => {
                editorStore.setShowExportDialog(false);
                exportedData = '';
            }}>Close</button>
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
        width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    }

    .tab-buttons {
        display: flex;
        gap: 1px;
        margin-bottom: 15px;
        background: #444;
        padding: 2px;
        border-radius: 4px;
    }

    .tab-buttons button {
        flex: 1;
        background: #555;
        border: none;
        padding: 8px 16px;
        color: #ccc;
        border-radius: 3px;
    }

    .tab-buttons button:hover {
        background: #666;
    }

    .tab-buttons button.active {
        background: #2a6;
        color: white;
    }

    .export-options {
        margin-bottom: 15px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        color: #eee;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        margin: 0;
    }

    .help-text {
        color: #999;
        font-size: 0.9em;
        margin-left: 0.25rem;
    }

    .export-buttons {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
    }

    .export-buttons button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 36px;
    }

    .primary-button {
        background: #2a6;
        border-color: #3b7;
    }

    .primary-button:hover {
        background: #3b7;
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

    textarea[readonly] {
        background: #333;
        cursor: text;
    }

    .documentation {
        color: #eee;
        font-size: 14px;
        line-height: 1.5;
    }

    .documentation h4 {
        margin: 0 0 15px 0;
        font-size: 16px;
    }

    .documentation h5 {
        margin: 15px 0 8px 0;
        font-size: 14px;
        color: #2a6;
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
        background: #333;
        padding: 12px;
        border-radius: 4px;
        overflow-x: auto;
        margin: 12px 0;
    }

    .documentation code {
        font-family: monospace;
        font-size: 13px;
        line-height: 1.4;
        white-space: pre-wrap;
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