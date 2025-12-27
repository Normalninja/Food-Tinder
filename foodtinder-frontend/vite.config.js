import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Food-Tinder/', // Must match GitHub repo name exactly
  server: {
    host: true, // Allow network access
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
