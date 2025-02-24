<script lang="ts">
    import "./style.css";
    import "./98.css";
    import { ReactiveMapEditor } from "$lib/MapEditor.svelte";
    import { base } from "$app/paths";
    import { drawTile } from "$lib/drawTile";
    import Toolbar from "../components/Toolbar.svelte";
    import LayerControls from "../components/LayerControls.svelte";
    import { onDestroy } from "svelte";
    import NewMapDialog from "../components/dialogs/NewMapDialog.svelte";
    import ResizeDialog from "../components/dialogs/ResizeDialog.svelte";
    import TilemapSettingsDialog from "../components/dialogs/TilemapSettingsDialog.svelte";
    import ImportDialog from "../components/dialogs/ImportDialog.svelte";
    import ExportDialog from "../components/dialogs/ExportDialog.svelte";
    import ShortcutsDialog from "../components/dialogs/ShortcutsDialog.svelte";
    import CustomBrushDialog from "../components/dialogs/CustomBrushDialog.svelte";
    import { editorStore } from "$lib/state/EditorStore.svelte";
  import MainMenu from "../components/MainMenu.svelte";

    let editorCanvas: HTMLCanvasElement | undefined = $state();
    let editor: ReactiveMapEditor | undefined = $state();
    let animationFrame: number | undefined = $state();

    let mapWidth = $state(64);
    let mapHeight = $state(32);

    const url = `${base}/tilemap.png`;

    $effect(() => {
        if (editorCanvas) {
            editorStore.setCanvas(editorCanvas);
            if (!editor) {  // Only create editor if it doesn't exist
                editor = new ReactiveMapEditor(editorCanvas, mapWidth, mapHeight);
                editorStore.setEditor(editor);
                initEditor();
            }
        }
    });

    async function initEditor() {
        if (!editor) return;
        
        await editor.init();
        editorLoop();

        // Set up event listeners
        editorCanvas!.addEventListener('mousedown', handleMouseDown);
        editorCanvas!.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('resize', handleResize);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Prevent context menu on right click
        editorCanvas!.addEventListener('contextmenu', (e) => e.preventDefault());

        // Initial resize and center
        handleResize();
        editor.centerMap();
    }

    function editorLoop() {
        if (!editor) return;
        editor.update();
        animationFrame = requestAnimationFrame(editorLoop);
    }

    function handleMouseDown(e: MouseEvent) {
        editor?.handleMouseDown(e);
    }

    function handleMouseMove(e: MouseEvent) {
        editor?.handleMouseMove(e);
    }

    function handleMouseUp() {
        editor?.handleMouseUp();
    }

    function handleResize() {
        editor?.resize();
    }

    function handleKeyDown(e: KeyboardEvent) {
        // Handle dialog-specific shortcuts
        if (e.key === '?' || (e.key === 'h' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            editorStore.setShowShortcuts(!editorStore.showShortcuts);
            return;
        }

        if (e.key === 'e' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            editorStore.setShowExportDialog(true);
            return;
        }

        if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            editorStore.setShowImportDialog(true);
            return;
        }

        // Pass other keyboard events to the editor
        editor?.handleKeyDown(e);
    }

    function handleKeyUp(e: KeyboardEvent) {
        editor?.handleKeyUp(e);
    }

    onDestroy(() => {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        // Clean up event listeners
        if (editorCanvas) {
            editorCanvas.removeEventListener('mousedown', handleMouseDown);
            editorCanvas.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('resize', handleResize);
        }
    });
</script>

<svelte:head>
    <title>miunau's map editor</title>
</svelte:head>

<div class="window">
    <div class="title-bar">
        <div class="title-bar-text">miunau's map editor</div>
    </div>
    <div class="main-menu"> 
        <MainMenu />
    </div>
    <div class="window-body">
        {#if editor}
            <Toolbar />
            <LayerControls />
            <NewMapDialog />
            <ResizeDialog />
            <TilemapSettingsDialog />
            <ImportDialog />
            <ExportDialog />
            <ShortcutsDialog />
            <CustomBrushDialog />
        {/if}
        <div class="editor-container">
            <canvas id="editor-canvas" bind:this={editorCanvas}></canvas>
        </div>
    </div>
    <div class="status-bar">
        <p class="status-bar-field">Press F1 for help</p>
        <p class="status-bar-field">Slide 1</p>
        <p class="status-bar-field">CPU Usage: 14%</p>
    </div>
</div>

<style>
    .window {
        height: 100%;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
    }
    .window-body {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .status-bar {
        height: 100%;
        min-height: 0;
    }
    .editor-container {
        flex: 1;
        width: 100%;
        height: 100%;
    }
    canvas {
        flex: 1;
        width: 100%;
        height: 100%;
    }
</style>