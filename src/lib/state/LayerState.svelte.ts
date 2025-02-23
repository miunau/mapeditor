import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';

export type LayerContext = {
    currentLayer: number;
    showAllLayers: boolean;
    layerOpacities: number[];
    layerVisibility: boolean[];
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
                    context.layerVisibility[layer] = !context.layerVisibility[layer];
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
                    context.currentLayer = layer;
                    context.showAllLayers = false;
                    return 'normal';
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