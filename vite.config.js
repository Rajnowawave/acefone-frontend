import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000, // increase limit to 1000 KB
    rollupOptions: {
      output: {
        manualChunks: {
          // Split big dependencies into separate chunks
          react: ['react', 'react-dom'],
          firebase: [
            'firebase/app',
            'firebase/firestore',
            'firebase/auth',
            'firebase/storage'
          ],
          chartjs: ['chart.js'],
          leaflet: ['leaflet']
        }
      }
    }
  }
});
