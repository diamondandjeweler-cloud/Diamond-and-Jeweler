import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
