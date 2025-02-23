<script lang="ts">
    import { editorStore } from '../../lib/state/EditorStore.svelte';
</script>

<div class="dialog" class:show={editorStore.showShortcuts}>
    <h3>Keyboard Shortcuts</h3>
    <div class="dialog-content">
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
        <div class="dialog-buttons">
            <button onclick={() => editorStore.setShowShortcuts(false)}>Close</button>
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

    h4 {
        margin: 15px 0 5px 0;
        font-size: 14px;
    }

    .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    li {
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