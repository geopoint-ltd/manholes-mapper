import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'

const hasLocalCerts = existsSync('./manholes-mapper.local+5.pem') && existsSync('./manholes-mapper.local+5-key.pem')

export default defineConfig({
  plugins: [
    react(),
  ],
  base: '/',
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/[name]-[hash:8].css';
          }
          return 'assets/[name][extname]';
        },
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'three-vendor';
            }
            if (id.includes('better-auth')) {
              return 'auth';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            // Separate proj4 (~44KB minified) — only needed by projections.js
            if (id.includes('proj4') || id.includes('mgrs') || id.includes('wkt-parser')) {
              return 'proj4-vendor';
            }
            // Leaflet + Geoman (~350KB minified) are only used by the lazily
            // imported annotation layer — keep them out of the eager vendor chunk.
            if (id.includes('leaflet') || id.includes('geoman')) {
              return 'leaflet-vendor';
            }
            return 'vendor';
          }
          // App code is NOT manually chunked. Forcing dynamically-imported app
          // modules (survey/admin/cockpit/…) into named chunks made Rollup drag
          // their shared deps (i18n, db, auth, gnss, map, …) into those chunks,
          // turning them into STATIC deps of the entry — ~1.5MB of "lazy" JS
          // executed on every startup. Rollup's automatic chunking splits
          // dynamic imports correctly on its own.
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for smaller output (no legacy polyfills)
    target: 'es2022',
    // Skip modulepreload polyfill (~2KB) — all target browsers support it natively
    modulePreload: { polyfill: false },

  },
  server: {
    // When running under vercel dev, let Vercel control the port
    // Otherwise default to 5173 for standalone vite dev
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    host: '127.0.0.1',
    // Use local certs if available (from mkcert)
    https: hasLocalCerts ? {
      cert: './manholes-mapper.local+5.pem',
      key: './manholes-mapper.local+5-key.pem',
    } : undefined,
    // Disable HMR when running through vercel dev (Vercel doesn't proxy WebSockets)
    // You'll need to manually refresh after code changes when using `npm start`
    // Use `npm run dev` for HMR if you don't need API routes
    hmr: process.env.PORT ? false : undefined,
    // Proxy /api requests to production when running standalone vite dev
    proxy: process.env.PORT ? undefined : {
      '/api': {
        target: 'https://manholes-mapper-three.vercel.app',
        changeOrigin: true,
        secure: true,
        headers: {
          Origin: 'https://manholes-mapper-three.vercel.app',
        },
      },
    },
  },
  preview: {
    host: true,
  }
})





