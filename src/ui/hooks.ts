import { useEffect, useReducer, useState } from 'preact/hooks';
import { createDayWatcher, systemClock, toDateKey, type DateKey } from '../core/dates';
import type { AppState, Store } from '../storage/store';

let current: Store | null = null;
export function setStore(s: Store) {
  current = s;
}
export function useStore(): Store {
  if (!current) throw new Error('Store hazır değil');
  return current;
}

/** Store durumuna abone olur; her değişimde yeniden çizer. */
export function useAppState(): AppState {
  const store = useStore();
  const [, force] = useReducer((n: number, _: undefined) => n + 1, 0);
  useEffect(() => store.subscribe(() => force(undefined)), [store]);
  return store.getState();
}

/** Yerel bugün; gece yarısında, uygulamaya dönüşte ve uyanınca güncellenir. */
export function useToday(): DateKey {
  const [today, setToday] = useState(() => toDateKey(new Date()));
  useEffect(() => {
    const w = createDayWatcher(systemClock, setToday);
    w.check();
    return () => w.stop();
  }, []);
  return today;
}

/** Her `ms` milisaniyede yeniden çizim tetikler; şu anın zaman damgasını döndürür. */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms, active]);
  return now;
}
