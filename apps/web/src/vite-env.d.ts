/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
  VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
