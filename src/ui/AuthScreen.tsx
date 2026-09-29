import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { supabase } from '../sync/supabaseClient';
import { Segmented } from './components';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

/** Supabase'in İngilizce hata mesajlarını kısa, Türkçe ve dürüst bir karşılığa çevirir. */
function friendlyAuthError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-posta veya şifre yanlış.';
  if (m.includes('email not confirmed')) return 'E-postanı henüz doğrulamadın. Gelen kutunu kontrol et.';
  if (m.includes('already registered')) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (m.includes('password should be at least') || m.includes('password is too short')) return 'Şifre en az 6 karakter olmalı.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Bağlantı hatası. İnternetini kontrol edip tekrar dene.';
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.';
  if (m.includes('invalid email')) return 'Geçerli bir e-posta adresi gir.';
  return msg || 'Bir şeyler ters gitti. Tekrar dene.';
}

/** E-posta doğrulama/şifre sıfırlama bağlantıları bu sayfaya geri döner. */
const redirectUrl = () => `${window.location.origin}${window.location.pathname}`;

/**
 * Oturum yokken (veya `mode="reset"` ile şifre sıfırlama bağlantısından
 * gelindiğinde) `Root.tsx`'in render ettiği tam ekran giriş/kayıt ekranı.
 * Başarılı giriş/kayıt sonrası burada hiçbir şey yapılmaz — `Root.tsx`
 * `supabase.auth.onAuthStateChange`'i dinleyip App'e geçişi kendisi yönetir.
 */
export function AuthScreen({ initialMode = 'signin' }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Modül düzeyindeki `supabase` narrowing'i iç içe fonksiyonlara (submit) taşınmadığından
  // (farklı modülden gelen bir bağlayıcı olduğu için) yerel bir sabite alınır.
  const client = supabase;
  if (!client) {
    return (
      <section class="auth-screen">
        <div class="auth-card">
          <h1>Kaizen</h1>
          <p class="hint warn">
            Bulut yapılandırması eksik (<code>VITE_SUPABASE_URL</code>/<code>VITE_SUPABASE_ANON_KEY</code> ayarlanmamış). Uygulamayı derleyen kişi{' '}
            <code>.env.local</code> dosyasını oluşturmalı — bkz. <code>.env.example</code>.
          </p>
        </div>
      </section>
    );
  }

  const submit = async (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        // Başarılıysa Root.tsx onAuthStateChange ile devralır; burada ek bir şey yapılmaz.
      } else if (mode === 'signup') {
        const { data, error: err } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirectUrl() },
        });
        if (err) throw err;
        if (!data.session) {
          setInfo('Doğrulama e-postası gönderildi. Gelen kutunu kontrol edip bağlantıya dokun, sonra buraya dönüp giriş yap.');
        }
      } else if (mode === 'forgot') {
        const { error: err } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
        if (err) throw err;
        setInfo('Şifre sıfırlama bağlantısı e-postana gönderildi.');
      } else if (mode === 'reset') {
        if (newPassword.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
        const { error: err } = await client.auth.updateUser({ password: newPassword });
        if (err) throw err;
        setInfo('Şifren güncellendi. Giriş yapılıyor…');
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'reset' ? 'Yeni şifre belirle' : mode === 'forgot' ? 'Şifremi unuttum' : 'Kaizen';
  const submitLabel = { signin: 'Giriş yap', signup: 'Kayıt ol', forgot: 'Sıfırlama bağlantısı gönder', reset: 'Şifreyi güncelle' }[mode];
  const loadingLabel = { signin: 'Giriş yapılıyor…', signup: 'Kaydediliyor…', forgot: 'Gönderiliyor…', reset: 'Güncelleniyor…' }[mode];

  return (
    <section class="auth-screen">
      <div class="auth-card">
        <h1>{title}</h1>
        {mode !== 'reset' && mode !== 'forgot' && (
          <Segmented<'signin' | 'signup'>
            class="wide"
            label="Giriş / Kayıt"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setError(null);
              setInfo(null);
            }}
            options={[
              { value: 'signin', label: 'Giriş' },
              { value: 'signup', label: 'Kayıt ol' },
            ]}
          />
        )}

        <form class="form" onSubmit={submit}>
          {mode !== 'reset' && (
            <label class="field">
              <span class="label">E-posta</span>
              <input class="input" type="email" autocomplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
            </label>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <label class="field">
              <span class="label">Şifre</span>
              <input
                class="input"
                type="password"
                autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
            </label>
          )}

          {mode === 'reset' && (
            <label class="field">
              <span class="label">Yeni şifre</span>
              <input class="input" type="password" autocomplete="new-password" required minLength={6} value={newPassword} onInput={(e) => setNewPassword(e.currentTarget.value)} />
            </label>
          )}

          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p class="hint" role="status">
              {info}
            </p>
          )}

          <button class="btn primary" type="submit" disabled={loading}>
            {loading ? loadingLabel : submitLabel}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              class="text-btn"
              onClick={() => {
                setMode('forgot');
                setError(null);
                setInfo(null);
              }}
            >
              Şifremi unuttum
            </button>
          )}
          {mode === 'forgot' && (
            <button
              type="button"
              class="text-btn"
              onClick={() => {
                setMode('signin');
                setError(null);
                setInfo(null);
              }}
            >
              Girişe dön
            </button>
          )}
        </form>

        <p class="hint">Verilerin bu hesaba bağlı olarak buluta yedeklenir ve cihazların arasında eşitlenir. Şifreni biz saklamayız — Supabase'in kendi kimlik doğrulama sistemi kullanılır.</p>
      </div>
    </section>
  );
}
