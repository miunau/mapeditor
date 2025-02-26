<script lang="ts">
    import { addDialog } from './dialogs/diag.svelte.js';
    import NewMapDialog from './dialogs/NewMapDialog.svelte';
    import ImportDialog from './dialogs/ImportDialog.svelte';
    import ExportDialog from './dialogs/ExportDialog.svelte';
    import TilemapSettingsDialog from './dialogs/TilemapSettingsDialog.svelte';
    import RenderSettingsDialog from './dialogs/RenderSettingsDialog.svelte';
    import ResizeDialog from './dialogs/ResizeDialog.svelte';
    import HelpDialog from './dialogs/HelpDialog.svelte';

    let activeMenu: string | null = $state(null);

    function handleMenuClick(menu: string) {
        if (activeMenu === menu) {
            activeMenu = null;
        } else {
            activeMenu = menu;
        }
    }

    function handleMenuAction(action: string) {
        activeMenu = null;
        switch (action) {
            case 'new':
                addDialog("new-map", NewMapDialog);
                break;
            case 'load':
                addDialog("import", ImportDialog);
                break;
            case 'save':
                addDialog("export", ExportDialog);
                break;
            case 'resize':
                addDialog("resize-map", ResizeDialog);
                break;
            case 'tilemap-settings':
                addDialog("tilemap-settings", TilemapSettingsDialog);
                break;
            case 'help':
                addDialog("help", HelpDialog);
                break;
            case 'render-settings':
                addDialog("render-settings", RenderSettingsDialog);
                break;
        }
    }

    // Close menu when clicking outside
    function handleClickOutside(event: MouseEvent) {
        if (activeMenu && !(event.target as HTMLElement).closest('.menu-item')) {
            activeMenu = null;
        }
    }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="main-menu">
    <menu>
        <li class="menu-item">
            <button 
                class="button-none menu-button" 
                class:active={activeMenu === 'file'}
                onclick={() => handleMenuClick('file')}
                onmouseenter={() => activeMenu && (activeMenu = 'file')}
            >
                File
            </button>
            {#if activeMenu === 'file'}
                <div class="menu-dropdown">
                    <button class="button-none menu-option" onclick={() => handleMenuAction('new')}>New...</button>
                    <button class="button-none menu-option" onclick={() => handleMenuAction('save')}>Export JSON...</button>
                    <button class="button-none menu-option" onclick={() => handleMenuAction('load')}>Import JSON...</button>
                </div>
            {/if}
        </li>
        <li class="menu-item">
            <button 
                class="button-none menu-button"
                class:active={activeMenu === 'edit'}
                onclick={() => handleMenuClick('edit')}
                onmouseenter={() => activeMenu && (activeMenu = 'edit')}
            >
                Edit
            </button>
            {#if activeMenu === 'edit'}
                <div class="menu-dropdown">
                    <button class="button-none menu-option" onclick={() => handleMenuAction('resize')}>Resize Map...</button>
                    <button class="button-none menu-option" onclick={() => handleMenuAction('tilemap-settings')}>Tilemap Settings...</button>
                    <button class="button-none menu-option" onclick={() => handleMenuAction('render-settings')}>Render Settings...</button>
                </div>
            {/if}
        </li>
        <li class="menu-item">
            <button 
                class="button-none menu-button"
                class:active={activeMenu === 'help'}
                onclick={() => handleMenuClick('help')}
                onmouseenter={() => activeMenu && (activeMenu = 'help')}
            >
                Help
            </button>
            {#if activeMenu === 'help'}
                <div class="menu-dropdown">
                    <button class="button-none menu-option" onclick={() => handleMenuAction('help')}>On-Line Help</button>
                </div>
            {/if}
        </li>
    </menu>
</div>

<style>
    .main-menu {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid #dfdfdf;
    }

    menu {
        display: flex;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    menu li {
        margin: 0;
        padding: 0;
        position: relative;
    }

    .menu-button {
        background-color: transparent;
        border: none;
        padding: 6px 6px;
        position: relative;
    }

    .menu-button.active {
        background: navy;
        color: white;
        border: none !important;
        box-shadow: none !important;
    }

    .menu-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        background: silver;
        border: 1px solid;
        border-color: #dfdfdf #808080 #808080 #dfdfdf;
        box-shadow: 2px 2px 3px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        min-width: 150px;
    }

    .menu-option {
        display: block;
        width: 100%;
        text-align: left;
        padding: 6px 20px;
        font-size: 11px;
        background: transparent;
        border: none;
        white-space: nowrap;
    }

    .menu-option:hover {
        background: navy;
        color: white;
    }
</style>