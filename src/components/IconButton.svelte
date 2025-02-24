<script lang="ts">
    import type { Component, Snippet } from "svelte";

    let {
        Icon,
        title,
        onclick,
        children,
        active,
    }: {
        Icon: Component,
        title: string,
        onclick: () => void,
        children: Snippet,
        active?: boolean,
    } = $props()
</script>

<button onclick={onclick} title={title} class:active={active}>
    <Icon />
    {@render children()}
</button>

<style> 
    button {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        height: auto;
        gap: 6px;
        padding: 6px 12px;
        font-size: 11px;
    }
</style>