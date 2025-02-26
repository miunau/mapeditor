import type { EditorContext } from "$lib/state/EditorStore.svelte";
import type { FSM } from "$lib/utils/fsm.svelte";

export async function createWorker(machine: FSM<EditorContext, any>, url: string) {
    // Use the Vite-recommended way to import workers
    const workerUrl = new URL(url, import.meta.url);
    console.log('Creating worker with URL:', workerUrl.toString());

    // Create the worker with correct module syntax
    const worker = new Worker(workerUrl, { type: 'module' });

    // Return a promise that resolves when the worker is initialized or rejects on error
    return new Promise<Worker>((resolve, reject) => {
        // Set a timeout to reject if initialization takes too long
        const timeoutId = setTimeout(() => {
            reject(new Error('Worker initialization timed out'));
        }, 10000); // 10 second timeout
        
        // Add error handling for the worker
        worker.onerror = (e: ErrorEvent) => {
            clearTimeout(timeoutId);
            console.error('Worker error:', e);
            console.error('Error details:', {
                message: (e as any).message || 'No message',
                filename: (e as any).filename || 'No filename',
                lineno: (e as any).lineno || 'No line number',
                colno: (e as any).colno || 'No column number'
            });
            
            machine.send('error', {
                reason: 'Failed to create worker.'
            });
            
            reject(new Error(`Worker error: ${(e as any).message || 'Unknown error'}`));
        };

        let loaded = false;

        // Store the original onmessage handler if it exists
        const originalOnMessage = worker.onmessage;

        // Handle messages from the worker
        worker.onmessage = (e: MessageEvent) => {
            if (loaded) {
                if(e.data.type === 'fpsUpdate') {
                    machine.context.fps = e.data.fps;
                }
            }
            
            // Check if this is the initialization message
            if (e.data && e.data.type === 'loaded') {
                clearTimeout(timeoutId);
                loaded = true;
                
                // Don't overwrite the onmessage handler when resolving
                resolve(worker);
            }
        };
    });
}