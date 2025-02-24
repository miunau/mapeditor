import { toolFSM } from './ToolState.svelte';
import { layerFSM } from './LayerState.svelte';
import type { MapData, CustomBrush } from '../types/map';
import type { Point } from '../utils/coordinates';
import type { ZoomLevel } from '../utils/zoom';
import { ReactiveMapEditor } from '../MapEditor.svelte';

let editorCanvas: HTMLCanvasElement | undefined = $state();
let editor: ReactiveMapEditor | undefined = $state();

// Dialog visibility state
let showNewMapDialog = $state(false);
let showResizeDialog = $state(false);
let showTilemapDialog = $state(false);
let showImportDialog = $state(false);
let showExportDialog = $state(false);
let showShortcuts = $state(true);
let showCustomBrushDialog = $state(false);
let showLayerDialog = $state(false);
let customBrushDialogId: string | null = $state(null);

// Reactive store for the editor state
export const editorStore = {
    // Editor and canvas references
    get canvas() { return editorCanvas; },
    get editor() { return editor; },
    setCanvas(canvas: HTMLCanvasElement) { editorCanvas = canvas; },
    setEditor(e: ReactiveMapEditor) { editor = e; },

    // Dialog visibility
    get showNewMapDialog() { return showNewMapDialog; },
    get showResizeDialog() { return showResizeDialog; },
    get showTilemapDialog() { return showTilemapDialog; },
    get showImportDialog() { return showImportDialog; },
    get showExportDialog() { return showExportDialog; },
    get showShortcuts() { return showShortcuts; },
    get showCustomBrushDialog() { return showCustomBrushDialog; },
    get showLayerDialog() { return showLayerDialog; },
    get customBrushDialogId() { return customBrushDialogId; },
    setShowNewMapDialog(show: boolean) { showNewMapDialog = show; },
    setShowResizeDialog(show: boolean) { showResizeDialog = show; },
    setShowTilemapDialog(show: boolean) { showTilemapDialog = show; },
    setShowImportDialog(show: boolean) { showImportDialog = show; },
    setShowExportDialog(show: boolean) { showExportDialog = show; },
    setShowShortcuts(show: boolean) { showShortcuts = show; },
    setShowLayerDialog(show: boolean) { showLayerDialog = show; },
    setShowCustomBrushDialog(show: boolean) { 
        showCustomBrushDialog = show;
        if (!show) customBrushDialogId = null;
    },
    setCustomBrushDialogId(id: string | null) { customBrushDialogId = id; },

    // Tool state
    get currentTool() { return toolFSM.context.currentTool; },
    get brushSize() { return toolFSM.context.brushSize; },
    get selectedTile() { return toolFSM.context.selectedTile; },
    get customBrush() { return editor?.brushManager?.getSelectedBrush() || null; },
    get isWorldAlignedRepeat() { return editor?.useWorldAlignedRepeat || false; },
    get isPainting() { return toolFSM.state === 'painting'; },
    get isDrawingRectangle() { return toolFSM.state === 'drawingRectangle'; },
    get isFilling() { return toolFSM.state === 'filling'; },

    // Layer state
    get currentLayer() { return layerFSM.context.currentLayer; },
    get isShowAllLayers() { return layerFSM.context.showAllLayers; },
    get layerOpacities() { return layerFSM.context.layerOpacities; },
    get layerVisibility() { return layerFSM.context.layerVisibility; },
    get MAX_LAYERS() { return layerFSM.context.MAX_LAYERS; },

    // View state
    get zoomLevel() { return editor?.zoomLevel || 1; },
    get offsetX() { return editor?.offsetX || 0; },
    get offsetY() { return editor?.offsetY || 0; },
    get showGrid() { return editor === undefined ? true : editor.showGrid; },
    get isPanning() { return editor?.isPanning || false; },
    get panVelocity() { 
        return { 
            x: editor?.panVelocityX || 0, 
            y: editor?.panVelocityY || 0 
        }; 
    },

    // Editor actions
    selectLayer(layer: number) {
        layerFSM.send('selectLayer', layer);
        if (editor) {
            editor.currentLayer = layer;
        }
    },
    toggleGrid() {
        if (editor) {
            editor.toggleGrid();
        }
    },
    setShowGrid(show: boolean) {
        if (editor) {
            editor.showGrid = show;
        }
    },
    selectTool(tool: 'brush' | 'fill' | 'rectangle') {
        if (!editor) return;

        // Reset any active tool states
        editor.isFloodFillMode = false;
        editor.isDrawingRectangle = false;
        editor.cancelRectangleDrawing();

        // Set the new tool
        toolFSM.send('selectTool', tool);

        // Update editor state based on tool
        if (tool === 'fill') {
            editor.isFloodFillMode = true;
        }
    },
    setBrushSize(size: number) {
        toolFSM.send('setBrushSize', size);
        if (editor) {
            editor.setBrushSize(size);
        }
    },
    toggleWorldAlignedRepeat() {
        if (editor) {
            editor.useWorldAlignedRepeat = !editor.useWorldAlignedRepeat;
        }
    },
    zoom(delta: number, focusPoint: Point) {
        if (editor) {
            editor.handleWheel({ 
                preventDefault: () => {}, 
                deltaY: delta, 
                clientX: focusPoint.x, 
                clientY: focusPoint.y 
            } as WheelEvent);
        }
    },
    setZoom(level: ZoomLevel, offset: Point) {
        if (editor) {
            editor.setZoom(level, offset);
        }
    },
    toggleLayerVisibility(layer: number) {
        layerFSM.send('toggleLayerVisibility', layer);
        if (editor) {
            editor.toggleLayerVisibility(layer);
        }
    },

    // History state
    get undoStack() { return editor?.undoStack || []; },
    get redoStack() { return editor?.redoStack || []; },
    get canUndo() { return (editor?.undoStack.length || 0) > 0; },
    get canRedo() { return (editor?.redoStack.length || 0) > 0; },

    // Editor initialization
    init(canvas: HTMLCanvasElement) {
        editorCanvas = canvas;
        editor = new ReactiveMapEditor(canvas);
        editor.init();
    }
};

// Export FSMs for direct access if needed
export { toolFSM, layerFSM }; 