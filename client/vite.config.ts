import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	base: '/',
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true
			},
			'/health': {
				target: 'http://localhost:3000',
				changeOrigin: true
			}
		}
	},
	build: {
		chunkSizeWarningLimit: 600,
		rollupOptions: {
			output: {
				entryFileNames: `assets/index.js`,
				chunkFileNames: `assets/index.js`,
				assetFileNames: `assets/index.[ext]`
			}
		}
	}
});
