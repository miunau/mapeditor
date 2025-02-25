<script lang="ts">
    import { onMount } from 'svelte';
    let testResult = 'Running tests...';
    
    function testSharedArrayBuffer() {
        try {
            const sab = new SharedArrayBuffer(1024);
            const array = new Int32Array(sab);
            array[0] = 42;
            
            return `SharedArrayBuffer test succeeded! Value: ${array[0]}`;
        } catch (error: any) {
            console.error('SharedArrayBuffer test failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            return `SharedArrayBuffer test failed: ${errorMessage}`;
        }
    }
    
    function testCrossOriginIsolation() {
        return `Cross-Origin Isolation: ${window.crossOriginIsolated ? 'Enabled' : 'Disabled'}`;
    }
    
    async function testRealWorker() {
        return new Promise((resolve) => {
            try {
                console.log('Testing RenderWorker');
                
                // Use the real RenderWorker
                const workerUrl = new URL('../../lib/workers/RenderWorker.ts', import.meta.url);
                console.log('RenderWorker URL:', workerUrl.toString());
                
                const testWorker = new Worker(workerUrl, { type: 'module' });
                
                const timeout = setTimeout(() => {
                    console.error('RenderWorker timed out');
                    testWorker.terminate();
                    resolve('RenderWorker test timed out');
                }, 5000);
                
                testWorker.onmessage = (e) => {
                    console.log('RenderWorker message received:', e.data);
                    clearTimeout(timeout);
                    testWorker.terminate();
                    resolve('RenderWorker test succeeded!');
                };
                
                testWorker.onerror = (e) => {
                    console.error('RenderWorker error:', e);
                    console.error('Details:', {
                        message: (e as any).message || 'No message',
                        filename: (e as any).filename || 'No filename',
                        lineno: (e as any).lineno || 'No line number'
                    });
                    clearTimeout(timeout);
                    testWorker.terminate();
                    resolve(`RenderWorker test failed with error: ${(e as any).message || 'Unknown error'}`);
                };
                
                // Send a test message to the worker
                testWorker.postMessage({ type: 'test' });
                
            } catch (error: any) {
                console.error('RenderWorker creation failed:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                resolve(`RenderWorker test failed: ${errorMessage}`);
            }
        });
    }
    
    async function runAllTests() {
        testResult = 'Running tests...\n\n';
        
        // Test 1: SharedArrayBuffer
        const sabResult = testSharedArrayBuffer();
        testResult += `${sabResult}\n\n`;
        
        // Test 2: Cross-Origin Isolation
        const coiResult = testCrossOriginIsolation();
        testResult += `${coiResult}\n\n`;
        
        // Test 3: RenderWorker
        const workerResult = await testRealWorker();
        testResult += `${workerResult}\n\n`;
        
        testResult += 'All tests completed.';
    }
    
    onMount(() => {
        runAllTests();
    });
</script>

<div class="container">
    <h1>Web Worker and SharedArrayBuffer Test</h1>
    
    <div class="test-results">
        <h2>Test Results</h2>
        <pre>{testResult}</pre>
    </div>
    
    <button on:click={runAllTests}>Run Tests Again</button>
    
    <div class="info">
        <h2>Security Headers</h2>
        <p>For SharedArrayBuffer to work, your server needs the following headers:</p>
        <pre>
            Cross-Origin-Embedder-Policy: require-corp
            Cross-Origin-Opener-Policy: same-origin
        </pre>
    </div>
</div>

<style>
    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        font-family: system-ui, -apple-system, sans-serif;
    }
    
    h1 {
        color: #333;
    }
    
    .test-results {
        margin: 2rem 0;
    }
    
    pre {
        background-color: #f5f5f5;
        padding: 1rem;
        border-radius: 4px;
        overflow-x: auto;
        white-space: pre-wrap;
    }
    
    button {
        background-color: #4CAF50;
        color: white;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
    }
    
    button:hover {
        background-color: #45a049;
    }
    
    .info {
        margin-top: 2rem;
        padding: 1rem;
        background-color: #e6f7ff;
        border-radius: 4px;
    }
</style> 