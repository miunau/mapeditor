<script lang="ts">
    import "./98.css";
    import "./style.css";
    import { editorFSM } from "$lib/state/EditorStore.svelte.js";
    import { base } from "$app/paths";
    import Toolbar from "../components/Toolbar.svelte";
    import { onDestroy, onMount } from "svelte";
    import MainMenu from "../components/MainMenu.svelte";
    import LoadingScreen from "../components/LoadingScreen.svelte";
    import Dialogs from "../components/dialogs/Dialogs.svelte";

    let editorCanvas: HTMLCanvasElement | undefined = $state();
    let paletteCanvas: HTMLCanvasElement | undefined = $state();
    let editorContainer: HTMLElement | undefined = $state();
    let mapWidth = $state(30);
    let mapHeight = $state(30);
    let resizeTimeout: number | null = $state(null);

    const url = `${base}/tilemap.png`;

    onMount(() => {
        editorFSM.send('init', {
            canvas: editorCanvas,
            container: editorContainer,
            paletteCanvas: paletteCanvas,
            debug: true,
        });
    });

    console.log('editorFSM', editorFSM)
</script>

<svelte:head>
    <title>miunau's map editor</title>
</svelte:head>

<div class="window">
    <div class="title-bar">
        <div class="title-bar-text">Miunau's Map Editor 2000</div>
    </div>
    {#if editorFSM.state === 'loading'}
        <LoadingScreen />
    {:else if editorFSM.state === 'failed'}
        <div class="window-body">
            <p><strong>An error occurred: {editorFSM.context.failReason}</strong></p>
        </div>
    {/if}
    <div class="main-menu"> 
        <MainMenu />
    </div>
    <div class="window-body">
        <Toolbar />
        <div class="editor-container" bind:this={editorContainer}>
            <canvas id="editor-canvas" bind:this={editorCanvas}></canvas>
            <canvas id="palette-canvas" bind:this={paletteCanvas}></canvas>
        </div>
    </div>
    <div class="status-bar">
        <p class="status-bar-field">Selected tile: {editorFSM.context.currentBrush?.type === 'tile' ? editorFSM.context.currentBrush.index : 'Custom brush'}</p>
        <p class="status-bar-field">Brush size: {editorFSM.context.brushSize}</p>
        {#if editorFSM.context.renderSettings.showFPS}
            <p class="status-bar-field">FPS: {editorFSM.context.fps ?? 0}</p>
        {/if}
    </div>
</div>

<Dialogs />
<style>
    .window {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
    }
    .window-body {
        display: grid;
        grid-template-rows: auto 1fr;
        min-height: 0;
        padding: 8px;
    }
    .status-bar {
        display: flex;
        gap: 8px;
        padding: 0 8px 8px 8px;
        justify-content: space-between;
    }
    .status-bar-field {
        padding: 6px;
        font-weight: bold;
        margin: 0;
    }
    .editor-container {
        min-height: 0;
        min-width: 0;
        position: relative;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: #333;
    }
    canvas {
        display: block;
        border: 0;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }
</style>