/**
 * `SyncEngine`in durumunu (idle/pending/syncing/error/offline) UI'ye taşıyan
 * küçük bir yayıncı — `hooks.ts`'teki `setStore`/`useStore` ile aynı desende.
 * Oturum yokken hep `'offline'` (engine hiç başlamaz, App.tsx'te gösterge çıkmaz).
 */
import { useEffect, useState } from 'preact/hooks';
import type { SyncStatus } from '../sync/types';

let current: SyncStatus = 'offline';
const listeners = new Set<(s: SyncStatus) => void>();

export function setSyncStatus(s: SyncStatus): void {
  current = s;
  listeners.forEach((l) => l(s));
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState(current);
  useEffect(() => {
    const listener = (s: SyncStatus) => setStatus(s);
    listeners.add(listener);
    setStatus(current); // abone olurken en güncel değeri kaçırma
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return status;
}
