import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 7860,
    allowedHosts: ['kritii29-open-env.hf.space']
  }
})