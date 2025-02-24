import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';

export type LayerContext = {
    currentLayer: number;  // The layer being edited
    showAllLayers: boolean;  // For opacity/editing view
    layerOpacities: number[];
    layerVisibility: boolean[];  // Whether layer is enabled at all
    readonly MAX_LAYERS: number;
}

type LayerStateType = 'normal' | 'allLayers';

export type LayerStates = {
    normal: FSMState<LayerContext, LayerStateType>;
    allLayers: FSMState<LayerContext, LayerStateType>;
}

const initialContext: LayerContext = {
    currentLayer: 0,
    showAllLayers: false,
    layerOpacities: Array(10).fill(1),
    layerVisibility: Array(10).fill(true),
    MAX_LAYERS: 10
};

const states: LayerStates = {
    normal: {
        enter: (context: FSMContext<LayerContext>) => {
            context.showAllLayers = false;
            return context;
        },
        on: {
            'showAllLayers': 'allLayers',
            'selectLayer': (context: FSMContext<LayerContext>, layer: number) => {
                if (layer === -1) {
                    context.currentLayer = -1;
                    context.showAllLayers = true;
                    return 'allLayers';
                }
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.currentLayer = layer;
                }
                return 'normal';
            },
            'setLayerOpacity': (context: FSMContext<LayerContext>, { layer, opacity }: { layer: number; opacity: number }) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerOpacities[layer] = Math.max(0, Math.min(1, opacity));
                }
                return 'normal';
            },
            'toggleLayerVisibility': (context: FSMContext<LayerContext>, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    // Toggle visibility for this layer
                    context.layerVisibility[layer] = !context.layerVisibility[layer];
                    
                    // If we're disabling the current editing layer, switch to the next visible layer
                    if (!context.layerVisibility[layer] && context.currentLayer === layer) {
                        const nextVisibleLayer = context.layerVisibility.findIndex((visible, i) => visible && i !== layer);
                        if (nextVisibleLayer !== -1) {
                            context.currentLayer = nextVisibleLayer;
                        }
                    }
                }
                return 'normal';
            },
            'enableAllLayers': (context: FSMContext<LayerContext>) => {
                context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                return 'normal';
            },
            'disableAllLayers': (context: FSMContext<LayerContext>) => {
                // Keep at least one layer visible
                const currentVisible = context.layerVisibility[context.currentLayer];
                context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                if (currentVisible) {
                    context.layerVisibility[context.currentLayer] = true;
                } else {
                    context.layerVisibility[0] = true;
                    context.currentLayer = 0;
                }
                return 'normal';
            }
        }
    },
    allLayers: {
        enter: (context: FSMContext<LayerContext>) => {
            context.showAllLayers = true;
            context.currentLayer = -1;
            return context;
        },
        on: {
            'selectLayer': (context: FSMContext<LayerContext>, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    // Only allow selecting visible layers
                    if (context.layerVisibility[layer]) {
                        context.currentLayer = layer;
                        context.showAllLayers = false;
                        return 'normal';
                    }
                }
                return 'allLayers';
            },
            'setLayerOpacity': (context: FSMContext<LayerContext>, { layer, opacity }: { layer: number; opacity: number }) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerOpacities[layer] = Math.max(0, Math.min(1, opacity));
                }
                return 'allLayers';
            },
            'toggleLayerVisibility': (context: FSMContext<LayerContext>, layer: number) => {
                if (layer >= 0 && layer < context.MAX_LAYERS) {
                    context.layerVisibility[layer] = !context.layerVisibility[layer];
                }
                return 'allLayers';
            },
            'enableAllLayers': (context: FSMContext<LayerContext>) => {
                context.layerVisibility = Array(context.MAX_LAYERS).fill(true);
                return 'allLayers';
            },
            'disableAllLayers': (context: FSMContext<LayerContext>) => {
                // Keep at least one layer visible
                context.layerVisibility = Array(context.MAX_LAYERS).fill(false);
                context.layerVisibility[0] = true;
                context.currentLayer = 0;
                context.showAllLayers = false;
                return 'normal';
            }
        }
    }
};

export const layerFSM = $state(new FSM<LayerContext, LayerStates>(
    initialContext,
    states,
    'normal',
    { debug: true }
));

// Start the FSM
layerFSM.start(); 