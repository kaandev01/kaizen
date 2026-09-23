/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Supabase proje URL'si. Boşsa uygulama bulutsuz (yalnızca yerel) çalışır. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase "anon public" anahtarı — istemciye gömülmesi güvenlidir (RLS gerçek sınırdır). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
