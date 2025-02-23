<script lang="ts">
    import "./style.css";
    import { MapEditor, type ResizeAlignment } from "$lib/mapeditor";
    import { onMount } from "svelte";
    import { base } from "$app/paths";
    let editorCanvas: HTMLCanvasElement | undefined = $state();
    let editor: MapEditor | undefined;
    let animationFrame: number;
    let mapData: string = $state('');
    let showShortcuts: boolean = $state(false);
    let mapWidth: number = $state(64);
    let mapHeight: number = $state(32);
    let showNewMapDialog: boolean = $state(false);
    let showResizeDialog: boolean = $state(false);
    let newWidth: number = $state(20);
    let newHeight: number = $state(15);
    let selectedAlignment: string = $state('middle-center');
    let currentLayer: number = $state(0);
    let brushSize: number = $state(1);
    let isFloodFillMode: boolean = $state(false);
    let currentTool: 'brush' | 'fill' = $state('brush');
    let zoomLevel: number = $state(1);
    let showTilemapDialog: boolean = $state(false);
    let showImportDialog: boolean = $state(false);
    let showExportDialog: boolean = $state(false);
    let exportedData: string = $state('');
    let activeExportTab: 'export' | 'docs' = $state('export');
    const url = `${base}/tilemap.png`;
    let tilemapSettings = $state({
        url: url,
        tileWidth: 16,
        tileHeight: 16,
        spacing: 1
    });
    let showGrid: boolean = $state(true);
    let useCompression: boolean = $state(true);

    // Define available zoom levels as percentages
    const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

    $effect(() => {
        if (editor) {
            currentLayer = editor.currentLayer;
            brushSize = editor.brushSize;
            isFloodFillMode = editor.isFloodFillMode;
            currentTool = isFloodFillMode ? 'fill' : 'brush';
            zoomLevel = editor.zoomLevel;
            showGrid = editor.showGrid;
        }
    });

    onMount(() => {
        if (editorCanvas && !editor) {  // Only create editor if it doesn't exist
            editor = new MapEditor(editorCanvas, mapWidth, mapHeight);
            tilemapSettings.url = url;
            initEditor();
        }

        return () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            // Clean up event listeners
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('resize', handleResize);
        };
    });

    async function initEditor() {
        if (!editor) return;
        
        await editor.init();
        // Get initial tilemap settings
        tilemapSettings = editor.getTilemapSettings();
        editorLoop();

        // Set up event listeners
        editorCanvas!.addEventListener('mousedown', handleMouseDown);
        editorCanvas!.addEventListener('mousemove', handleMouseMove);
        editorCanvas!.addEventListener('zoomchange', ((e: CustomEvent<{zoomLevel: number}>) => {
            zoomLevel = e.detail.zoomLevel;
        }) as EventListener);
        editorCanvas!.addEventListener('tilemapchange', ((e: CustomEvent<{
            url: string,
            tileWidth: number,
            tileHeight: number,
            spacing: number
        }>) => {
            tilemapSettings = e.detail;
        }) as EventListener);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Prevent context menu on right click
        editorCanvas!.addEventListener('contextmenu', (e) => e.preventDefault());

        // Initial resize and center
        handleResize();
        editor.centerMap();
    }

    function handleKeyDown(e: KeyboardEvent) {
        // Skip handling if target is an input element
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        if (e.key === '?' || (e.key === 'h' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            showShortcuts = !showShortcuts;
            return;
        }

        if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            exportMap();
            return;
        }

        if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            showImportDialog = true;
            return;
        }

        // Add undo/redo handling
        if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (editor) {
                if (e.shiftKey) {
                    editor.redo();
                } else {
                    editor.undo();
                }
            }
            return;
        }

        // Add "All layers" shortcut
        if (e.key === '§' || e.key === '±') {
            e.preventDefault();
            if (editor) {
                editor.currentLayer = -1;
                currentLayer = -1;
            }
            return;
        }

        // Update current layer when number keys are pressed
        if (/^\d$/.test(e.key)) {
            const num = parseInt(e.key);
            if (editor) {
                // Convert key 1-9 to index 0-8, key 0 to index 9
                const layerIndex = num === 0 ? 9 : num - 1;
                editor.currentLayer = layerIndex;
                currentLayer = layerIndex;
            }
            return;
        }

        // Add tool shortcuts
        if (e.key.toLowerCase() === 'b') {
            e.preventDefault();
            if (editor) {
                editor.isFloodFillMode = false;
                isFloodFillMode = false;
                currentTool = 'brush';
            }
            return;
        }
        if (e.key.toLowerCase() === 'g') {
            e.preventDefault();
            if (editor) {
                editor.isFloodFillMode = true;
                isFloodFillMode = true;
                currentTool = 'fill';
            }
            return;
        }

        // Add brush size controls
        if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (!e.ctrlKey && !e.metaKey) {  // Only if not using Ctrl/Cmd+Z for undo
                if (editor) {
                    editor.setBrushSize(editor.brushSize - 1);
                    brushSize = editor.brushSize;
                }
            }
            return;
        }
        if (e.key.toLowerCase() === 'x') {
            e.preventDefault();
            if (editor) {
                editor.setBrushSize(editor.brushSize + 1);
                brushSize = editor.brushSize;
            }
            return;
        }

        // Add zoom keyboard shortcuts
        if (e.key === '=' || (e.key === '+' && !e.shiftKey)) {
            e.preventDefault();
            zoomIn();
            return;
        }
        if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            zoomOut();
            return;
        }
        if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            resetZoom();
            return;
        }

        // Add grid toggle shortcut
        if (e.key === 'v') {
            e.preventDefault();
            if (editor) {
                editor.showGrid = !editor.showGrid;
                showGrid = editor.showGrid;
            }
            return;
        }

        editor?.handleKeyDown(e);
    }

    function handleKeyUp(e: KeyboardEvent) {
        editor?.handleKeyUp(e);
    }

    function editorLoop() {
        if (!editor) return;
        
        editor.update();
        animationFrame = requestAnimationFrame(editorLoop);
    }

    function handleMouseDown(e: MouseEvent) {
        editor?.handleMouseDown(e);
    }

    function handleMouseMove(e: MouseEvent) {
        editor?.handleMouseMove(e);
    }

    function handleMouseUp() {
        editor?.handleMouseUp();
    }

    function handleResize() {
        editor?.resize();
    }

    function exportMap() {
        if (editor) {
            const data = editor.exportMap(useCompression);
            const exportData = {
                version: 1,
                ...JSON.parse(data)
            };
            exportedData = JSON.stringify(exportData, null, 2);
            showExportDialog = true;
        }
    }

    function importMap() {
        if (editor && mapData) {
            try {
                const data = JSON.parse(mapData);
                // Check for version and required fields
                if (typeof data === 'object' && data.version === 1 && data.mapData && data.tilemap) {
                    editor.importMap(data);
                    showImportDialog = false;
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

    function createNewMap() {
        if (editor && newWidth > 0 && newHeight > 0) {
            mapWidth = newWidth;
            mapHeight = newHeight;
            editor.newMap(newWidth, newHeight);
            showNewMapDialog = false;
        }
    }

    function resizeCurrentMap() {
        if (editor && newWidth > 0 && newHeight > 0) {
            mapWidth = newWidth;
            mapHeight = newHeight;
            editor.resizeMap(newWidth, newHeight, selectedAlignment as ResizeAlignment);
            showResizeDialog = false;
        }
    }

    function openNewMapDialog() {
        const dims = editor?.getMapDimensions() ?? { width: 20, height: 15 };
        newWidth = dims.width;
        newHeight = dims.height;
        showNewMapDialog = true;
        showResizeDialog = false;
    }

    function openResizeDialog() {
        const dims = editor?.getMapDimensions() ?? { width: 20, height: 15 };
        newWidth = dims.width;
        newHeight = dims.height;
        showResizeDialog = true;
        showNewMapDialog = false;
    }

    // Add zoom control functions
    function findClosestZoomLevel(currentZoom: number, direction: 'up' | 'down'): number {
        // Find the closest zoom level
        let closestLevel = ZOOM_LEVELS[0];
        let minDiff = Math.abs(currentZoom - closestLevel);
        
        for (const level of ZOOM_LEVELS) {
            const diff = Math.abs(currentZoom - level);
            if (diff < minDiff) {
                minDiff = diff;
                closestLevel = level;
            }
        }
        
        // If we're already very close to a zoom level, move to the next one
        if (Math.abs(currentZoom - closestLevel) < 0.01) {
            const currentIndex = ZOOM_LEVELS.indexOf(closestLevel);
            if (direction === 'up' && currentIndex < ZOOM_LEVELS.length - 1) {
                return ZOOM_LEVELS[currentIndex + 1];
            }
            if (direction === 'down' && currentIndex > 0) {
                return ZOOM_LEVELS[currentIndex - 1];
            }
        }
        
        // Otherwise, move to the closest level in the desired direction
        const currentIndex = ZOOM_LEVELS.indexOf(closestLevel);
        if (direction === 'up' && currentZoom > closestLevel && currentIndex < ZOOM_LEVELS.length - 1) {
            return ZOOM_LEVELS[currentIndex + 1];
        }
        if (direction === 'down' && currentZoom < closestLevel && currentIndex > 0) {
            return ZOOM_LEVELS[currentIndex - 1];
        }
        
        return closestLevel;
    }

    function setZoom(newZoom: number) {
        if (editor) {
            // Get the center of the viewport
            const centerX = editor.canvas.width / 2;
            const centerY = editor.canvas.height / 2;
            
            // Convert center to world coordinates before zoom
            const worldX = (centerX - editor.offsetX) / editor.zoomLevel;
            const worldY = (centerY - editor.offsetY) / editor.zoomLevel;
            
            // Set new zoom
            editor.zoomLevel = Math.max(editor.minZoom, Math.min(editor.maxZoom, newZoom));
            zoomLevel = editor.zoomLevel;
            
            // Update offset to keep the center point fixed
            editor.offsetX = centerX - worldX * editor.zoomLevel;
            editor.offsetY = centerY - worldY * editor.zoomLevel;
        }
    }

    function zoomIn() {
        if (editor) {
            const nextZoom = findClosestZoomLevel(editor.zoomLevel, 'up');
            setZoom(nextZoom);
        }
    }

    function zoomOut() {
        if (editor) {
            const nextZoom = findClosestZoomLevel(editor.zoomLevel, 'down');
            setZoom(nextZoom);
        }
    }

    function resetZoom() {
        if (editor) {
            setZoom(1);
        }
    }

    async function handleTilemapFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            // Create a blob URL for the selected file
            const url = URL.createObjectURL(file);
            try {
                await editor?.changeTilemap(
                    url,
                    tilemapSettings.tileWidth,
                    tilemapSettings.tileHeight,
                    tilemapSettings.spacing
                );
                tilemapSettings.url = url;
            } catch (error) {
                console.error('Failed to load tilemap:', error);
                alert('Failed to load tilemap. Please check the file format.');
            }
        }
    }

    async function updateTilemapSettings() {
        if (editor) {
            try {
                await editor.changeTilemap(
                    tilemapSettings.url,
                    tilemapSettings.tileWidth,
                    tilemapSettings.tileHeight,
                    tilemapSettings.spacing
                );
                showTilemapDialog = false;
            } catch (error) {
                console.error('Failed to update tilemap settings:', error);
                alert('Failed to update tilemap settings. Please check the values.');
            }
        }
    }

    // Add this new function to handle file uploads
    async function handleImportFileSelect(event: Event) {
        const input = event.target as HTMLInputElement;
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

    // Add function to download JSON file
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

    // Add function to copy to clipboard
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

<svelte:head>
    <title>Map Editor</title>
</svelte:head>

<main>
    <div class="controls">
        <button onclick={openNewMapDialog} title="Create new map">📄</button>
        <button onclick={openResizeDialog} title="Resize current map">📐</button>
        <button onclick={() => showTilemapDialog = true} title="Change tilemap settings">⚙️</button>
        <button 
            onclick={() => {
                if (editor) {
                    editor.showGrid = !editor.showGrid;
                    showGrid = editor.showGrid;
                }
            }}
            class:active={showGrid}
            title="Toggle grid (V)"
            class="tool-button"
        >
            ⊞
        </button>
        <div class="layer-indicator">
            <span>Layer: </span>
            <div class="layer-buttons">
                <button 
                    class:active={currentLayer === -1}
                    onclick={() => { 
                        if (editor) {
                            editor.currentLayer = -1;
                            currentLayer = -1;
                        }
                    }}
                    title="Show all layers (press §)"
                    class="all-layers"
                >
                    All
                </button>
                {#each Array(9) as _, i}
                    <button 
                        class:active={currentLayer === i}
                        onclick={() => { 
                            if (editor) {
                                editor.currentLayer = i;
                                currentLayer = i;
                            }
                        }}
                        title="Select layer {i + 1} (press {i + 1})"
                    >
                        {i + 1}
                    </button>
                {/each}
                <button 
                    class:active={currentLayer === 9}
                    onclick={() => { 
                        if (editor) {
                            editor.currentLayer = 9;
                            currentLayer = 9;
                        }
                    }}
                    title="Select layer 10 (press 0)"
                >
                    10
                </button>
            </div>
        </div>
        <div class="brush-controls">
            <div class="tool-buttons">
                <button 
                    class:active={currentTool === 'brush'}
                    onclick={() => {
                        if (editor) {
                            editor.isFloodFillMode = false;
                            isFloodFillMode = false;
                            currentTool = 'brush';
                        }
                    }}
                    title="Brush tool (B)"
                >
                    🖌️
                </button>
                <button 
                    class:active={currentTool === 'fill'}
                    onclick={() => {
                        if (editor) {
                            editor.isFloodFillMode = true;
                            isFloodFillMode = true;
                            currentTool = 'fill';
                        }
                    }}
                    title="Flood fill tool (G)"
                >
                    🪣
                </button>
            </div>
            <span>📏 </span>
            <button 
                onclick={() => {
                    if (editor) {
                        editor.setBrushSize(editor.brushSize - 1);
                        brushSize = editor.brushSize;
                    }
                }}
                title="Decrease brush size (Z)"
            >-</button>
            <span class="brush-size">{brushSize}</span>
            <button 
                onclick={() => {
                    if (editor) {
                        editor.setBrushSize(editor.brushSize + 1);
                        brushSize = editor.brushSize;
                    }
                }}
                title="Increase brush size (X)"
            >+</button>
        </div>
        <div class="zoom-controls">
            <span>🔍 </span>
            <button 
                onclick={zoomOut}
                title="Zoom out (-)"
            >-</button>
            <button 
                onclick={resetZoom}
                title="Reset zoom (Ctrl/Cmd + 0)"
                class="zoom-reset"
            >{Math.round(zoomLevel * 100)}%</button>
            <button 
                onclick={zoomIn}
                title="Zoom in (+)"
            >+</button>
        </div>
        <button onclick={exportMap} title="Export map (Ctrl/Cmd + E)">📤</button>
        <button onclick={() => showImportDialog = true} title="Import map (Ctrl/Cmd + I)">📥</button>
        <button onclick={() => showShortcuts = !showShortcuts} title="Ctrl/Cmd + H or ?">
            {showShortcuts ? '❌' : '❓'}
        </button>
    </div>

    {#if showNewMapDialog}
        <div class="dialog">
            <h3>New Map</h3>
            <div class="dialog-content">
                <label>
                    Width:
                    <input type="number" bind:value={newWidth} min="1" max="100" />
                </label>
                <label>
                    Height:
                    <input type="number" bind:value={newHeight} min="1" max="100" />
                </label>
                <div class="dialog-buttons">
                    <button onclick={createNewMap}>Create</button>
                    <button onclick={() => showNewMapDialog = false}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showResizeDialog}
        <div class="dialog">
            <h3>Resize Map</h3>
            <div class="dialog-content">
                <label>
                    Width:
                    <input type="number" bind:value={newWidth} min="1" max="100" />
                </label>
                <label>
                    Height:
                    <input type="number" bind:value={newHeight} min="1" max="100" />
                </label>
                <div class="alignment-picker">
                    <h4>Content Alignment</h4>
                    <div class="alignment-grid">
                        {#each ['top-left', 'top-center', 'top-right',
                               'middle-left', 'middle-center', 'middle-right',
                               'bottom-left', 'bottom-center', 'bottom-right'] as align}
                            <button 
                                class:selected={selectedAlignment === align}
                                onclick={() => selectedAlignment = align}
                                title={align}
                            >
                                <div class="dot"></div>
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button onclick={resizeCurrentMap}>Resize</button>
                    <button onclick={() => showResizeDialog = false}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showTilemapDialog}
        <div class="dialog">
            <h3>Tilemap Settings</h3>
            <div class="dialog-content">
                <div class="file-input">
                    <label>
                        Tilemap Image:
                        <input 
                            type="file" 
                            accept="image/*"
                            onchange={handleTilemapFileSelect}
                        />
                    </label>
                </div>
                <label>
                    Tile Width:
                    <input 
                        type="number" 
                        bind:value={tilemapSettings.tileWidth} 
                        min="1" 
                        max="128"
                    />
                </label>
                <label>
                    Tile Height:
                    <input 
                        type="number" 
                        bind:value={tilemapSettings.tileHeight} 
                        min="1" 
                        max="128"
                    />
                </label>
                <label>
                    Spacing:
                    <input 
                        type="number" 
                        bind:value={tilemapSettings.spacing} 
                        min="0" 
                        max="16"
                    />
                </label>
                <div class="dialog-buttons">
                    <button onclick={updateTilemapSettings}>Apply</button>
                    <button onclick={() => showTilemapDialog = false}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showImportDialog}
        <div class="dialog">
            <h3>Import Map</h3>
            <div class="dialog-content">
                <div class="file-input">
                    <label>
                        Import from file:
                        <input 
                            type="file" 
                            accept=".json"
                            onchange={handleImportFileSelect}
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
                        showImportDialog = false;
                        mapData = '';  // Clear textarea when closing
                    }}>Cancel</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showExportDialog}
        <div class="dialog">
            <h3>Export Map</h3>
            <div class="dialog-content">
                <div class="tab-buttons">
                    <button 
                        class:active={activeExportTab === 'export'}
                        onclick={() => activeExportTab = 'export'}
                    >
                        Export
                    </button>
                    <button 
                        class:active={activeExportTab === 'docs'}
                        onclick={() => activeExportTab = 'docs'}
                    >
                        Documentation
                    </button>
                </div>

                {#if activeExportTab === 'export'}
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
    }
}`}</code></pre>

                        <h5>Example Code (TypeScript)</h5>
                        <pre><code>{`// Unpack binary map data
function unpackMapData(base64Data: string): number[][][] {
    try {
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
        const headerSize = 4;

        if (width <= 0 || height <= 0 || width > 1000 || height > 1000) {
            throw new Error('Invalid map dimensions');
        }

        // Read layer data
        const layers: number[][][] = [];
        let offset = headerSize;

        // Create first layer
        let currentLayer: number[][] = 
            Array(height).fill(null).map(() => Array(width).fill(-1));
        let x = 0, y = 0;

        // Read all runs
        while (offset < data.length - 1) {  // Need at least 2 more values for a run
            const count = data[offset++];
            const value = data[offset++];

            if (count <= 0) continue;  // Skip invalid runs

            // Process this run
            for (let i = 0; i < count; i++) {
                // If we've filled the current layer, start a new one
                if (y >= height) {
                    layers.push(currentLayer);
                    currentLayer = Array(height).fill(null)
                        .map(() => Array(width).fill(-1));
                    x = 0;
                    y = 0;
                }

                currentLayer[y][x] = value;
                x++;
                if (x >= width) {
                    x = 0;
                    y++;
                }
            }
        }
        
        // Push the last layer if it has any data
        if (y > 0 || x > 0) {
            layers.push(currentLayer);
        }

        return layers;
    } catch (error) {
        console.error('Error unpacking map data:', error);
        // Return a minimal valid map on error
        return [Array(10).fill(null).map(() => Array(10).fill(-1))];
    }
}`}</code></pre>
                    </div>
                {/if}

                <div class="dialog-buttons">
                    <button onclick={() => {
                        showExportDialog = false;
                        exportedData = '';
                    }}>Close</button>
                </div>
            </div>
        </div>
    {/if}

    {#if showShortcuts}
        <div class="shortcuts">
            <h3>Keyboard Shortcuts</h3>
            <ul>
                <li><kbd>B</kbd> Brush tool</li>
                <li><kbd>G</kbd> Flood fill tool</li>
                <li><kbd>V</kbd> Toggle grid</li>
                <li><kbd>§</kbd> Show all layers</li>
                <li><kbd>1</kbd>-<kbd>9</kbd> Select layers 1-9, <kbd>0</kbd> Select layer 10</li>
                <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Navigate tile selector</li>
                <li><kbd>Space</kbd> or <kbd>R</kbd> Center map</li>
                <li><kbd>Z</kbd><kbd>X</kbd> Adjust brush size</li>
                <li><kbd>+</kbd><kbd>-</kbd> Zoom in/out</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>0</kbd> Reset zoom</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd> Undo</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> Redo</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>E</kbd> Export map</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>I</kbd> Import map</li>
                <li><kbd>Ctrl/Cmd</kbd> + <kbd>H</kbd> or <kbd>?</kbd> Toggle shortcuts</li>
            </ul>
            <div class="mouse-controls">
                <h4>Mouse Controls</h4>
                <ul>
                    <li><strong>Left Click/Drag</strong> Place selected tile on current layer</li>
                    <li><strong>Right Click/Drag</strong> Remove tiles on current layer</li>
                    <li><strong>Middle Click/Drag</strong> Pan view</li>
                    <li><strong>Click in palette</strong> Select tile</li>
                    <li><strong>Mouse Wheel</strong> Zoom in/out</li>
                </ul>
            </div>
        </div>
    {/if}

    <canvas id="editor-canvas" bind:this={editorCanvas}></canvas>
</main>

<style>
    main {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .controls {
        padding: 10px;
        background: #333;
        display: flex;
        gap: 10px;
        align-items: center;
    }

    button {
        width: 28px;
        height: 28px;
        padding: 0;
        background: #666;
        border: 1px solid #777;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    button:hover {
        background: #777;
    }

    textarea {
        flex: 1;
        padding: 4px;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        height: 24px;
        font-family: monospace;
        resize: none;
    }

    canvas {
        flex: 1;
        width: 100%;
        height: 100%;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
        height: 100vh;
        background: #2a2a2a;
        color: white;
    }

    .shortcuts {
        position: absolute;
        top: 60px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #555;
        color: white;
        z-index: 1000;
    }

    .shortcuts h3 {
        margin: 0 0 10px 0;
        font-size: 16px;
    }

    .shortcuts h4 {
        margin: 15px 0 5px 0;
        font-size: 14px;
    }

    .shortcuts ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .shortcuts li {
        margin: 5px 0;
        font-size: 14px;
    }

    kbd {
        background: #444;
        border: 1px solid #666;
        border-radius: 3px;
        padding: 2px 5px;
        font-size: 12px;
        font-family: monospace;
    }

    .mouse-controls {
        margin-top: 15px;
        padding-top: 10px;
        border-top: 1px solid #555;
    }

    .dialog {
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
        max-height: 75vh;  /* Limit height to 75% of viewport height */
        display: flex;
        flex-direction: column;
        max-width: calc(100vw - 40px);  /* Prevent dialog from being wider than viewport */
        width: max-content;  /* Size to content but respect max-width */
    }

    .dialog h3 {
        margin: 0 0 15px 0;
        font-size: 18px;
        flex-shrink: 0;  /* Prevent header from shrinking */
    }

    .dialog-content {
        width: 500px;  /* Fixed width instead of min-width */
        overflow-y: auto;  /* Make content scrollable */
        overflow-x: hidden;  /* Prevent horizontal scrolling */
        padding-right: 16px;  /* Add space for scrollbar */
        scroll-behavior: smooth;
        scrollbar-width: thin;
        scrollbar-color: #666 #333;
    }

    /* Scrollbar styling for WebKit browsers */
    .dialog-content::-webkit-scrollbar {
        width: 8px;
    }

    .dialog-content::-webkit-scrollbar-track {
        background: #333;
        border-radius: 4px;
    }

    .dialog-content::-webkit-scrollbar-thumb {
        background: #666;
        border-radius: 4px;
    }

    .dialog-content::-webkit-scrollbar-thumb:hover {
        background: #777;
    }

    /* Make dialog buttons stick to bottom */
    .dialog-buttons {
        margin-top: 15px;
        border-top: 1px solid #444;
        padding-top: 15px;
        flex-shrink: 0;  /* Prevent buttons from shrinking */
    }

    .dialog label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
    }

    .dialog input {
        width: 80px;
        padding: 5px;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        font-size: 14px;
    }

    .dialog-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .dialog button {
        min-width: 80px;
    }

    .alignment-picker {
        margin-top: 15px;
    }

    .alignment-picker h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
    }

    .alignment-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 5px;
        margin: 0 auto;
    }

    .alignment-grid button {
        width: 35px;
        height: 35px;
        padding: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        cursor: pointer;
    }

    .alignment-grid button:hover {
        background: #555;
    }

    .alignment-grid button.selected {
        background: #666;
        border-color: #888;
    }

    .alignment-grid .dot {
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
    }

    .layer-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px;
        background: #444;
        border-radius: 4px;
    }

    .layer-indicator span {
        color: #fff;
        font-size: 14px;
    }

    .layer-buttons {
        display: flex;
        gap: 2px;
    }

    .layer-buttons button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 12px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .layer-buttons button:hover {
        background: #666;
    }

    .layer-buttons button.active {
        background: #00aa00;
        border-color: #00cc00;
    }

    .layer-buttons .all-layers {
        width: auto;
        min-width: 42px;
        font-size: 12px;
        font-weight: bold;
    }

    .brush-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: #444;
        border-radius: 4px;
    }

    .brush-controls span {
        color: #fff;
        font-size: 14px;
    }

    .brush-controls button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 16px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .brush-controls button:hover {
        background: #666;
    }

    .brush-controls button.active {
        background: #00aa00;
        border-color: #00cc00;
    }

    .tool-buttons {
        display: flex;
        gap: 4px;
    }

    .brush-size {
        min-width: 20px;
        text-align: center;
        font-weight: bold;
    }

    .zoom-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: #444;
        border-radius: 4px;
    }

    .zoom-controls span {
        color: #fff;
        font-size: 14px;
    }

    .zoom-controls button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 16px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .zoom-controls .zoom-reset {
        width: auto;
        min-width: 60px;
        font-size: 14px;
        padding: 0 8px;
    }

    .zoom-controls button:hover {
        background: #666;
    }

    .file-input {
        display: flex;
        flex-direction: column;
        gap: 5px;
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

    .tool-button {
        width: 28px;
        height: 28px;
        padding: 0;
        font-size: 16px;
        background: #555;
        border: 1px solid #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tool-button:hover {
        background: #666;
    }

    .tool-button.active {
        background: #00aa00;
        border-color: #00cc00;
    }

    /* Exceptions for buttons that need different sizes */
    .controls > button:not(.tool-button),
    .dialog button,
    .alignment-grid button {
        width: auto;
        min-width: 28px;
        padding: 8px 16px;
    }

    .zoom-controls .zoom-reset {
        width: auto;
        min-width: 60px;
        font-size: 14px;
        padding: 0 8px;
    }

    .dialog textarea {
        width: 100%;
        min-width: 400px;
        height: auto;
        margin-bottom: 10px;
        background: #444;
        color: white;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 8px;
        font-family: monospace;
    }

    /* Update dialog buttons style for wider buttons */
    .dialog .dialog-buttons button {
        width: auto;
        min-width: 80px;
        padding: 0 16px;
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

    .dialog .file-input {
        margin-bottom: 10px;
    }

    .dialog .file-input label {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .dialog .file-input input[type="file"] {
        background: #444;
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        padding: 5px;
        cursor: pointer;
        width: 100%;
    }

    .dialog .file-input input[type="file"]::-webkit-file-upload-button {
        background: #666;
        border: none;
        border-radius: 4px;
        color: white;
        padding: 8px 16px;
        margin-right: 10px;
        cursor: pointer;
    }

    .dialog .file-input input[type="file"]::-webkit-file-upload-button:hover {
        background: #777;
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

    .dialog textarea[readonly] {
        background: #333;
        cursor: text;
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
        overflow-x: auto;  /* Allow code blocks to scroll horizontally */
        margin: 12px 0;
        max-width: 100%;  /* Prevent overflow */
    }

    .documentation code {
        font-family: monospace;
        font-size: 13px;
        line-height: 1.4;
        white-space: pre-wrap;  /* Allow text to wrap */
    }

    .export-options {
        margin-bottom: 15px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #eee;
        font-size: 14px;
    }

    .checkbox-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        margin: 0;
    }

    .help-text {
        color: #888;
        font-size: 12px;
    }
</style>