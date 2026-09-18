import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import AstroPWA from '@vite-pwa/astro';

// https://astro.build/config
export default defineConfig({
  // Set `site` (and `base` if deploying under a sub-path) before deploying.
  // Image paths honour `base` through import.meta.env.BASE_URL.
  integrations: [
    vue(),
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Tarot Table',
        short_name: 'Tarot',
        description: 'A touch-first tarot table: shuffle, draw, lay spreads and read cards on any device.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#202028',
        theme_color: '#202028',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell and every deck image so the table works fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
