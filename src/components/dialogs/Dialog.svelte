<script lang="ts">
    import type { Snippet } from "svelte";
    let {
        title,
        show,
        onClose,
        children
    }: {
        title: string,
        show: boolean,
        onClose: () => void,
        children: Snippet
    } = $props();

    let isDragging = false;
    let offset = $state({ x: 0, y: 0 });
    let position = $state({ x: 200, y: 100 });

    function handleMouseDown(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        offset.x = e.clientX - position.x;
        offset.y = e.clientY - position.y;
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        position = {
            x: e.clientX - offset.x,
            y: e.clientY - offset.y
        };
    }

    function handleMouseUp(e: MouseEvent) {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
        isDragging = false;
    }
</script>

<svelte:window 
    on:mousemove={handleMouseMove} 
    on:mouseup={handleMouseUp}
/>

<div 
    class="dialog" 
    class:show={show}
    style="left: {position.x}px; top: {position.y}px;"
>
    <div class="window">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="title-bar"
            onmousedown={handleMouseDown}
        >
            <div class="title-bar-text">{title}</div>
            <div class="title-bar-controls">
                <button aria-label="Close" onclick={onClose}></button>
            </div>
        </div>
        <div class="window-body">
            {@render children()}
        </div>
    </div>
</div>

<style>
    .window {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
    }
    
    .dialog {
        display: none;
        position: fixed;
        z-index: 1000;
        user-select: none;
        background: white;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        min-width: 200px;
        min-height: 100px;
    }

    .dialog.show {
        display: block;
    }

    .title-bar {
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .window-body {
        overflow: auto;
    }
</style>