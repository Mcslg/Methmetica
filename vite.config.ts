import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Methmetica/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }

          if (id.includes('node_modules/@xyflow/') || id.includes('node_modules/zustand/')) {
            return 'flow-vendor';
          }

          if (
            id.includes('node_modules/@tiptap/') ||
            id.includes('node_modules/prosemirror-')
          ) {
            return 'editor-vendor';
          }

          if (id.includes('node_modules/katex/')) {
            return 'katex-vendor';
          }

          if (id.includes('node_modules/mathlive/')) {
            return 'mathlive-vendor';
          }

          if (
            id.includes('node_modules/nerdamer/') ||
            id.includes('node_modules/@cortex-js/compute-engine/')
          ) {
            return 'symbolic-vendor';
          }
        },
      },
    },
  },
})
