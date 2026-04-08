import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 7860,
    allowedHosts: ['kritii29-open-env.hf.space']
  },
  build: {
    outDir: 'dist'
  }
})