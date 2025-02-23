import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';
import type { MapData } from '../types/map';
import { cloneMapData } from '../types/map';

export type HistoryContext = {
    undoStack: MapData[];
    redoStack: MapData[];
    hasUnsavedChanges: boolean;
    currentMapData: MapData;
    readonly maxUndoSteps: number;
}

type HistoryStateType = 'clean' | 'dirty';

export type HistoryStates = {
    clean: FSMState<HistoryContext, HistoryStateType>;
    dirty: FSMState<HistoryContext, HistoryStateType>;
}

const initialContext: HistoryContext = {
    undoStack: [],
    redoStack: [],
    hasUnsavedChanges: false,
    currentMapData: [],
    maxUndoSteps: 50
};

const states: HistoryStates = {
    clean: {
        enter: (context: FSMContext<HistoryContext>) => {
            context.hasUnsavedChanges = false;
            return context;
        },
        on: {
            'saveState': (context: FSMContext<HistoryContext>, mapData: MapData) => {
                const currentState = cloneMapData(mapData);
                context.undoStack.push(currentState);
                context.currentMapData = currentState;
                
                // Trim undo stack if it's too long
                if (context.undoStack.length > context.maxUndoSteps && context.undoStack.length > 1) {
                    context.undoStack.shift();
                }
                
                // Clear redo stack when new state is saved
                context.redoStack = [];
                return 'dirty';
            },
            'markSaved': 'clean'
        }
    },
    dirty: {
        enter: (context: FSMContext<HistoryContext>) => {
            context.hasUnsavedChanges = true;
            return context;
        },
        on: {
            'undo': (context: FSMContext<HistoryContext>) => {
                if (context.undoStack.length > 1) {
                    // Get the current state
                    const currentState = context.undoStack.pop()!;
                    
                    // Add to redo stack
                    context.redoStack.push(currentState);
                    
                    // Apply the previous state
                    const previousState = context.undoStack[context.undoStack.length - 1];
                    context.currentMapData = cloneMapData(previousState);
                }
                return 'dirty';
            },
            'redo': (context: FSMContext<HistoryContext>) => {
                if (context.redoStack.length > 0) {
                    const stateToRedo = context.redoStack.pop()!;
                    context.undoStack.push(stateToRedo);
                    context.currentMapData = cloneMapData(stateToRedo);
                }
                return 'dirty';
            },
            'saveState': (context: FSMContext<HistoryContext>, mapData: MapData) => {
                const currentState = cloneMapData(mapData);
                context.undoStack.push(currentState);
                context.currentMapData = currentState;
                
                // Trim undo stack if it's too long
                if (context.undoStack.length > context.maxUndoSteps && context.undoStack.length > 1) {
                    context.undoStack.shift();
                }
                
                // Clear redo stack when new state is saved
                context.redoStack = [];
                return 'dirty';
            },
            'markSaved': 'clean'
        }
    }
};

export const historyFSM = $state(new FSM<HistoryContext, HistoryStates>(
    initialContext,
    states,
    'clean',
    { debug: true }
));

// Start the FSM
historyFSM.start(); 