<script lang="ts">
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    import { createMapMetadata } from '$lib/utils/serialization';
    import { onMount } from 'svelte';
    import IconButton from '../IconButton.svelte';
    import IconCopy from '../icons/IconCopy.svelte';
    import IconExport from '../icons/IconExport.svelte';
    import IconSave from '../icons/IconSave.svelte';
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    let activeTab = $state<'export' | 'docs'>('export');
    let includeCustomBrushes = $state(true);
    let exportedData = $state('');

    onMount(() => {
        // Generate export data when the dialog is opened
        exportMap();
    });

    function exportMap() {
        if (!editorFSM.context.mapDataManager || !editorFSM.context.brushManager) {
            console.error('Map data manager or brush manager not initialized');
            return;
        }
        
        const mapData = editorFSM.context.mapDataManager.cloneMapData();
        const dimensions = editorFSM.context.mapDataManager.getDimensions();
        const tilemapSettings = editorFSM.context.tilemap?.getSettings();
        const customBrushes = includeCustomBrushes ? editorFSM.context.brushManager.getCustomBrushes() : undefined;
        
        if (!tilemapSettings) {
            console.error('Tilemap settings not available');
            return;
        }
        
        const metadata = createMapMetadata(
            mapData,
            dimensions,
            tilemapSettings,
            customBrushes,
        );
        
        exportedData = JSON.stringify(metadata, null, 2);
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
        removeDialog("export");
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

<Dialog title="Export Map" onClose={closeDialog}>
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
                        <p>The map data is stored in a compressed binary format, encoded as base64.</p>

                        <h5>Compressed Format (Binary)</h5>
                        <p>The binary format is structured as follows:</p>
                        <ul>
                            <li>Header (6 bytes):
                                <ul>
                                    <li>Width (2 bytes): Map width in tiles</li>
                                    <li>Height (2 bytes): Map height in tiles</li>
                                    <li>Layers (2 bytes): Number of layers in the map</li>
                                </ul>
                            </li>
                            <li>Layer Data (series of runs):
                                <ul>
                                    <li>Count (2 bytes): Number of times to repeat the value</li>
                                    <li>Value (2 bytes): The tile index (-1 for empty)</li>
                                </ul>
                            </li>
                        </ul>

                        <h5>How to Unpack Binary Data</h5>
                        <p>To decode and use the binary format in your application:</p>
                        <pre><code>{`// JavaScript example to decode binary map data
function unpackMapData(base64Data) {
    // Convert from base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const data = new Int16Array(bytes.buffer);

    // Read header
    const width = data[0];
    const height = data[1];
    const layers = data[2];
    const headerSize = 6;

    // Create the map data array
    const mapData = new Int32Array(width * height * layers);
    mapData.fill(-1); // Initialize with empty tiles
    
    let offset = headerSize;
    
    // Process each layer
    for (let layer = 0; layer < layers; layer++) {
        let index = layer * width * height;
        
        // Read runs until layer is full
        while (index < (layer + 1) * width * height && offset < data.length - 1) {
            const count = data[offset++];
            const value = data[offset++];

            if (count <= 0) continue;  // Skip invalid runs

            // Process this run
            for (let i = 0; i < count && index < (layer + 1) * width * height; i++) {
                mapData[index++] = value;
            }
        }
    }

    return {
        mapData,
        dimensions: { width, height, layers }
    };
}`}</code></pre>

                        <h5>Accessing Tile Data</h5>
                        <p>To access a specific tile in the unpacked data:</p>
                        <pre><code>{`// Get a tile at specific coordinates
function getTile(mapData, dimensions, layer, x, y) {
    const { width, height } = dimensions;
    const index = (layer * width * height) + (y * width) + x;
    return mapData[index];
}

// Example usage
const { mapData, dimensions } = unpackMapData(base64Data);
const tileValue = getTile(mapData, dimensions, 0, 10, 5); // Layer 0, x=10, y=5`}</code></pre>

                        <h5>Rendering the Map</h5>
                        <p>Basic example of rendering the map with a canvas:</p>
                        <pre><code>{`// Render map to canvas
function renderMap(mapData, dimensions, tileset, canvas) {
    const { width, height, layers } = dimensions;
    const ctx = canvas.getContext('2d');
    const tileWidth = tileset.tileWidth;
    const tileHeight = tileset.tileHeight;
    
    // Set canvas size
    canvas.width = width * tileWidth;
    canvas.height = height * tileHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create tileset image
    const tilesetImg = new Image();
    tilesetImg.onload = () => {
        // For each layer (back to front)
        for (let layer = 0; layer < layers; layer++) {
            // For each tile position
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const tileIndex = getTile(mapData, dimensions, layer, x, y);
                    
                    // Skip empty tiles
                    if (tileIndex === -1) continue;
                    
                    // Calculate tileset position
                    const tilesPerRow = Math.floor(tilesetImg.width / tileWidth);
                    const tilesetX = (tileIndex % tilesPerRow) * tileWidth;
                    const tilesetY = Math.floor(tileIndex / tilesPerRow) * tileHeight;
                    
                    // Draw the tile
                    ctx.drawImage(
                        tilesetImg,
                        tilesetX, tilesetY, tileWidth, tileHeight,
                        x * tileWidth, y * tileHeight, tileWidth, tileHeight
                    );
                }
            }
        }
    };
    tilesetImg.src = tileset.imageData; // Base64 PNG from the export
}`}</code></pre>

                        <h5>JSON Structure</h5>
                        <p>The complete exported JSON structure:</p>
                        <pre><code>{`{
    "version": 1,
    "mapData": string,  // Base64 encoded binary data
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

                        <h5>Complete Example</h5>
                        <p>Here's a complete example of loading and rendering a map:</p>
                        <pre><code>{`// Load and render a map from exported JSON
function loadMap(jsonData, canvasElement) {
    // Parse the JSON data
    const mapData = JSON.parse(jsonData);
    
    // Unpack the binary map data
    const { mapData: tileData, dimensions } = unpackMapData(mapData.mapData);
    
    // Render the map
    renderMap(tileData, dimensions, mapData.tilemap, canvasElement);
    
    return {
        tileData,
        dimensions,
        tilemap: mapData.tilemap,
        customBrushes: mapData.customBrushes
    };
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