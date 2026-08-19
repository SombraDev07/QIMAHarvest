/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_VISION_PROVIDER?: string
  readonly VITE_VISION_API_KEY?: string
  readonly VITE_VISION_MODEL?: string
  readonly VITE_VISION_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
