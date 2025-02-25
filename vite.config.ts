import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		https: {
			cert: './macca.tail753da.ts.net.crt',
			key: './macca.tail753da.ts.net.key'
		},
		allowedHosts: ['macca.tail753da.ts.net'],
		headers: {
			// Headers required for SharedArrayBuffer
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin'
		}
	},
	worker: {
		format: 'es', // Ensure workers use ES modules
		rollupOptions: {
			// Make sure worker dependencies are properly bundled
			output: {
				format: 'es'
			}
		}
	}
});
