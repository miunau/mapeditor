<script>
    import { fade } from "svelte/transition";
</script>
<div class="loading-screen">
    <figure>
        <img src="/miu.png" alt="Loading..." />
    </figure>
    <div class="loading-text">Loading editor...</div>
</div>

<style>
    .loading-screen {
        display: flex;
        gap: 10px;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 400px;
        font-weight: bold;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(1);
        background: #444;
        padding: 10px;
        color: white;
        opacity: 1;
        transition: all 0.5s ease-in-out;
        @starting-style {
            transform: translate(-50%, -50%) scale(0.85);
            opacity: 0;
        }
    }
</style>