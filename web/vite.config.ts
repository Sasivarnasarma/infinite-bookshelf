import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs separately (uv run infinite-bookshelf-api); proxy /api to it so the
// browser sees one origin, exactly like production where the API serves the built app.
const apiTarget = process.env.IB_API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
