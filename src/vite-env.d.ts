/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_STAGING_SUPABASE_URL?: string;
  readonly VITE_STAGING_SUPABASE_ANON_KEY?: string;
  readonly VITE_PRODUCTION_SUPABASE_URL?: string;
  readonly VITE_PRODUCTION_SUPABASE_ANON_KEY?: string;
  readonly VITE_PRODUCTION_PROJECT_REF?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __FOMO_KNOWN_PROD_REF__: string | undefined;
