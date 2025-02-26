<script lang="ts">
    import { editorFSM } from '$lib/state/EditorStore.svelte.js';
    import type { RenderSettings } from '$lib/utils/settings.js';
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    import { onMount } from 'svelte';

    function closeDialog() {
        removeDialog("render-settings");
    }

    // Local copy of settings for editing
    let settings = $state<RenderSettings>({ ...editorFSM.context.renderSettings });

    // Update settings when dialog is opened
    onMount(() => {
        settings = { ...editorFSM.context.renderSettings };
    });

    // Apply settings
    function applySettings() {
        editorFSM.send('updateRenderSettings', settings);
    }

    // Reset settings to defaults
    function resetSettings() {
        editorFSM.send('resetRenderSettings');
        settings = { ...editorFSM.context.renderSettings };
    }

    // Helper function to get LOD quality label
    function getLodQualityLabel(quality: number): string {
        switch (quality) {
            case 1: return 'Lowest (Fastest)';
            case 2: return 'Low';
            case 3: return 'Medium';
            case 4: return 'High';
            case 5: return 'Highest (Slowest)';
            default: return 'Medium';
        }
    }

    // Helper function to get batch size label
    function getBatchSizeLabel(size: number): string {
        switch (size) {
            case 8: return 'Small (8×8)';
            case 16: return 'Medium (16×16)';
            case 32: return 'Large (32×32)';
            case 64: return 'Very Large (64×64)';
            default: return 'Medium (16×16)';
        }
    }
</script>

<Dialog title="Render Settings" onClose={closeDialog}>
    {#snippet buttonArea()}
        <button class="apply-button" onclick={applySettings}>Apply</button>
        <button class="reset-button" onclick={resetSettings}>Reset</button>
        <button class="close-button" onclick={closeDialog}>Close</button>
    {/snippet}

    <fieldset>
        <legend>Level of Detail (LOD)</legend>
        
        <div class="fields">
            <div class="field">
                <label for="useLOD">Enable LOD</label>
                <input 
                    type="checkbox" 
                    id="useLOD" 
                    bind:checked={settings.useLOD}
                />
                <span class="setting-description">
                    Improves performance when zoomed out by reducing detail
                </span>
            </div>
            
            <div class="field">
                <label for="lodThreshold">LOD Threshold: {settings.lodThreshold.toFixed(2)}</label>
                <input 
                    type="range" 
                    id="lodThreshold" 
                    min="0.1" 
                    max="0.8" 
                    step="0.05" 
                    bind:value={settings.lodThreshold}
                />
                <span class="setting-description">
                    Zoom level at which LOD activates (higher = activates sooner)
                </span>
            </div>
            
            <div class="field">
                <label for="lodQuality">LOD Quality: {getLodQualityLabel(settings.lodQuality)}</label>
                <input 
                    type="range" 
                    id="lodQuality" 
                    min="1" 
                    max="5" 
                    step="1" 
                    bind:value={settings.lodQuality}
                />
                <span class="setting-description">
                    Quality of LOD rendering (higher = better quality but slower)
                </span>
            </div>
        </div>
    </fieldset>
    
    <fieldset>
        <legend>Performance</legend>
        
        <div class="fields">
            <div class="field">
                <input 
                    type="checkbox" 
                    id="useDirectAtlas" 
                    bind:checked={settings.useDirectAtlas}
                />
                <label for="useDirectAtlas">Use Direct Atlas</label>
                <span class="setting-description">
                    Renders tiles directly from tilemap (faster, uses less memory)
                </span>
            </div>
            
            <div class="field">
                <label for="batchSize">Batch Size: {getBatchSizeLabel(settings.batchSize)}</label>
                <select id="batchSize" bind:value={settings.batchSize}>
                    <option value={8}>Small (8×8)</option>
                    <option value={16}>Medium (16×16)</option>
                    <option value={32}>Large (32×32)</option>
                    <option value={64}>Very Large (64×64)</option>
                </select>
                <span class="setting-description">
                    Size of tile batches for rendering (larger = faster but more memory)
                </span>
            </div>
        </div>
    </fieldset>
    
    <fieldset>
        <legend>Debug</legend>
        
        <div class="fields">
            <div class="field">
                <input 
                    type="checkbox" 
                    id="showFPS" 
                    bind:checked={settings.showFPS}
                />
                <label for="showFPS">Show FPS</label>
                <span class="setting-description">
                    Display frames per second in the status bar
                </span>
            </div>
            
            <div class="field">
                <input 
                    type="checkbox" 
                    id="debugMode" 
                    bind:checked={settings.debugMode}
                />
                <label for="debugMode">Debug Mode</label>
                <span class="setting-description">
                    Enable debug logging and visualization
                </span>
            </div>
        </div>
    </fieldset>
</Dialog>

<style>
    .fields {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    
    .setting-description {
        color: #444;
        margin-top: 2px;
    }
    
    label {
        display: inline-block;
        margin-bottom: 4px;
    }
    
    input[type="range"] {
        width: 100%;
    }
    
    select {
        width: 100%;
    }
    
    .apply-button, .reset-button {
        margin-right: 8px;
    }
</style> 