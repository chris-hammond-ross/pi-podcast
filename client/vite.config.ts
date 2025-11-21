import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		rollupOptions: {
			output: {
				entryFileNames: `assets/index.js`,
				chunkFileNames: `assets/index.js`,
				assetFileNames: `assets/index.[ext]`
			}
		}
	}
});
