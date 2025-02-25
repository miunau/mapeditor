import { FSM } from '../utils/fsm.svelte.js';
import type { MapData, CustomBrush } from '../utils/map';
import type { Point, DrawOperation } from '../utils/drawing';
import type { ZoomLevel } from '../utils/zoom';
import { ReactiveMapEditor } from '../MapEditor.svelte';

// ===== Tool State =====
export type ToolType = 'brush' | 'fill' | 'rectangle' | 'ellipse' | 'line';

export type ToolContext = {
    currentTool: ToolType;
    brushSize: number;
    selectedTile: number;
    customBrush: CustomBrush | null;
    isWorldAlignedRepeat: boolean;
    // Drawing state
    drawStartX: number | null;
    drawStartY: number | null;
    isErasing: boolean;
}

export type ToolStateType = 'idle' | 'drawing';

const toolInitialContext: ToolContext = {
    currentTool: 'brush',
    brushSize: 1,
    selectedTile: -1,
    customBrush: null,
    isWorldAlignedRepeat: false,
    drawStartX: null,
    drawStartY: null,
    isErasing: false
};

const toolStates = {
    idle: {
        on: {
            'startDrawing': (context: ToolContext, data: { x: number, y: number, isErasing: boolean }) => {
                context.drawStartX = data.x;
                context.drawStartY = data.y;
                context.isErasing = data.isErasing;
                return 'drawing' as const;
            },
            'selectTool': (context: ToolContext, tool: ToolType) => {
                context.currentTool = tool;
                return 'idle' as const;
            },
            'setBrushSize': (context: ToolContext, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'idle' as const;
            },
            'selectTile': (context: ToolContext, tile: number) => {
                if (!editorStore.showCustomBrushDialog) {
                    context.selectedTile = tile;
                }
                return 'idle' as const;
            },
            'selectCustomBrush': (context: ToolContext, brush: CustomBrush | null) => {
                context.customBrush = brush;
                return 'idle' as const;
            },
            'toggleWorldAlignedRepeat': (context: ToolContext) => {
                context.isWorldAlignedRepeat = !context.isWorldAlignedRepeat;
                return 'idle' as const;
            }
        }
    },
    drawing: {
        on: {
            'stopDrawing': (context: ToolContext) => {
                // Keep the drawing data for potential use in the idle state
                return 'idle' as const;
            },
            'cancelDrawing': (context: ToolContext) => {
                // Reset drawing state
                context.drawStartX = null;
                context.drawStartY = null;
                return 'idle' as const;
            },
            'continueShape': (context: ToolContext) => {
                // Continue the current shape drawing
                return 'drawing' as const;
            },
            'setBrushSize': (context: ToolContext, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'drawing' as const;
            }
        }
    }
};

// ===== Layer State =====
export type LayerContext = {
    currentLayer: number;  // The layer being edited
    showAllLayers: boolean;  // For opacity/editing view
    layerOpacities: number[];
    layerVisibility: boolean[];  // Whether layer is enabled at all
    readonly MAX_LAYERS: number;
}

type LayerStateType = 'normal' | 'allLayers';

export const MAX_LAYERS = 10;

const layerInitialContext: LayerContext = {
    currentLayer: 0,
    showAllLayers: false,
    layerOpacities: Array(MAX_LAYERS).fill(1),
    layerVisibility: Array(MAX_LAYERS).fill(true),
    MAX_LAYERS
};

const layerStates = {
    normal: {
        enter: (context: LayerContext) => {
            context.showAllLayers = false;
            return context;
        },
        on: {
            'showAllLayers': 'allLayers' as const,
            'selectLayer': (context: LayerContext, layer: number) => {
                if (layer === -1) {
                    context.currentLayer = -1;
                    context.showAllLayers = true;
                    return 'allLayers' as const;
                }
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.currentLayer = layer;
                }
                return 'normal' as const;
            },
            'setLayerOpacity': (context: LayerContext, { layer, opacity }: { layer: number; opacity: number }) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerOpacities[layer] = Math.max(0, Math.min(1, opacity));
                }
                return 'normal' as const;
            },
            'toggleLayerVisibility': (context: LayerContext, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    // Toggle visibility for this layer
                    context.layerVisibility[layer] = !context.layerVisibility[layer];
                    
                    // If we're disabling the current editing layer, switch to the next visible layer
                    if (!context.layerVisibility[layer] && context.currentLayer === layer) {
                        const nextVisibleLayer = context.layerVisibility.findIndex((visible: boolean, i: number) => visible && i !== layer);
                        if (nextVisibleLayer !== -1) {
                            context.currentLayer = nextVisibleLayer;
                        }
                    }
                }
                return 'normal' as const;
            },
            'enableAllLayers': (context: LayerContext) => {
                context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                return 'normal' as const;
            },
            'disableAllLayers': (context: LayerContext) => {
                // Keep at least one layer visible
                const currentVisible = context.layerVisibility[context.currentLayer];
                context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                if (currentVisible) {
                    context.layerVisibility[context.currentLayer] = true;
                } else {
                    context.layerVisibility[0] = true;
                    context.currentLayer = 0;
                }
                return 'normal' as const;
            }
        }
    },
    allLayers: {
        enter: (context: LayerContext) => {
            context.showAllLayers = true;
            context.currentLayer = -1;
            return context;
        },
        on: {
            'selectLayer': (context: LayerContext, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    // Only allow selecting visible layers
                    if (context.layerVisibility[layer]) {
                        context.currentLayer = layer;
                        context.showAllLayers = false;
                        return 'normal' as const;
                    }
                }
                return 'allLayers' as const;
            },
            'setLayerOpacity': (context: LayerContext, { layer, opacity }: { layer: number; opacity: number }) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerOpacities[layer] = Math.max(0, Math.min(1, opacity));
                }
                return 'allLayers' as const;
            },
            'toggleLayerVisibility': (context: LayerContext, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerVisibility[layer] = !context.layerVisibility[layer];
                }
                return 'allLayers' as const;
            },
            'enableAllLayers': (context: LayerContext) => {
                context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                return 'allLayers' as const;
            },
            'disableAllLayers': (context: LayerContext) => {
                // Keep at least one layer visible
                context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                context.layerVisibility[0] = true;
                context.currentLayer = 0;
                context.showAllLayers = false;
                return 'normal' as const;
            }
        }
    }
};

// ===== Render Settings =====
export interface RenderSettings {
    // LOD settings
    useLOD: boolean;
    lodThreshold: number;  // Zoom level at which LOD kicks in (0.0 - 1.0)
    lodQuality: number;    // Quality level for LOD (1-5, higher is better quality)
    
    // Performance settings
    batchSize: number;     // Base batch size for tile rendering (8, 16, 32, 64)
    useDirectAtlas: boolean; // Whether to use direct atlas rendering
    
    // Debug settings
    showFPS: boolean;
    debugMode: boolean;
}

// Default settings
const defaultSettings: RenderSettings = {
    useLOD: true,
    lodThreshold: 0.4,
    lodQuality: 3,
    batchSize: 16,
    useDirectAtlas: true,
    showFPS: true,
    debugMode: false
};

// ===== Editor Store State =====
// Create FSM instances
export const toolFSM = new FSM(
    toolInitialContext, 
    toolStates, 
    'idle', 
    { debug: true }
);

export const layerFSM = new FSM(
    layerInitialContext, 
    layerStates, 
    'normal', 
    { debug: true }
);

// Start the FSMs
toolFSM.start();
layerFSM.start();

// UI state
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
let showLayerDialog = $state(false);
let showSettingsDialog = $state(false);
let customBrushDialogId: string | null = $state(null);

// Settings state
let renderSettings = $state<RenderSettings>({ ...defaultSettings });

// ===== Unified Editor Store =====
export const editorStore = {
    // ===== Editor References =====
    get canvas() { return editorCanvas; },
    get editor() { return editor; },
    setCanvas(canvas: HTMLCanvasElement) { editorCanvas = canvas; },
    setEditor(e: ReactiveMapEditor) { editor = e; },

    // ===== Dialog Visibility =====
    get showNewMapDialog() { return showNewMapDialog; },
    get showResizeDialog() { return showResizeDialog; },
    get showTilemapDialog() { return showTilemapDialog; },
    get showImportDialog() { return showImportDialog; },
    get showExportDialog() { return showExportDialog; },
    get showShortcuts() { return showShortcuts; },
    get showCustomBrushDialog() { return showCustomBrushDialog; },
    get showLayerDialog() { return showLayerDialog; },
    get showSettingsDialog() { return showSettingsDialog; },
    get customBrushDialogId() { return customBrushDialogId; },
    
    setShowNewMapDialog(show: boolean) { showNewMapDialog = show; },
    setShowResizeDialog(show: boolean) { showResizeDialog = show; },
    setShowTilemapDialog(show: boolean) { showTilemapDialog = show; },
    setShowImportDialog(show: boolean) { showImportDialog = show; },
    setShowExportDialog(show: boolean) { showExportDialog = show; },
    setShowShortcuts(show: boolean) { showShortcuts = show; },
    setShowLayerDialog(show: boolean) { showLayerDialog = show; },
    setShowSettingsDialog(show: boolean) { showSettingsDialog = show; },
    setShowCustomBrushDialog(show: boolean) { 
        showCustomBrushDialog = show;
        if (!show) customBrushDialogId = null;
    },
    setCustomBrushDialogId(id: string | null) { customBrushDialogId = id; },

    // ===== Render Settings =====
    get renderSettings() { return renderSettings; },
    updateRenderSettings(settings: Partial<RenderSettings>) {
        renderSettings = { ...renderSettings, ...settings };
        // Apply settings to editor if it exists
        if (editor) {
            editor.updateRenderSettings(renderSettings);
        }
    },
    resetRenderSettings() {
        renderSettings = { ...defaultSettings };
        if (editor) {
            editor.updateRenderSettings(renderSettings);
        }
    },

    // ===== Tool State Getters =====
    get currentTool() { return toolFSM.context.currentTool; },
    get brushSize() { return toolFSM.context.brushSize; },
    get selectedTile() { return toolFSM.context.selectedTile; },
    get customBrush() { return editor?.brushManager?.getSelectedBrush() || null; },
    get isCustomBrushMode() { 
        const brush = this.customBrush;
        return brush !== null && !brush.isBuiltIn;
    },
    get isWorldAlignedRepeat() { return editor?.useWorldAlignedRepeat || false; },
    get isPainting() { return toolFSM.state === 'drawing' && toolFSM.context.currentTool === 'brush'; },
    get isDrawingRectangle() { return toolFSM.state === 'drawing' && toolFSM.context.currentTool === 'rectangle'; },
    get isDrawingEllipse() { return toolFSM.state === 'drawing' && toolFSM.context.currentTool === 'ellipse'; },
    get isFilling() { return toolFSM.state === 'drawing' && toolFSM.context.currentTool === 'fill'; },
    get isDrawing() { return toolFSM.state === 'drawing'; },

    // ===== Layer State Getters =====
    get currentLayer() { return layerFSM.context.currentLayer; },
    get isShowAllLayers() { return layerFSM.context.showAllLayers; },
    get layerOpacities() { return layerFSM.context.layerOpacities; },
    get layerVisibility() { return layerFSM.context.layerVisibility; },
    get MAX_LAYERS() { return layerFSM.context.MAX_LAYERS; },

    // ===== View State Getters =====
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

    // ===== History State Getters =====
    get undoStack() { return editor?.undoStack || []; },
    get redoStack() { return editor?.redoStack || []; },
    get canUndo() { return (editor?.undoStack.length || 0) > 0; },
    get canRedo() { return (editor?.redoStack.length || 0) > 0; },

    // ===== Tool Actions =====
    selectTool(tool: ToolType) {
        if (!editor) return;

        // Cancel any active drawing
        if (this.isDrawing) {
            editor.cancelDrawing();
        }

        // Send the event to the FSM
        toolFSM.send('selectTool', tool);
        console.log(`${tool} tool selected`);
    },

    setBrushSize(size: number) {
        // Only update the FSM state - the editor will react to this change automatically
        // through the reactive getter
        const newSize = Math.max(1, size);
        toolFSM.send('setBrushSize', newSize);
    },

    selectTile(tile: number) {
        toolFSM.send('selectTile', tile);
    },

    toggleWorldAlignedRepeat() {
        toolFSM.send('toggleWorldAlignedRepeat');
        if (editor) {
            editor.useWorldAlignedRepeat = !editor.useWorldAlignedRepeat;
        }
    },

    // ===== Drawing Actions =====
    startDrawing(operation: DrawOperation) {
        if (!editor) return;
        
        // Send the event to the FSM if needed
        if (toolFSM.state === 'idle') {
            toolFSM.send('startDrawing', {
                x: operation.startX,
                y: operation.startY,
                isErasing: operation.isErasing
            });
        }
    },
    
    stopDrawing() {
        if (!editor) return;
        // Send the event to the FSM
        if (toolFSM.state === 'drawing') {
            toolFSM.send('stopDrawing');
        }
    },
    
    cancelDrawing() {
        if (!editor) return;
        // Send the event to the FSM
        if (toolFSM.state === 'drawing') {
            toolFSM.send('cancelDrawing');
        }
    },

    // ===== Layer Actions =====
    selectLayer(layer: number) {
        layerFSM.send('selectLayer', layer);
    },

    setLayerOpacity(layer: number, opacity: number) {
        layerFSM.send('setLayerOpacity', { layer, opacity });
    },

    toggleLayerVisibility(layer: number) {
        layerFSM.send('toggleLayerVisibility', layer);
        if (editor) {
            editor.toggleLayerVisibility(layer);
        }
    },

    enableAllLayers() {
        layerFSM.send('enableAllLayers');
    },

    disableAllLayers() {
        layerFSM.send('disableAllLayers');
    },

    // ===== View Actions =====
    toggleGrid() {
        if (editor) {
            editor.showGrid = !editor.showGrid;
        }
    },

    setShowGrid(show: boolean) {
        if (editor) {
            editor.showGrid = show;
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

    // ===== Custom Brush Actions =====
    selectCustomBrush(brushId: string | null) {
        if (!editor || !editor.brushManager) return;
        
        // Select the brush in the brush manager
        editor.brushManager.selectBrush(brushId);
        
        // The isCustomBrushMode getter will automatically update based on the selected brush
    },

    // ===== Editor Initialization =====
    init(canvas: HTMLCanvasElement) {
        editorCanvas = canvas;
        editor = new ReactiveMapEditor(canvas);
        editor.init();
    }
}; 