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
    expect(r1.record).toEqual({ id: 'r1', at: T0 + 25 * MIN, ms: 25 * MIN });
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
    expect(r.record?.at).toBe(T0 + 25 * MIN);
    expect(r.state.status).toBe('idle');
    expect(r.state.phase).toBe('short');
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

  it('sıfırlanan seans tamamlanmış sayılmaz; yarım bırakma kayıt üretmez', () => {
    let s = p.start(p.initialPomo(cfg), T0, 'r1');
    s = p.pause(s, T0 + 20 * MIN);
    s = p.reset(s, cfg);
    expect(s).toMatchObject({ status: 'idle', phase: 'focus', cycleCount: 0, remainingMs: 25 * MIN, runId: '' });
    // Sıfırlanmış seansın eski bitiş zamanı geçse bile bir şey kaydedilmez.
    expect(p.settle(s, cfg, T0 + 99 * MIN).record).toBeNull();
    // Çalışırken sıfırla:
    let r = p.start(p.initialPomo(cfg), T0, 'r2');
    r = p.reset(r, cfg);
    expect(p.settle(r, cfg, T0 + 99 * MIN).record).toBeNull();
  });

  it('süre ayarı yalnızca bekleyen aşamayı etkiler; molayı atlama seans saymaz', () => {
    const running = p.start(p.initialPomo(cfg), T0, 'r1');
    const newCfg = { ...cfg, focusMin: 50 };
    expect(p.applyConfig(running, newCfg)).toBe(running);
    expect(p.applyConfig(p.initialPomo(cfg), newCfg).remainingMs).toBe(50 * MIN);

    let s = p.settle(p.start(p.initialPomo(cfg), T0, 'r1'), cfg, T0 + 25 * MIN).state; // kısa mola bekliyor
    s = p.skipBreak(s, cfg);
    expect(s).toMatchObject({ phase: 'focus', status: 'idle', cycleCount: 1 });
  });
});

describe('aşama seçimi (Odaklanma / Kısa Mola / Uzun Mola)', () => {
  it('seçilen aşama baştan, beklemede hazırlanır; yarım kalan seans sayılmaz', () => {
    let s = p.start(p.initialPomo(cfg), T0, 'r1');
    s = p.selectPhase(s, cfg, 'long');
    expect(s).toMatchObject({ phase: 'long', status: 'idle', remainingMs: 15 * MIN, runId: '', cycleCount: 0 });
    expect(p.settle(s, cfg, T0 + 99 * MIN).record).toBeNull();
    // Aynı aşama zaten beklemedeyse değişmez:
    expect(p.selectPhase(s, cfg, 'long')).toBe(s);
    // Duraklatılmış seans da bırakılır:
    let q = p.pause(p.start(p.initialPomo(cfg), T0, 'r2'), T0 + MIN);
    q = p.selectPhase(q, cfg, 'focus');
    expect(q).toMatchObject({ status: 'idle', remainingMs: 25 * MIN });
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
    expect(b.store.getState().pomoHistory).toHaveLength(1);
    expect(b.store.getState().pomodoro).toMatchObject({ phase: 'short', status: 'idle' });
    b.store.pomoSettle();
    b.store.pomoSettle();
    const c = await makeStore(clock, storage); // bir kez daha yeniden aç
    expect(c.store.getState().pomoHistory).toHaveLength(1);
  });

  it('kayıt yazıldı ama durum yazılamadan uygulama kapandıysa da çift sayılmaz', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const storage = new MemoryStorage();
    const a = await makeStore(clock, storage);
    a.store.pomoStart();
    await a.store.flush();
    const running = a.store.getState().pomodoro;
    // Simüle: geçmişe kayıt işlenmiş ama pomodoro durumu hâlâ 'running' kalmış.
    await storage.putMeta('pomoHistory', [{ id: running.runId, at: running.endsAt, ms: 25 * MIN }]);
    clock.advanceMs(30 * MIN);
    const b = await makeStore(clock, storage);
    expect(b.store.getState().pomoHistory).toHaveLength(1);
  });

  it('duraklatma ve sıfırlama sonrası da durum kalıcıdır', async () => {
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
    expect(b.store.getState().pomoHistory).toHaveLength(0);
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
