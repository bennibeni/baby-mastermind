import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Due pagine: il gioco (index.html) e il laboratorio (laboratorio.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { gioco: resolve(__dirname, 'index.html'), laboratorio: resolve(__dirname, 'laboratorio.html') },
    },
  },
});
