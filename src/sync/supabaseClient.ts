import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Ortam değişkenleri eksikse (ör. `.env.local` hiç oluşturulmamışsa — yerel
 * geliştirmede veya secrets tanımlanmamış bir CI çalışmasında) `null` döner.
 * Uygulama bu durumda da DERLENİR ve BOZULMAZ: main.tsx bunu görüp giriş
 * ekranında "bulut yapılandırması eksik" mesajı gösterir; asla sessizce çökmez.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const isSupabaseConfigured = supabase !== null;
