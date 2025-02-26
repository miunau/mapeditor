import type { CustomBrush, ToolType } from '$lib/utils/drawing.js';
import type { RenderSettings } from '$lib/utils/settings.js';
import { FSM } from '$lib/utils/fsm.svelte.js';
import { defaultRenderSettings } from '$lib/utils/settings.js';
import { Tilemap } from '$lib/utils/tilemap';
import { createWorker } from '$lib/workers/createWorker';
import { BrushManager } from '$lib/managers/BrushManager';
import { PaletteManager } from '$lib/managers/PaletteManager';
import { MapDataManager, type MapData } from '$lib/managers/MapDataManager';
import { Renderer } from '$lib/renderer/Renderer.svelte.js';
import { HIDManager } from '$lib/managers/HIDManager';

export const MAX_LAYERS = 10;

export type EditorContext = {
    /* Tilemap state */
    tilemap: Tilemap | null;
    /* Render worker */
    worker: Worker | null;
    /* The HTML canvas element that will be transferred to the worker */
    canvas: HTMLCanvasElement | null;
    renderer: Renderer | null;
    /* Tilemap and brush palette canvas */
    paletteCanvas: HTMLCanvasElement | null;
    paletteCtx: CanvasRenderingContext2D | null;
    /* Container for the editor */
    container: HTMLElement | null;
    /* Shared memory for map data */
    mapDataManager: MapDataManager | null;
    /* HID manager */
    hidManager: HIDManager | null;
    /* FPS */
    fps: number;
    /* Width of the map in tiles */
    mapWidth: number;
    /* Height of the map in tiles */
    mapHeight: number;
    /* Flags indicating which layers need to be updated */
    updateFlags: Int32Array | null;
    /* Shared buffer for update flags */
    updateFlagsBuffer: SharedArrayBuffer | null;
    /* Zoom level */
    zoomLevel: number;
    /* Offset of the map in pixels */
    offsetX: number;
    offsetY: number;
    /* Show grid */
    showGrid: boolean;
    
    undoStack: MapData[];
    redoStack: MapData[];
    maxUndoSteps: number;

    /* Reason for failure */
    failReason: string | undefined;

    /* Tool state */
    currentTool: ToolType;
    currentBrush: { type: 'custom', brush: CustomBrush } | { type: 'tile', index: number } | null;
    brushManager: BrushManager | null;
    paletteManager: PaletteManager | null;
    brushSize: number;
    drawStartX: number | null;
    drawStartY: number | null;
    isErasing: boolean;
    isSelectingTiles: boolean;
    selectionStartX: number | null;
    selectionStartY: number | null;
    selectionEndX: number | null;
    selectionEndY: number | null;

    /* Settings */
    renderSettings: RenderSettings;
    debugMode: boolean;
    
    /* Layer state */
    layerCount: number;
    currentLayer: number;
    layerVisibility: boolean[];
    readonly MAX_LAYERS: number;
}

function debug(...args: any[]) {
    if (editorFSM.context.debugMode) {
        console.log(...args);
    }
}

// ===== Editor Store State =====
export const editorFSM = new FSM(
    {
        // Tilemap state
        tilemap: null,
        worker: null,
        canvas: null,
        renderer: null,
        paletteCanvas: null,
        paletteCtx: null,
        container: null,
        mapWidth: 32,
        mapHeight: 32,
        mapDataManager: null,
        hidManager: null,
        updateFlags: null,
        updateFlagsBuffer: null,
        fps: 0,
        zoomLevel: 1,
        offsetX: 0,
        offsetY: 0,
        showGrid: true,
        undoStack: [],
        redoStack: [],
        maxUndoSteps: 20,

        /* Reason for failure */
        failReason: undefined,

        /* Tool state */
        currentTool: 'brush',
        currentBrush: { type: 'tile', index: 0 },
        brushManager: null,
        paletteManager: null,
        brushSize: 1,
        drawStartX: null,
        drawStartY: null,
        isErasing: false,
        isSelectingTiles: false,
        selectionStartX: null,
        selectionStartY: null,
        selectionEndX: null,
        selectionEndY: null,

        /* Settings */
        renderSettings: { 
            ...defaultRenderSettings,
            showGrid: true
        },
        debugMode: true,
        
        /* Layer state */
        layerCount: MAX_LAYERS,
        currentLayer: 0,
        layerVisibility: Array(MAX_LAYERS).fill(true),
        MAX_LAYERS
    } as EditorContext,
    {
        loading: {
            enter: (context: EditorContext) => {
                return context;
            },
            on: {
                'init': async (context: EditorContext, data: {
                    debug: boolean;
                    paletteCanvas: HTMLCanvasElement;
                    canvas: HTMLCanvasElement;
                    container: HTMLElement;
                }, machine: FSM<EditorContext, any>) => {

                    context.canvas = data.canvas;
                    context.paletteCanvas = data.paletteCanvas;
                    context.container = data.container;
                    context.debugMode = data.debug;

                    debug('Checking SharedArrayBuffer support...');
                    const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';

                    if (!sharedArrayBufferAvailable) {
                        debug('SharedArrayBuffer is not available. This application requires SharedArrayBuffer support.');
                        context.failReason = 'SharedArrayBuffer is not available. This application requires SharedArrayBuffer support.';
                        return 'failed' as const;
                    }

                    debug('Checking cross-origin isolation...');
                    if(!window.crossOriginIsolated) {
                        debug('Cross-origin isolation is not available. This application requires cross-origin isolation.');
                        context.failReason = 'Cross-origin isolation is not available. This application requires cross-origin isolation.';
                        return 'failed' as const;
                    }

                    debug('SharedArrayBuffer is available. Creating worker...');

                    // Load the tilemap
                    context.tilemap = new Tilemap('/tilemap.png', 16, 16, 1);
                    await context.tilemap.load();
                    context.worker = await createWorker(machine, '../workers/RenderWorker.ts');
                    
                    context.brushManager = new BrushManager(context.tilemap);
                    context.paletteManager = new PaletteManager(context.tilemap, context.brushManager);
                    context.mapDataManager = new MapDataManager(
                        context.mapWidth,
                        context.mapHeight,
                        context.layerCount,
                        context.tilemap!
                    );

                    context.undoStack = [context.mapDataManager!.cloneMapData()];
                    context.redoStack = [];

                    const style = window.getComputedStyle(data.container);
                    const initialWidth = data.container.clientWidth 
                        - parseFloat(style.paddingLeft) 
                        - parseFloat(style.paddingRight);
                    const initialHeight = data.container.clientHeight 
                        - parseFloat(style.paddingTop) 
                        - parseFloat(style.paddingBottom);

                    context.canvas.style.width = '100%';
                    context.canvas.style.height = '100%';
                    context.canvas.width = initialWidth;
                    context.canvas.height = initialHeight;

                    context.paletteManager.createCanvas(initialWidth, initialHeight);
                    context.paletteManager.drawPalette();

                    // Make sure renderSettings.showGrid matches context.showGrid
                    context.renderSettings.showGrid = context.showGrid;

                    context.renderer = new Renderer(context.canvas, context.worker!, context.renderSettings.debugMode, machine);
                    await context.renderer.initialize(
                        context.mapWidth,
                        context.mapHeight,
                        context.layerCount,
                        context.tilemap!.tileWidth,
                        context.tilemap!.tileHeight,
                        context.tilemap!.spacing,
                        context.tilemap!.imageUrl,
                        initialWidth,
                        initialHeight,
                        context.mapDataManager!
                    );
                    context.renderer.updateRenderSettings(context.renderSettings);
                    context.hidManager = new HIDManager(machine, context.canvas!, context.renderer!);
                    
                    return 'idle' as const;
                },
                'error': (context: EditorContext, data: { reason: string }, machine: FSM<EditorContext, any>) => {
                    context.failReason = data.reason;
                    return 'failed' as const;
                },
            }
        },
        failed: {
            enter: (context: EditorContext) => {
                return context;
            }
        },
        idle: {
            on: {
                // Tool events
                'startDrawing': (context: EditorContext, data: { x: number, y: number, isErasing: boolean }) => {
                    context.drawStartX = data.x;
                    context.drawStartY = data.y;
                    context.isErasing = data.isErasing;
                    return 'drawing' as const;
                },
                'keyDown': (context: EditorContext, data: { key: string }) => {
                    // Handle non-arrow key events
                    return 'idle' as const;
                },
                'keyUp': (context: EditorContext, data: { key: string }) => {
                    console.log('keyup', data);
                    return 'idle' as const;
                },
                'selectTool': (context: EditorContext, tool: ToolType) => {
                    context.currentTool = tool;
                    return 'idle' as const;
                },
                'setBrushSize': (context: EditorContext, size: number) => {
                    context.brushSize = Math.max(1, size);
                    return 'idle' as const;
                },
                'selectTile': (context: EditorContext, tile: number) => {
                    if (!context.isSelectingTiles) {
                        context.currentBrush = { type: 'tile', index: tile };
                    }
                    return 'idle' as const;
                },
                'selectCustomBrush': (context: EditorContext, brush: CustomBrush | null) => {
                    context.currentBrush = brush ? { type: 'custom', brush } : null;
                    return 'idle' as const;
                },
                'toggleGrid': (context: EditorContext) => {
                    // Update both the context showGrid flag and the renderSettings
                    context.showGrid = !context.showGrid;
                    context.renderSettings.showGrid = context.showGrid;
                    
                    // Update the renderer with the new settings
                    if (context.renderer) {
                        context.renderer.updateRenderSettings(context.renderSettings);
                    }
                    
                    return 'idle' as const;
                },
                'setZoom': (context: EditorContext, zoom: number) => {
                    context.zoomLevel = zoom;
                    
                    // Update the renderer with the new zoom level
                    if (context.renderer) {
                        context.renderer.updateTransform(
                            context.offsetX,
                            context.offsetY,
                            context.zoomLevel
                        );
                    }
                    
                    return 'idle' as const;
                },
                // Layer events
                'selectLayer': (context: EditorContext, layer: number) => {
                    if (layer === -1) {
                        context.currentLayer = -1;
                        return 'allLayers' as const;
                    }
                    if (layer >= 0 && layer < context.MAX_LAYERS) {
                        context.currentLayer = layer;
                    }
                    return 'idle' as const;
                },
                'toggleLayerVisibility': (context: EditorContext, layer: number) => {
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
                    return 'idle' as const;
                },
                'enableAllLayers': (context: EditorContext) => {
                    context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                    return 'idle' as const;
                },
                'disableAllLayers': (context: EditorContext) => {
                    // Keep at least one layer visible
                    const currentVisible = context.layerVisibility[context.currentLayer];
                    context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                    if (currentVisible) {
                        context.layerVisibility[context.currentLayer] = true;
                    } else {
                        context.layerVisibility[0] = true;
                        context.currentLayer = 0;
                    }
                    return 'idle' as const;
                },
                'showAllLayers': (context: EditorContext) => {
                    context.currentLayer = -1;
                    return 'allLayers' as const;
                }
            }
        },
        drawing: {
            on: {
                'stopDrawing': (context: EditorContext) => {
                    // Keep the drawing data for potential use in the idle state
                    return 'idle' as const;
                },
                'cancelDrawing': (context: EditorContext) => {
                    // Reset drawing state
                    context.drawStartX = null;
                    context.drawStartY = null;
                    return 'idle' as const;
                },
                'continueShape': (context: EditorContext, data: { x: number, y: number }) => {
                    // Create the draw operation
                    const drawOp = {
                        type: context.currentTool,
                        layer: context.currentLayer,
                        startX: context.drawStartX!,
                        startY: context.drawStartY!,
                        endX: data.x,
                        endY: data.y,
                        tileIndex: context.currentBrush!.type === 'tile' ? context.currentBrush!.index : 0,
                        isErasing: context.isErasing,
                        brushSize: context.brushSize,
                        customData: null
                    };
                    
                    // Call the renderer directly
                    context.renderer!.draw(drawOp);
                    
                    return 'drawing' as const;
                },
                'setBrushSize': (context: EditorContext, size: number) => {
                    context.brushSize = Math.max(1, size);
                    return 'drawing' as const;
                }
            }
        },
        
        // ===== Layer States =====
        allLayers: {
            enter: (context: EditorContext) => {
                context.currentLayer = -1;
                return context;
            },
            on: {
                'selectLayer': (context: EditorContext, layer: number) => {
                    if (layer >= 0 && layer < context.MAX_LAYERS) {
                        // Only allow selecting visible layers
                        if (context.layerVisibility[layer]) {
                            context.currentLayer = layer;
                            return 'idle' as const;
                        }
                    }
                    return 'allLayers' as const;
                },
                'toggleLayerVisibility': (context: EditorContext, layer: number) => {
                    if (layer >= 0 && layer < context.MAX_LAYERS) {
                        context.layerVisibility[layer] = !context.layerVisibility[layer];
                    }
                    return 'allLayers' as const;
                },
                'enableAllLayers': (context: EditorContext) => {
                    context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                    return 'allLayers' as const;
                },
                'disableAllLayers': (context: EditorContext) => {
                    // Keep at least one layer visible
                    context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                    context.layerVisibility[0] = true;
                    context.currentLayer = 0;
                    return 'idle' as const;
                },
                
                // Tool events that can be used in allLayers mode
                'selectTool': (context: EditorContext, tool: ToolType) => {
                    context.currentTool = tool;
                    return 'allLayers' as const;
                },
                'setBrushSize': (context: EditorContext, size: number) => {
                    context.brushSize = Math.max(1, size);
                    return 'allLayers' as const;
                },
                'toggleGrid': (context: EditorContext) => {
                    // Update both the context showGrid flag and the renderSettings
                    context.showGrid = !context.showGrid;
                    context.renderSettings.showGrid = context.showGrid;
                    
                    // Update the renderer with the new settings
                    if (context.renderer) {
                        context.renderer.updateRenderSettings(context.renderSettings);
                    }
                    
                    return 'allLayers' as const;
                },
                'setZoom': (context: EditorContext, zoom: number) => {
                    context.zoomLevel = zoom;
                    
                    // Update the renderer with the new zoom level
                    if (context.renderer) {
                        context.renderer.updateTransform(
                            context.offsetX,
                            context.offsetY,
                            context.zoomLevel
                        );
                    }
                    
                    return 'allLayers' as const;
                }
            }
        }
    },
    'loading',
    { debug: true }
);

// Start the FSM
editorFSM.start();
