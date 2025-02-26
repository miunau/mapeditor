<script lang="ts">
    import Dialog from './Dialog.svelte';
    import { removeDialog } from './diag.svelte.js';
    import { onMount } from 'svelte';
    function closeDialog() {
        removeDialog("help");
    }

    let audio: HTMLAudioElement | null = $state(null);

    onMount(() => {
        if (audio) {
            audio.currentTime = 0;
            audio.volume = 0.5;
            audio.play();
        }
    });
</script>

<Dialog title="Help" onClose={closeDialog}>
    <audio src="/TADA.mp3" bind:this={audio}></audio>
    {#snippet buttonArea()}
        <div class="button-container">
            <button class="close-button" onclick={closeDialog}>Close</button>
        </div>
    {/snippet}
    <figure>
        <img src="/miu.png" alt="miunau" class="miunau-logo">
    </figure>
    <h4>Welcome!</h4>
    <p>This is a tilemap based map editor by <a href="https://miunau.com" target="_blank">miunau</a>. Default tilemap is by <a href="https://kenney.nl" target="_blank">kenney</a>. Uses <a href="https://jdan.github.io/98.css/" target="_blank">98.css</a>. Thanks!</p>
    <p>Select a tile from the palette, choose your tool, and start creating!<br>You can use layers to organize different elements of your map (e.g., background, terrain, objects).</p>
    <hr />
    <h4>Keyboard Shortcuts</h4>
    <ul>
        <li><strong>Tools</strong></li>
        <li><kbd>B</kbd> <span>Brush tool</span></li>
        <li><kbd>G</kbd> <span>Flood fill tool</span></li>
        <li><kbd>R</kbd> <span>Rectangle tool</span></li>
        <li><kbd>Z</kbd><kbd>X</kbd> <span>Adjust brush size</span></li>

        <li><strong>Navigation</strong></li>
        <li><kbd>Space</kbd> <span>Center map</span></li>
        <li><kbd>+</kbd><kbd>-</kbd> <span>Zoom in/out</span></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>0</kbd> <span>Reset zoom</span></li>
        <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <span>Navigate tile selector</span></li>

        <li><strong>Layers</strong></li>
        <li><kbd>1</kbd>-<kbd>9</kbd> <span>Select layers 1-9, <kbd>0</kbd> Select layer 10</span></li>
        <li><kbd>§</kbd> <span>Show all layers</span></li>
        <li><kbd>V</kbd> <span>Toggle grid</span></li>

        <li><strong>History</strong></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>Z</kbd> <span>Undo</span></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> <span>Redo</span></li>

        <li><strong>File Operations</strong></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>E</kbd> <span>Export map</span></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>I</kbd> <span>Import map</span></li>
        <li><kbd>Ctrl/Cmd</kbd> + <kbd>H</kbd> or <kbd>?</kbd> <span>Toggle shortcuts</span></li>
    </ul>
    <hr />
    <h4>Mouse Controls</h4>
    <ul>
        <li><kbd>Left Click/Drag</kbd> <span>Place selected tile on current layer</span></li>
        <li><kbd>Right Click/Drag</kbd> <span>Remove tiles on current layer</span></li>
        <li><kbd>Middle Click/Drag</kbd> <span>Pan view</span></li>
        <li><kbd>Click in palette</kbd> <span>Select tile</span></li>
        <li><kbd>Mouse Wheel</kbd> <span>Zoom in/out</span></li>
    </ul>
    <hr />
</Dialog>

<style>
    ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0px 24px;
    }

    li:has(strong) {
        grid-column: 1 / -1;
        margin: 16px 0 10px 0;
    }

    li:has(strong):first-child {
        margin-top: 6px;
    }

    li {
        margin: 1px 0;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    span {
        padding: 0 3px;
        font-weight: normal;
    }

    .button-container {
        display: flex;
        justify-content: flex-end;
    }

    figure {
        max-height: 250px;
    }

    img {
        max-height: 250px;
    }

</style> 