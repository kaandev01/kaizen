/**
 * Şu an oturum açmış kullanıcı — `hooks.ts`/`syncStatus.ts` ile aynı desende.
 * `Root.tsx` oturum durumu değişince günceller; SettingsScreen "Hesap" bölümü
 * için okur. Oturum yokken `null`.
 */
import { useEffect, useState } from 'preact/hooks';

export interface SessionUser {
  id: string;
  email: string | null;
}

let current: SessionUser | null = null;
const listeners = new Set<(u: SessionUser | null) => void>();

export function setSessionUser(u: SessionUser | null): void {
  current = u;
  listeners.forEach((l) => l(u));
}

export function useSessionUser(): SessionUser | null {
  const [user, setUser] = useState(current);
  useEffect(() => {
    const listener = (u: SessionUser | null) => setUser(u);
    listeners.add(listener);
    setUser(current);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return user;
}
