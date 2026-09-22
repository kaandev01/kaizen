import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/core/backup';
import { SCHEMA_VERSION } from '../src/storage/store';
import { FakeClock, habitInput, makeStore } from './helpers';

describe('parseBackup: doğrulama', () => {
  it('geçerli bir mevcut-sürüm yedeği kabul edilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    store.addHabit(habitInput());
    const backup = store.exportData();
    const result = parseBackup(JSON.parse(JSON.stringify(backup)), SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary.habits).toBe(1);
  });

  it('geçersiz JSON / eksik alan / yanlış uygulama kimliği reddedilir; hiçbir şeyi değiştirmez', () => {
    expect(parseBackup(null, SCHEMA_VERSION)).toEqual({ ok: false, error: expect.any(String) });
    expect(parseBackup({ app: 'baska-uygulama' }, SCHEMA_VERSION)).toMatchObject({ ok: false });
    expect(parseBackup({ app: 'kaizen', schemaVersion: 'yanlis' }, SCHEMA_VERSION)).toMatchObject({ ok: false });
    expect(parseBackup({ app: 'kaizen', schemaVersion: SCHEMA_VERSION + 5 }, SCHEMA_VERSION)).toMatchObject({ ok: false }); // gelecekten yedek
    expect(parseBackup({ app: 'kaizen', schemaVersion: 1, exportedAt: 'x', habits: 'bozuk' }, SCHEMA_VERSION)).toMatchObject({ ok: false });
  });

  it('eski (v1) şemadaki bir yedek, yeni koleksiyonlar boş/göçürülmüş olarak kabul edilir', () => {
    const v1 = {
      app: 'kaizen',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      habits: [],
      logs: [],
      settings: { theme: 'system', haptics: true, notifications: true, silent: false, keepAwake: true, pomodoro: { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 } },
      pomodoro: { phase: 'focus', status: 'idle', endsAt: null, remainingMs: 1_500_000, durationMs: 1_500_000, cycleCount: 0, runId: '', lastCompleted: null },
      pomoHistory: [{ id: 'eski-1', at: 1_000_025 * 60_000, ms: 25 * 60_000 }],
    };
    const result = parseBackup(v1, SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.data.pomoSessions).toHaveLength(1);
    expect(result.data.pomoSessions[0]).toMatchObject({ id: 'eski-1', status: 'completed' });
    expect(result.data.journal).toEqual([]);
    expect(result.data.goals).toEqual([]);
  });
});

describe('Store.restoreBackup', () => {
  it('mevcut TÜM veriyi yedektekiyle değiştirir; canlı Pomodoro sayacı idle olarak başlar', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const a = await makeStore(clock);
    a.store.addHabit(habitInput({ name: 'Eski alışkanlık' }));
    a.store.addJournalEntry('2026-09-21', 'eski not', 'typed');
    a.store.pomoStart(); // canlı sayaç çalışıyor olsun
    await a.store.flush();

    // Ayrı bir "cihazdan" alınmış yedek: farklı alışkanlık, farklı not.
    const b = await makeStore(new FakeClock(2026, 9, 10));
    b.store.addHabit(habitInput({ name: 'Yedekteki alışkanlık' }));
    b.store.addJournalEntry('2026-09-10', 'yedekteki not', 'typed');
    b.store.setRating('2026-09-10', 6);
    const backup = b.store.exportData();

    await a.store.restoreBackup(JSON.parse(JSON.stringify(backup)));
    const state = a.store.getState();
    expect(state.habits.map((h) => h.name)).toEqual(['Yedekteki alışkanlık']);
    expect(state.journal.map((e) => e.text)).toEqual(['yedekteki not']);
    expect(state.ratings['2026-09-10']?.score).toBe(6);
    expect(state.pomodoro.status).toBe('idle'); // eski cihazın çalışan sayacı geri yüklenmez

    await a.store.flush();
    const snap = await (a.storage as import('../src/storage/storage').Storage).load();
    expect(snap.habits.map((h) => h.name)).toEqual(['Yedekteki alışkanlık']);
    expect(snap.journal).toHaveLength(1);
  });

  it('geri yükleme sonrası yeniden açılışta veri korunur', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const storage = (await makeStore(clock)).storage;
    const a = await makeStore(clock, storage);
    const backupSource = await makeStore(new FakeClock(2026, 9, 1));
    backupSource.store.addHabit(habitInput({ name: 'Kalıcı olmalı' }));
    await a.store.restoreBackup(backupSource.store.exportData());
    await a.store.flush();

    const b = await makeStore(clock, storage);
    expect(b.store.getState().habits.map((h) => h.name)).toEqual(['Kalıcı olmalı']);
  });
});
