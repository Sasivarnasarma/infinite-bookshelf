/// <reference types="vitest/config" />
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
    rolldownOptions: {
      output: {
        // Large libraries get files of their own: they download in parallel and stay cached
        // across releases. KaTeX and highlight.js load only with the book reader.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/, priority: 30 },
            { name: 'motion', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'katex', test: /node_modules[\\/]katex[\\/]/, priority: 20 },
            { name: 'highlight', test: /node_modules[\\/](highlight\.js|lowlight)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  // Unit tests for the browser-side logic (pnpm test): plain Node, no page needed
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
