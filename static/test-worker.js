// Simple test worker to verify functionality
console.log('Test worker initialized');

self.onmessage = function(e) {
  console.log('Test worker received message:', e.data);
  self.postMessage({ type: 'response', message: 'Test worker is working!' });
};

self.onerror = function(e) {
  console.error('Test worker error:', e);
};

// Let the main thread know we're ready
self.postMessage({ type: 'ready' }); 