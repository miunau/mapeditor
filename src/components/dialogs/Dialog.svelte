<script lang="ts">
    import type { Snippet } from "svelte";
    let {
        title,
        show,
        onClose,
        children,
        buttonArea,
    }: {
        title: string,
        show: boolean,
        onClose: () => void,
        children: Snippet,
        buttonArea?: Snippet,
    } = $props();

    let isDragging = false;
    let offset = $state({ x: 0, y: 0 });
    let position = $state({ x: 0, y: 0 });
    let dialogElement: HTMLElement;

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

    // Center the dialog when it becomes visible
    $effect(() => {
        if (show && dialogElement) {
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const dialogWidth = dialogElement.offsetWidth;
            const dialogHeight = dialogElement.offsetHeight;

            position = {
                x: Math.max(0, (viewportWidth - dialogWidth) / 2),
                y: Math.max(0, (viewportHeight - dialogHeight) / 2)
            };
        }
    });
</script>

<svelte:window 
    on:mousemove={handleMouseMove} 
    on:mouseup={handleMouseUp}
/>

<div 
    class="dialog" 
    class:show={show}
    style="left: {position.x}px; top: {position.y}px;"
    bind:this={dialogElement}
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
        {#if buttonArea}
            <div class="button-area">
                {@render buttonArea()}
            </div>
        {/if}
    </div>
</div>

<style>
    .window {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        max-height: calc(90vh - 40px);
        min-height: 0;
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
        max-height: calc(100vh - 20px);
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
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
        min-height: 0;
    }

    .button-area {
        display: flex;
        justify-content: flex-end;
        padding: 10px;
    }
</style>