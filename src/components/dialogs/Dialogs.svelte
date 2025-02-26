<script lang="ts">
    import { getDialogs } from "./diag.svelte.js";
    let dialogs = getDialogs();
</script>

<div class="Dialogs">
    {#each dialogs as { name, Component, props } }
        <Component {...props} />
    {/each}
</div>

<style>
    .Dialogs {
        pointer-events: none;
    }

    .Dialogs :global(> div) {
        pointer-events: auto;
    }
</style>