import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'process.env.VERSION': JSON.stringify('1.0.0'),
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
})
