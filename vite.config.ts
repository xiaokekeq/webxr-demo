import { defineConfig } from 'vite';

export default defineConfig( {
	server: {
		host: true,
		port: 5173
	},
	build: {
		rollupOptions: {
			input: {
				index: 'index.html',
				loadModel: 'loadModel.html',
				loadModelAR: 'loadModelAR.html'
			}
		}
	}
} );
