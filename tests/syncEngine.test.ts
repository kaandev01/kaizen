import { describe, expect, it, vi } from 'vitest';

// `supabase` gerçek bir client değil — yalnızca `!supabase` denetimini geçecek kadar
// gerçek (truthy) olmalı. `drain()` boş bir kuyrukla hiçbir Supabase metodunu hiç
// ÇAĞIRMADAN 'idle' bildirmeli; `pullAll()` başarısız olsa bile (kendi try/catch'i var,
// durumu hiç etkilemez) test bundan etkilenmemeli.
vi.mock('../src/sync/supabaseClient', () => ({
  supabase: {
    from: () => {
      throw new Error('bu testte hiç çağrılmamalı — kuyruk boş');
    },
    rpc: () => Promise.reject(new Error('bu testte hiç çağrılmamalı')),
  },
}));

import { systemClock } from '../src/core/dates';
import { SyncEngine } from '../src/sync/engine';
import { MemoryStorage } from '../src/storage/storage';
import { Store } from '../src/storage/store';

// Test ortamı `node` (jsdom yok, bkz. vite.config.ts) — SyncEngine.start() tarayıcı
// olay dinleyicileri eklediği için minimal sahte global'ler gerekiyor.
const noop = () => {};
vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop });
vi.stubGlobal('document', { addEventListener: noop, removeEventListener: noop });

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SyncEngine — durum bildirimi', () => {
  it('boş kuyrukla başlayınca gerçekten "idle" bildirir (iç varsayılan durumla ilk gerçek durum aynı çıksa bile bildirim atlanmamalı)', async () => {
    const storage = new MemoryStorage();
    const store = new Store(storage, systemClock);
    await store.init();

    const statuses: string[] = [];
    const engine = new SyncEngine(storage, store, 'user-1', (s) => statuses.push(s));
    engine.start();

    // drain() mikro görev kuyruğunda ilerliyor — birkaç tick bekle.
    await tick();
    await tick();
    await tick();

    expect(statuses).toContain('idle');
    engine.stop();
  });
});
