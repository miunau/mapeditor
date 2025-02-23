import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';
import type { CustomBrush } from '../types/map';

export type ToolContext = {
    currentTool: 'brush' | 'fill' | 'eraser';
    brushSize: number;
    selectedTile: number;
    customBrush: CustomBrush | null;
    isWorldAlignedRepeat: boolean;
}

type ToolStateType = 'idle' | 'painting' | 'erasing' | 'filling';

export type ToolStates = {
    idle: FSMState<ToolContext, ToolStateType>;
    painting: FSMState<ToolContext, ToolStateType>;
    erasing: FSMState<ToolContext, ToolStateType>;
    filling: FSMState<ToolContext, ToolStateType>;
}

const initialContext: ToolContext = {
    currentTool: 'brush',
    brushSize: 1,
    selectedTile: 0,
    customBrush: null,
    isWorldAlignedRepeat: false
};

const states: ToolStates = {
    idle: {
        on: {
            'startPaint': 'painting',
            'startErase': 'erasing',
            'startFill': 'filling',
            'selectTool': (context: FSMContext<ToolContext>, tool: 'brush' | 'fill' | 'eraser') => {
                context.currentTool = tool;
                return 'idle';
            },
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'idle';
            },
            'selectTile': (context: FSMContext<ToolContext>, tile: number) => {
                context.selectedTile = tile;
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
    erasing: {
        enter: (context: FSMContext<ToolContext>) => {
            context.currentTool = 'eraser';
            return context;
        },
        on: {
            'stopErase': 'idle',
            'setBrushSize': (context: FSMContext<ToolContext>, size: number) => {
                context.brushSize = Math.max(1, size);
                return 'erasing';
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