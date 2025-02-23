import { FSM, type FSMContext, type FSMState } from '../utils/fsm.svelte.js';
import type { ZoomLevel, SnapZoomLevel } from '../utils/zoom';
import { findClosestZoomLevel, calculateZoomTransform } from '../utils/zoom';
import type { Point } from '../utils/coordinates';

export type ViewContext = {
    zoomLevel: ZoomLevel;
    offsetX: number;
    offsetY: number;
    showGrid: boolean;
    isPanning: boolean;
    panVelocityX: number;
    panVelocityY: number;
    lastPanX: number;
    lastPanY: number;
    readonly minZoom: number;
    readonly maxZoom: number;
}

type ViewStateType = 'idle' | 'panning' | 'zooming';

export type ViewStates = {
    idle: FSMState<ViewContext, ViewStateType>;
    panning: FSMState<ViewContext, ViewStateType>;
    zooming: FSMState<ViewContext, ViewStateType>;
}

const initialContext: ViewContext = {
    zoomLevel: 1,
    offsetX: 0,
    offsetY: 0,
    showGrid: true,
    isPanning: false,
    panVelocityX: 0,
    panVelocityY: 0,
    lastPanX: 0,
    lastPanY: 0,
    minZoom: 0.25,
    maxZoom: 4
};

const states: ViewStates = {
    idle: {
        on: {
            'startPan': (context: FSMContext<ViewContext>, { x, y }: Point) => {
                context.isPanning = true;
                context.lastPanX = x;
                context.lastPanY = y;
                return 'panning';
            },
            'startZoom': 'zooming',
            'toggleGrid': (context: FSMContext<ViewContext>) => {
                context.showGrid = !context.showGrid;
                return 'idle';
            },
            'setOffset': (context: FSMContext<ViewContext>, { x, y }: Point) => {
                context.offsetX = x;
                context.offsetY = y;
                return 'idle';
            },
            'centerView': (context: FSMContext<ViewContext>, { x, y }: Point) => {
                context.offsetX = x;
                context.offsetY = y;
                context.panVelocityX = 0;
                context.panVelocityY = 0;
                return 'idle';
            },
            'zoom': (context: FSMContext<ViewContext>, { delta, focusPoint }: { delta: number; focusPoint: Point }) => {
                const zoomDelta = -delta * 0.001;
                let newZoom = context.zoomLevel * (1 + zoomDelta);
                
                // Clamp to min/max zoom
                newZoom = Math.max(context.minZoom, Math.min(context.maxZoom, newZoom));

                if (newZoom !== context.zoomLevel) {
                    const transform = calculateZoomTransform(
                        newZoom,
                        context.zoomLevel,
                        focusPoint,
                        { x: context.offsetX, y: context.offsetY }
                    );
                    
                    context.zoomLevel = transform.zoom;
                    context.offsetX = transform.offset.x;
                    context.offsetY = transform.offset.y;
                }
                return 'idle';
            },
            'setZoom': (context: FSMContext<ViewContext>, { level, focusPoint }: { level: SnapZoomLevel; focusPoint: Point }) => {
                const transform = calculateZoomTransform(
                    level,
                    context.zoomLevel,
                    focusPoint,
                    { x: context.offsetX, y: context.offsetY }
                );
                
                context.zoomLevel = transform.zoom;
                context.offsetX = transform.offset.x;
                context.offsetY = transform.offset.y;
                return 'idle';
            }
        }
    },
    panning: {
        on: {
            'updatePan': (context: FSMContext<ViewContext>, { x, y }: Point) => {
                const deltaX = x - context.lastPanX;
                const deltaY = y - context.lastPanY;
                context.offsetX += deltaX;
                context.offsetY += deltaY;
                context.lastPanX = x;
                context.lastPanY = y;
                return 'panning';
            },
            'stopPan': (context: FSMContext<ViewContext>) => {
                context.isPanning = false;
                return 'idle';
            },
            'updatePanVelocity': (context: FSMContext<ViewContext>, { vx, vy }: { vx: number; vy: number }) => {
                context.panVelocityX = vx;
                context.panVelocityY = vy;
                return 'panning';
            }
        }
    },
    zooming: {
        on: {
            'zoom': (context: FSMContext<ViewContext>, { delta, focusPoint }: { delta: number; focusPoint: Point }) => {
                const zoomDelta = -delta * 0.001;
                let newZoom = context.zoomLevel * (1 + zoomDelta);
                
                // Clamp to min/max zoom
                newZoom = Math.max(context.minZoom, Math.min(context.maxZoom, newZoom));

                if (newZoom !== context.zoomLevel) {
                    const transform = calculateZoomTransform(
                        newZoom,
                        context.zoomLevel,
                        focusPoint,
                        { x: context.offsetX, y: context.offsetY }
                    );
                    
                    context.zoomLevel = transform.zoom;
                    context.offsetX = transform.offset.x;
                    context.offsetY = transform.offset.y;
                }
                return 'idle';
            },
            'setZoom': (context: FSMContext<ViewContext>, { level, focusPoint }: { level: SnapZoomLevel; focusPoint: Point }) => {
                const transform = calculateZoomTransform(
                    level,
                    context.zoomLevel,
                    focusPoint,
                    { x: context.offsetX, y: context.offsetY }
                );
                
                context.zoomLevel = transform.zoom;
                context.offsetX = transform.offset.x;
                context.offsetY = transform.offset.y;
                return 'idle';
            }
        }
    }
};

export const viewFSM = $state(new FSM<ViewContext, ViewStates>(
    initialContext,
    states,
    'idle',
    { debug: true }
));

// Start the FSM
viewFSM.start(); 