/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SITE_URL?: string
  VITE_SENTRY_DSN?: string
  VITE_ENABLE_RESTAURANT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
