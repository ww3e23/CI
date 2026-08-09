import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://ww3e23.github.io/CI/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
})
