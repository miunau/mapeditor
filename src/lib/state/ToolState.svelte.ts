import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';
import type { CustomBrush } from '../types/map';
import { editorStore } from './EditorStore.svelte';

export type ToolContext = {
    currentTool: 'brush' | 'fill' | 'rectangle' | 'ellipse';
    brushSize: number;
    selectedTile: number;
    customBrush: CustomBrush | null;
    isWorldAlignedRepeat: boolean;
}

type ToolStateType = 'idle' | 'painting' | 'filling' | 'drawingRectangle' | 'drawingEllipse';

export type ToolStates = {
    idle: FSMState<ToolContext, ToolStateType>;
    painting: FSMState<ToolContext, ToolStateType>;
    filling: FSMState<ToolContext, ToolStateType>;
    drawingRectangle: FSMState<ToolContext, ToolStateType>;
    drawingEllipse: FSMState<ToolContext, ToolStateType>;
}

const initialContext: ToolContext = {
    currentTool: 'brush',
    brushSize: 1,
    selectedTile: -1,
    customBrush: null,
    isWorldAlignedRepeat: false
};

const states: ToolStates = {
    idle: {
        on: {
            'startPaint': 'painting',
            'startFill': 'filling',
            'startRectangle': 'drawingRectangle',
            'startEllipse': 'drawingEllipse',
            'selectTool': (context: FSMContext<ToolContext>, tool: 'brush' | 'fill' | 'rectangle' | 'ellipse') => {
                context.currentTool = tool;
                return 'idle';
            },
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'idle';
            },
            'selectTile': (context: FSMContext<ToolContext>, tile: number) => {
                if (!editorStore.showCustomBrushDialog) {
                    context.selectedTile = tile;
                }
                return 'idle';
            },
            'selectCustomBrush': (context: FSMContext<ToolContext>, brush: CustomBrush | null) => {
                context.customBrush = brush;
                return 'idle';
            },
            'toggleWorldAlignedRepeat': (context: FSMContext<ToolContext>) => {
                context.isWorldAlignedRepeat = !context.isWorldAlignedRepeat;
                return 'idle';
            }
        }
    },
    painting: {
        enter: (context: FSMContext<ToolContext>) => {
            context.currentTool = 'brush';
            return context;
        },
        on: {
            'stopPaint': 'idle',
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'painting';
            }
        }
    },
    filling: {
        enter: (context: FSMContext<ToolContext>) => {
            context.currentTool = 'fill';
            return context;
        },
        on: {
            'stopFill': 'idle'
        }
    },
    drawingRectangle: {
        enter: (context: FSMContext<ToolContext>) => {
            context.currentTool = 'rectangle';
            return context;
        },
        on: {
            'stopRectangle': 'idle',
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'drawingRectangle';
            }
        }
    },
    drawingEllipse: {
        enter: (context: FSMContext<ToolContext>) => {
            context.currentTool = 'ellipse';
            return context;
        },
        on: {
            'stopEllipse': 'idle',
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'drawingEllipse';
            }
        }
    }
};

export const toolFSM = $state(new FSM<ToolContext, ToolStates>(
    initialContext,
    states,
    'idle',
    { debug: true }
));

// Start the FSM
toolFSM.start(); 