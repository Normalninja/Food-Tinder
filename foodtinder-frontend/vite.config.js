import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/food-tinder/', // GitHub Pages forces lowercase URLs
  server: {
    host: true, // Allow network access
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
