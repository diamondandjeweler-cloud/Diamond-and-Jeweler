import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Service worker — cache-first for hashed JS/CSS/fonts/images so returning
    // users skip network entirely for static assets. Stale-while-revalidate for
    // index.html so deploys still reach users on the next navigation. Excludes
    // anything under /auth/ and /admin/ so we never serve a stale shell to
    // role-gated routes.
    VitePWA({
      // Don't auto-register; we'll register manually after first paint so the
      // SW install never competes with the critical render path.
      injectRegister: null,
      // Generate a manifest + sw.js with auto-update: when a new deploy ships,
      // the SW activates on next reload (skipWaiting + clientsClaim).
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      workbox: {
        // Precache all build outputs except sourcemaps + the legacy noscript
        // SEO HTML files (those are CDN-cached by Vercel; pre-caching them
        // would balloon the SW manifest unnecessarily).
        globPatterns: ['**/*.{js,css,woff2,svg,png,webp}'],
        globIgnores: ['**/*.map', '**/sw.js', '**/workbox-*.js'],
        navigateFallback: '/index.html',
        // SPA routes that should NOT fall back to index.html (let the network
        // / Vercel routing handle them).
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/auth\/callback/,
          /\.(?:xml|txt|json|map)$/,
        ],
        runtimeCaching: [
          // Google Fonts caching rules removed: fonts are now self-hosted via
          // @fontsource-variable (see src/index.css). They ship under
          // /assets/*.woff2 and are precached by globPatterns above.
          {
            // Supabase REST/RPC — NEVER cache. Authz decisions and RLS scope
            // must hit the network every time. NetworkOnly forces that.
            urlPattern: /^https:\/\/sfnrpbsdscikpmbhrzub\.supabase\.co\//,
            handler: 'NetworkOnly',
          },
          {
            // Same-origin images (og-image, favicon, etc.) — cache-first.
            urlPattern: ({ request, url }) => request.destination === 'image' && url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: { cacheName: 'images', expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            // SEO silo pages (/careers, /jobs/*, /jobs-in-*, /hire-*) and the
            // landing page — stale-while-revalidate so repeat visitors get
            // instant navigation while the SW silently updates in the background.
            // Only caches GET navigation requests; Supabase API calls are excluded
            // by the NetworkOnly rule above.
            urlPattern: /^\/(careers(?:\/[^/?]+)?|jobs\/[^/?]+|jobs-in-[^/?]+|hire-[^/?]+)\/?(?:\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'seo-pages',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        // Tell Workbox to skip the waiting phase and claim clients immediately
        // so a new deploy's SW takes over on the next page load instead of two
        // reloads from now. Pairs with the in-app update toast (not yet wired;
        // for now, deploys propagate silently within ~1 reload).
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,        // we already ship public/manifest.json
      includeAssets: [],      // public/ assets are picked up by globPatterns
    }),
  ],
  server: { port: 3000, host: true },
  build: {
    // Production source maps were publicly fetchable from /assets/*.js.map (HTTP
    // 200 to anyone who guesses the bundle hash from the script tag), exposing
    // unminified source to attackers/competitors. 'hidden' generates the maps
    // (so they're available locally for Sentry CLI upload) but strips the
    // //# sourceMappingURL= comment from the JS files so browsers/tools don't
    // auto-discover them.
    //
    // We additionally delete the .map files from dist/ before Vercel deploy via
    // a postbuild step (see package.json) so they never reach the public CDN.
    // Sentry source-map upload should run BEFORE that strip step if/when it's
    // wired into the build pipeline.
    sourcemap: 'hidden',
    outDir: 'dist',
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // normalise windows paths so /node_modules/<pkg>/ matchers work
          const norm = id.replace(/\\/g, '/')
          if (norm.includes('/@supabase/'))                                 return 'vendor-supabase'
          if (norm.includes('/react-router'))                               return 'vendor-router'
          if (norm.includes('/i18next') || norm.includes('/react-i18next')) return 'vendor-i18n'
          if (norm.includes('/zustand/'))                                   return 'vendor-state'
          // Keep react and ALL of its tightly-coupled internals in one chunk
          // (scheduler, use-sync-external-store, jsx-runtime, etc) so we
          // don't get circular vendor↔vendor-react references.
          if (
            norm.includes('/react/') ||
            norm.includes('/react-dom/') ||
            norm.includes('/scheduler/') ||
            norm.includes('/use-sync-external-store/') ||
            norm.includes('/swr/')
          ) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
