import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

// GitHub Pages: https://ww3e23.github.io/CI/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: '現場查驗｜SITE INSPECTION',
        short_name: '現場查驗',
        description: '手機優先現場驗屋查驗系統',
        theme_color: '#2F5D4C',
        background_color: '#EFEBE1',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-Hant',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // 主包含 exceljs 等，超過預設 2MiB 會讓整次 Pages 部署失敗
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // HTML 優先打網路，減少手機 PWA 一直吃到舊 index
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ci-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base,
})
