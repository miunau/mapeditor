import type { MapEditor } from './mapeditor';
import type { ReactiveMapEditor } from './MapEditor.svelte';

type EditorType = MapEditor | ReactiveMapEditor;

// Action to draw tiles on canvas
export function drawTile(node: HTMLCanvasElement, { editor, tileIndex }: { editor: EditorType, tileIndex: number }) {
    function draw() {
        const ctx = node.getContext('2d');
        if (!ctx || !editor) return;

        // Clear the canvas first
        ctx.clearRect(0, 0, node.width, node.height);
        ctx.imageSmoothingEnabled = false;

        // Draw the tile
        const tile = editor.tilemap.getTile(tileIndex);
        if (tile) {
            ctx.drawImage(tile, 0, 0);
        }
    }

    // Draw immediately
    draw();

    return {
        update(params: { editor: EditorType, tileIndex: number }) {
            // Update parameters
            editor = params.editor;
            tileIndex = params.tileIndex;
            // Redraw with new parameters
            draw();
        },
        destroy() {
            // Cleanup if needed
        }
    };
} 