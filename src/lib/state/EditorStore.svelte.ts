import { toolFSM } from './ToolState.svelte';
import { layerFSM } from './LayerState.svelte';
import { viewFSM } from './ViewState.svelte';
import { historyFSM } from './HistoryState.svelte';
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
let showShortcuts = $state(false);
let showCustomBrushDialog = $state(false);
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
    get customBrushDialogId() { return customBrushDialogId; },
    setShowNewMapDialog(show: boolean) { showNewMapDialog = show; },
    setShowResizeDialog(show: boolean) { showResizeDialog = show; },
    setShowTilemapDialog(show: boolean) { showTilemapDialog = show; },
    setShowImportDialog(show: boolean) { showImportDialog = show; },
    setShowExportDialog(show: boolean) { showExportDialog = show; },
    setShowShortcuts(show: boolean) { showShortcuts = show; },
    setShowCustomBrushDialog(show: boolean) { 
        showCustomBrushDialog = show;
        if (!show) customBrushDialogId = null;
    },
    setCustomBrushDialogId(id: string | null) { customBrushDialogId = id; },

    // Tool state
    get currentTool() { return toolFSM.context.currentTool; },
    get brushSize() { return toolFSM.context.brushSize; },
    get selectedTile() { return toolFSM.context.selectedTile; },
    get customBrush() { return editor?.selectedCustomBrush || null; },
    get isWorldAlignedRepeat() { return editor?.useWorldAlignedRepeat || false; },
    get isPainting() { return toolFSM.state === 'painting'; },
    get isErasing() { return toolFSM.state === 'erasing'; },
    get isFilling() { return toolFSM.state === 'filling'; },

    // Layer state
    get currentLayer() { return layerFSM.context.currentLayer; },
    get isShowAllLayers() { return layerFSM.context.showAllLayers; },
    get layerOpacities() { return layerFSM.context.layerOpacities; },
    get layerVisibility() { return layerFSM.context.layerVisibility; },
    get MAX_LAYERS() { return layerFSM.context.MAX_LAYERS; },

    // View state
    get zoomLevel() { return viewFSM.context.zoomLevel; },
    get offsetX() { return viewFSM.context.offsetX; },
    get offsetY() { return viewFSM.context.offsetY; },
    get showGrid() { return viewFSM.context.showGrid; },
    get isPanning() { return viewFSM.context.isPanning; },
    get panVelocity() { 
        return { 
            x: viewFSM.context.panVelocityX, 
            y: viewFSM.context.panVelocityY 
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
        viewFSM.send('toggleGrid');
        if (editor) {
            editor.showGrid = !editor.showGrid;
        }
    },
    selectTool(tool: string) {
        toolFSM.send('selectTool', tool);
        if (editor) {
            if (tool === 'fill') {
                editor.isFloodFillMode = true;
            } else {
                editor.isFloodFillMode = false;
            }
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
            // Update FSM state to match editor state
            viewFSM.send('setZoom', { 
                level: editor.zoomLevel as ZoomLevel, 
                focusPoint: { x: editor.offsetX, y: editor.offsetY }
            });
        }
    },
    setZoom(level: ZoomLevel, offset: Point) {
        viewFSM.send('setZoom', { level, focusPoint: offset });
        if (editor) {
            editor.zoomLevel = level;
            editor.offsetX = offset.x;
            editor.offsetY = offset.y;
        }
    },
    toggleLayerVisibility(layer: number) {
        layerFSM.send('toggleLayerVisibility', layer);
        if (editor) {
            editor.toggleLayerVisibility(layer);
        }
    },

    // History state
    get currentMapData() { return historyFSM.context.currentMapData; },
    get hasUnsavedChanges() { return historyFSM.context.hasUnsavedChanges; },
    get canUndo() { return historyFSM.context.undoStack.length > 1; },
    get canRedo() { return historyFSM.context.redoStack.length > 0; },

    // Tool actions
    startPainting() {
        toolFSM.send('startPaint');
    },
    stopPainting() {
        toolFSM.send('stopPaint');
    },
    startErasing() {
        toolFSM.send('startErase');
    },
    stopErasing() {
        toolFSM.send('stopErase');
    },
    startFilling() {
        toolFSM.send('startFill');
    },
    stopFilling() {
        toolFSM.send('stopFill');
    },

    // History actions
    saveState(mapData: MapData) {
        historyFSM.send('saveState', mapData);
    },
    markSaved() {
        historyFSM.send('markSaved');
    },
    undo() {
        historyFSM.send('undo');
    },
    redo() {
        historyFSM.send('redo');
    },

    // Editor initialization
    init(canvas: HTMLCanvasElement) {
        editorCanvas = canvas;
        editor = new ReactiveMapEditor(canvas);
        editor.init();
    }
};

// Export FSMs for direct access if needed
export { toolFSM, layerFSM, viewFSM, historyFSM }; 