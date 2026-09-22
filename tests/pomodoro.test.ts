import { describe, expect, it } from 'vitest';
import * as p from '../src/core/pomodoro';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { MemoryStorage } from '../src/storage/storage';
import { FakeClock, makeStore } from './helpers';

const cfg = DEFAULT_SETTINGS.pomodoro; // 25 / 5 / 15, her 4 odakta uzun mola
const MIN = 60_000;
const T0 = 1_000_000_000_000;

describe('Pomodoro durum makinesi', () => {
  it('duraklat/devam et: kalan süre saklanır, bitiş zamanı yeniden hesaplanır', () => {
    let s = p.start(p.initialPomo(cfg), T0, 'r1');
    expect(s.endsAt).toBe(T0 + 25 * MIN);
    s = p.pause(s, T0 + 10 * MIN);
    expect(s).toMatchObject({ status: 'paused', endsAt: null, remainingMs: 15 * MIN });
    // Uzun süre duraklatıldı; kalan süre değişmez.
    expect(p.remainingNow(s, T0 + 5 * 60 * MIN)).toBe(15 * MIN);
    const resumeAt = T0 + 60 * MIN;
    s = p.start(s, resumeAt, 'yeni-id-kullanilmamali');
    expect(s.runId).toBe('r1'); // aynı seans devam eder
    expect(s.endsAt).toBe(resumeAt + 15 * MIN);
  });

  it('kalan süre yalnızca zaman damgasından hesaplanır (arka plan/kilit sonrası)', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r1');
    // Ekran kilitliyken 7 dk geçti, hiç tick çalışmadı:
    expect(p.remainingNow(s, T0 + 7 * MIN)).toBe(18 * MIN);
  });

  it('süre dolunca odak seansı tam bir kez kaydedilir; sonraki aşama beklemede hazırlanır', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r1');
    const r1 = p.settle(s, cfg, T0 + 25 * MIN);
    expect(r1.record).toEqual({
      id: 'r1',
      plannedMs: 25 * MIN,
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      activeMs: 25 * MIN,
      segments: [{ start: T0, end: T0 + 25 * MIN }],
      status: 'completed',
    });
    expect(r1.state).toMatchObject({ phase: 'short', status: 'idle', cycleCount: 1, remainingMs: 5 * MIN });
    expect(r1.state.lastCompleted).toMatchObject({ phase: 'focus', runId: 'r1' });
    // İkinci kez settle: yeni kayıt yok, durum aynı.
    const r2 = p.settle(r1.state, cfg, T0 + 26 * MIN);
    expect(r2.record).toBeNull();
    expect(r2.state).toBe(r1.state);
  });

  it('bitişten uzun süre sonra açılınca tamamlanma zamanı endsAt olur, sıradaki aşama otomatik başlamaz', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r1');
    const r = p.settle(s, cfg, T0 + 10 * 60 * MIN);
    expect(r.record?.endedAt).toBe(T0 + 25 * MIN);
    expect(r.state.status).toBe('idle');
    expect(r.state.phase).toBe('short');
  });

  it('duraklama süresi odaklanma süresine eklenmez', () => {
    let s = p.start(p.initialPomo(cfg), T0, 'r1');
    s = p.pause(s, T0 + 10 * MIN); // 10 dk gerçekten çalıştı
    // 2 saat duraklatılmış kalsın — bu süre hiç sayılmamalı.
    s = p.start(s, T0 + 10 * MIN + 2 * 60 * MIN, 'kullanılmaz-aynı-seans-devam-eder');
    const r = p.settle(s, cfg, T0 + 10 * MIN + 2 * 60 * MIN + 15 * MIN); // kalan 15 dk daha çalışır
    expect(r.record?.activeMs).toBe(25 * MIN); // yalnızca 10+15; 2 saatlik duraklama dahil değil
    expect(r.record?.segments).toEqual([
      { start: T0, end: T0 + 10 * MIN },
      { start: T0 + 10 * MIN + 2 * 60 * MIN, end: T0 + 10 * MIN + 2 * 60 * MIN + 15 * MIN },
    ]);
    expect(r.record?.status).toBe('completed');
  });

  it('dört odak seansından sonra uzun mola; uzun mola sonrası döngü sıfırlanır', () => {
    let s = p.initialPomo(cfg);
    let t = T0;
    const phases: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = p.start(s, t, `f${i}`);
      t += 25 * MIN;
      s = p.settle(s, cfg, t).state;
      phases.push(s.phase);
      if (s.phase === 'short') {
        s = p.start(s, t, `b${i}`);
        t += 5 * MIN;
        s = p.settle(s, cfg, t).state;
      }
    }
    expect(phases).toEqual(['short', 'short', 'short', 'long']);
    expect(s.remainingMs).toBe(15 * MIN);
    s = p.start(s, t, 'lb');
    s = p.settle(s, cfg, t + 15 * MIN).state;
    expect(s).toMatchObject({ phase: 'focus', cycleCount: 0, status: 'idle' });
  });

  it('hiç çalışılmadan sıfırlama kayıt üretmez', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r2');
    const res = p.reset(s, cfg, T0); // hiç zaman geçmedi
    expect(res.record).toBeNull();
    expect(res.state).toMatchObject({ status: 'idle', phase: 'focus', cycleCount: 0, remainingMs: 25 * MIN, runId: '' });
    expect(p.settle(res.state, cfg, T0 + 99 * MIN).record).toBeNull();
  });

  it('erken bitirilen seansın çalışılmış süresi saklanır, tamamlanan Pomodoro sayısına eklenmez', () => {
    let s = p.start(p.initialPomo(cfg), T0, 'r1');
    s = p.pause(s, T0 + 12 * MIN);
    const { state, record } = p.reset(s, cfg, T0 + 30 * MIN); // duraklatılmışken sıfırlandı
    expect(record).toEqual({
      id: 'r1',
      plannedMs: 25 * MIN,
      startedAt: T0,
      endedAt: T0 + 30 * MIN,
      activeMs: 12 * MIN, // yalnızca gerçekten çalışılan süre
      segments: [{ start: T0, end: T0 + 12 * MIN }],
      status: 'stopped',
    });
    expect(state).toMatchObject({ status: 'idle', phase: 'focus', cycleCount: 0, remainingMs: 25 * MIN, runId: '' });
    // 'stopped' kayıt tamamlanan sayısına (cycleCount) hiçbir şekilde eklenmez.
  });

  it('çalışırken de sıfırlanabilir; o ana kadarki süre saklanır', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r1');
    const { record } = p.reset(s, cfg, T0 + 8 * MIN); // hâlâ 'running' iken sıfırlandı
    expect(record).toMatchObject({ status: 'stopped', activeMs: 8 * MIN, segments: [{ start: T0, end: T0 + 8 * MIN }] });
  });

  it('süre ayarı yalnızca bekleyen aşamayı etkiler; molayı atlama seans saymaz', () => {
    const running = p.start(p.initialPomo(cfg), T0, 'r1');
    const newCfg = { ...cfg, focusMin: 50 };
    expect(p.applyConfig(running, newCfg)).toBe(running);
    expect(p.applyConfig(p.initialPomo(cfg), newCfg).remainingMs).toBe(50 * MIN);

    const s = p.settle(p.start(p.initialPomo(cfg), T0, 'r1'), cfg, T0 + 25 * MIN).state; // kısa mola bekliyor
    const skip = p.skipBreak(s, cfg, T0 + 25 * MIN);
    expect(skip.state).toMatchObject({ phase: 'focus', status: 'idle', cycleCount: 1 });
    expect(skip.record).toBeNull(); // molalar hiçbir zaman Pomodoro geçmişine kaydedilmez
  });
});

describe('aşama seçimi (Odaklanma / Kısa Mola / Uzun Mola)', () => {
  it('seçilen aşama baştan, beklemede hazırlanır; yarım kalan odaklanma çalışması saklanır ama tamamlanmış sayılmaz', () => {
    const s = p.start(p.initialPomo(cfg), T0, 'r1');
    const sel = p.selectPhase(s, cfg, 'long', T0 + 6 * MIN);
    expect(sel.state).toMatchObject({ phase: 'long', status: 'idle', remainingMs: 15 * MIN, runId: '', cycleCount: 0 });
    expect(sel.record).toMatchObject({ status: 'stopped', activeMs: 6 * MIN });
    expect(p.settle(sel.state, cfg, T0 + 99 * MIN).record).toBeNull();
    // Aynı aşama zaten beklemedeyse hiçbir şey değişmez:
    expect(p.selectPhase(sel.state, cfg, 'long', T0 + 100 * MIN)).toEqual({ state: sel.state, record: null });
  });
  it('duraklatılmış bir odaklanma seansından aşama değiştirilirse de çalışılmış süre saklanır', () => {
    const q = p.pause(p.start(p.initialPomo(cfg), T0, 'r2'), T0 + MIN);
    const sel = p.selectPhase(q, cfg, 'focus', T0 + 5 * MIN); // aynı faz yeniden seçilse de mevcut seans bırakılır
    expect(sel.state).toMatchObject({ status: 'idle', remainingMs: 25 * MIN });
    expect(sel.record).toMatchObject({ status: 'stopped', activeMs: MIN });
  });
  it('mola fazından aşama değişiminde hiçbir kayıt üretilmez', () => {
    const s = p.settle(p.start(p.initialPomo(cfg), T0, 'r1'), cfg, T0 + 25 * MIN).state; // kısa mola bekliyor
    const running = p.start(s, T0 + 25 * MIN, 'b1');
    const sel = p.selectPhase(running, cfg, 'focus', T0 + 27 * MIN); // moladan 2 dk sonra vazgeçildi
    expect(sel.record).toBeNull();
  });
  it('Sessiz Mod ve Bildirimler ayarları varsayılan ve kalıcıdır', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    expect(a.store.getState().settings).toMatchObject({ notifications: true, silent: false });
    a.store.updateSettings({ silent: true, notifications: false });
    await a.store.flush();
    const b = await makeStore(clock, storage);
    expect(b.store.getState().settings).toMatchObject({ notifications: false, silent: true });
  });
});

describe('Pomodoro kalıcılık ve yeniden açılış (Store)', () => {
  it('çalışan seans uygulama yeniden açılınca kalan süreyle geri yüklenir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.pomoStart();
    await a.store.flush();
    clock.advanceMs(10 * MIN); // uygulama kapalı/arka planda
    const b = await makeStore(clock, storage); // yeniden açılış
    const s = b.store.getState().pomodoro;
    expect(s.status).toBe('running');
    expect(p.remainingNow(s, clock.now().getTime())).toBe(15 * MIN);
  });

  it('kapalıyken biten seans yeniden açılışta tam bir kez sayılır', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.pomoStart();
    await a.store.flush();
    clock.advanceMs(40 * MIN);
    const b = await makeStore(clock, storage);
    await b.store.flush();
    expect(b.store.getState().pomoSessions).toHaveLength(1);
    expect(b.store.getState().pomoSessions[0]).toMatchObject({ status: 'completed', activeMs: 25 * MIN });
    expect(b.store.getState().pomodoro).toMatchObject({ phase: 'short', status: 'idle' });
    b.store.pomoSettle();
    b.store.pomoSettle();
    const c = await makeStore(clock, storage); // bir kez daha yeniden aç
    expect(c.store.getState().pomoSessions).toHaveLength(1);
  });

  it('kayıt yazıldı ama durum yazılamadan uygulama kapandıysa da çift sayılmaz', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.pomoStart();
    await a.store.flush();
    const running = a.store.getState().pomodoro;
    // Simüle: geçmişe kayıt işlenmiş ama pomodoro durumu hâlâ 'running' kalmış.
    await storage.putPomoSession({
      id: running.runId,
      plannedMs: 25 * MIN,
      startedAt: running.startedAt!,
      endedAt: running.endsAt!,
      activeMs: 25 * MIN,
      segments: [{ start: running.startedAt!, end: running.endsAt! }],
      status: 'completed',
    });
    clock.advanceMs(30 * MIN);
    const b = await makeStore(clock, storage);
    expect(b.store.getState().pomoSessions).toHaveLength(1);
  });

  it('erken bitirilen seans yeniden açılışta da kalıcıdır; tekrar eklenmez', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.pomoStart();
    clock.advanceMs(5 * MIN);
    a.store.pomoPause();
    await a.store.flush();
    const b = await makeStore(new FakeClock(2026, 9, 22, 9, 0), storage); // ertesi gün açıldı
    expect(b.store.getState().pomodoro).toMatchObject({ status: 'paused', remainingMs: 20 * MIN });
    b.store.pomoReset();
    expect(b.store.getState().pomodoro).toMatchObject({ status: 'idle', remainingMs: 25 * MIN });
    expect(b.store.getState().pomoSessions).toHaveLength(1);
    expect(b.store.getState().pomoSessions[0]).toMatchObject({ status: 'stopped', activeMs: 5 * MIN });
    await b.store.flush();
    const c = await makeStore(new FakeClock(2026, 9, 23, 9, 0), storage);
    expect(c.store.getState().pomoSessions).toHaveLength(1); // yeniden açılışta tekrar eklenmez
  });

  it('süreleri değiştirmek kalıcıdır ve bekleyen aşamaya uygulanır', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.updateSettings({ pomodoro: { focusMin: 40, shortMin: 10, longMin: 20, longEvery: 3 } });
    await a.store.flush();
    const b = await makeStore(clock, storage);
    expect(b.store.getState().settings.pomodoro).toEqual({ focusMin: 40, shortMin: 10, longMin: 20, longEvery: 3 });
    expect(b.store.getState().pomodoro.remainingMs).toBe(40 * MIN);
  });
});

describe('şema göçü: v1 pomoHistory → v2 pomoSessions', () => {
  it('eski meta.pomoHistory kayıtları yeni pomoSessions deposuna taşınır, veri kaybolmaz', async () => {
    const storage = new MemoryStorage();
    // v1 şemasını simüle et: schemaVersion yok, kayıtlar meta.pomoHistory'de.
    await storage.putMeta('pomoHistory', [{ id: 'eski-1', at: T0 + 25 * MIN, ms: 25 * MIN }]);
    const { store } = await makeStore(new FakeClock(2026, 9, 21), storage);
    expect(store.getState().pomoSessions).toEqual([
      { id: 'eski-1', plannedMs: 25 * MIN, startedAt: T0, endedAt: T0 + 25 * MIN, activeMs: 25 * MIN, segments: [{ start: T0, end: T0 + 25 * MIN }], status: 'completed' },
    ]);
    await store.flush();
    const snap = await storage.load();
    expect(snap.meta.schemaVersion).toBe(2);
    expect(snap.pomoSessions).toHaveLength(1);
  });

  it('göç sonrası uygulama tekrar açılınca kayıt ikinci kez eklenmez', async () => {
    const storage = new MemoryStorage();
    await storage.putMeta('pomoHistory', [{ id: 'eski-1', at: T0 + 25 * MIN, ms: 25 * MIN }]);
    const clock = new FakeClock(2026, 9, 21);
    const a = await makeStore(clock, storage);
    await a.store.flush();
    const b = await makeStore(clock, storage);
    expect(b.store.getState().pomoSessions).toHaveLength(1);
  });

  it('göç sırasında sürmekte olan bir sayaç, kalıcı geçmiş korunarak sıfırlanır', async () => {
    const storage = new MemoryStorage();
    await storage.putMeta('pomoHistory', [{ id: 'eski-1', at: T0, ms: 25 * MIN }]);
    await storage.putMeta('pomodoro', {
      phase: 'focus',
      status: 'running',
      endsAt: T0 + 999 * MIN,
      remainingMs: 25 * MIN,
      durationMs: 25 * MIN,
      cycleCount: 0,
      runId: 'devam-eden',
      lastCompleted: null,
    });
    const { store } = await makeStore(new FakeClock(2026, 9, 21), storage);
    expect(store.getState().pomodoro.status).toBe('idle'); // yarım kalan canlı seans bırakıldı
    expect(store.getState().pomoSessions).toHaveLength(1); // ama geçmiş kaybolmadı
  });
});
