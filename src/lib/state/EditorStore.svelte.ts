import type { ToolType, Brush } from '$lib/types/drawing.js';
import type { RenderSettings } from '$lib/utils/settings.js';
import { FSM } from '$lib/utils/fsm.svelte.js';
import { defaultRenderSettings } from '$lib/utils/settings.js';
import { Tilemap } from '$lib/utils/tilemap';
import { createWorker } from '$lib/workers/createWorker';
import { PaletteManager } from '$lib/managers/PaletteManager.svelte.js';
import { MapDataManager, type MapData } from '$lib/managers/MapDataManager.svelte.js';
import { Renderer } from '$lib/renderer/Renderer.svelte.js';
import { HIDManager } from '$lib/managers/HIDManager.svelte.js';
import type { SvelteMap } from 'svelte/reactivity';

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
    currentBrush: Brush | null;
    paletteManager: PaletteManager | null;
    brushes: Map<string, Brush>;
    brushSize: number;
    drawStartX: number | null;
    drawStartY: number | null;
    isErasing: boolean;

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
        currentBrush: null,
        paletteManager: null,
        brushes: new Map(),
        brushSize: 1,
        drawStartX: null,
        drawStartY: null,
        isErasing: false,

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

                    debug('Creating palette manager');

                    context.paletteManager = new PaletteManager(context.paletteCanvas, context.tilemap, initialWidth, initialHeight);

                    debug('Creating map data manager');
                    context.mapDataManager = new MapDataManager(
                        context.mapWidth,
                        context.mapHeight,
                        context.layerCount,
                        context.tilemap!
                    );

                    debug('Drawing palette');
                    context.paletteManager.drawPalette();

                    debug('Creating undo stack');
                    context.undoStack = [context.mapDataManager!.cloneMapData()];
                    context.redoStack = [];

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
                'startDrawing': (context: EditorContext, data: { x: number, y: number, isErasing: boolean, mapX?: number, mapY?: number }) => {
                    context.drawStartX = data.mapX !== undefined ? data.mapX : data.x;
                    context.drawStartY = data.mapY !== undefined ? data.mapY : data.y;
                    context.isErasing = data.isErasing;
                    return 'drawing' as const;
                },
                'selectTool': (context: EditorContext, tool: ToolType) => {
                    context.currentTool = tool;
                    return 'idle' as const;
                },
                'selectBrush': (context: EditorContext, brushId: string) => {
                    context.currentBrush = context.brushes.get(brushId)!;
                    return 'idle' as const;
                },
                'setBrushSize': (context: EditorContext, size: number) => {
                    context.brushSize = Math.max(1, size);
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
                        return 'idle' as const;
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
                    return 'idle' as const;
                }
            }
        },
        drawing: {
            on: {
                'stopDrawing': (context: EditorContext) => {
                    return 'idle' as const;
                },
                'cancelDrawing': (context: EditorContext) => {
                    // Reset drawing state
                    context.drawStartX = null;
                    context.drawStartY = null;
                    return 'idle' as const;
                },
                'setBrushSize': (context: EditorContext, size: number) => {
                    context.brushSize = Math.max(1, size);
                    return 'drawing' as const;
                }
            }
        },
    },
    'loading',
    { debug: true }
);

// Start the FSM
editorFSM.start();
