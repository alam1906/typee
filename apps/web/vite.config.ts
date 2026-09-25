import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({ adapter: adapter({ fallback: '200.html', precompress: true }) })
	],
	server: {
		proxy: {
			'/api': {
				target: process.env.TYPEE_PB_PROXY_URL || 'http://127.0.0.1:8090',
				changeOrigin: true
			}
		}
	}
});
