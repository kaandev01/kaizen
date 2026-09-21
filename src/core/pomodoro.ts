import type { PomodoroConfig } from './types';

/**
 * Saf Pomodoro durum makinesi. Kalan süre asla "her saniye 1 azalt" ile
 * tutulmaz: çalışırken aşama bitiş zamanı (endsAt) saklanır, duraklatınca
 * kalan süre saklanır. Böylece arka plan/kilit/yeniden açılış sonrası durum
 * yalnızca zaman damgasından doğru geri kurulur.
 */
export type Phase = 'focus' | 'short' | 'long';
export type PomoStatus = 'idle' | 'running' | 'paused';

export interface PomoCompletion {
  runId: string;
  phase: Phase;
  at: number;
}

export interface PomoState {
  phase: Phase;
  status: PomoStatus;
  /** running iken aşamanın bitiş zamanı (epoch ms). */
  endsAt: number | null;
  /** idle/paused iken kalan süre. */
  remainingMs: number;
  /** Bu aşamanın toplam süresi (halka oranı için). */
  durationMs: number;
  /** Son uzun moladan beri tamamlanan odak seansı sayısı. */
  cycleCount: number;
  /** Çalıştırılan aşama örneğinin kimliği (aynı seansı iki kez saymamak için). */
  runId: string;
  /** Arayüzde gösterilecek son tamamlanma olayı. */
  lastCompleted: PomoCompletion | null;
}

/** Tamamlanmış bir odak seansı. `id` benzersizdir; tekrar eklenmez. */
export interface PomoRecord {
  id: string;
  at: number;
  ms: number;
}

export const phaseMs = (cfg: PomodoroConfig, phase: Phase): number =>
  (phase === 'focus' ? cfg.focusMin : phase === 'short' ? cfg.shortMin : cfg.longMin) * 60_000;

export function initialPomo(cfg: PomodoroConfig): PomoState {
  const ms = phaseMs(cfg, 'focus');
  return {
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: ms,
    durationMs: ms,
    cycleCount: 0,
    runId: '',
    lastCompleted: null,
  };
}

export function remainingNow(s: PomoState, now: number): number {
  return s.status === 'running' && s.endsAt !== null ? Math.max(s.endsAt - now, 0) : s.remainingMs;
}

export function start(s: PomoState, now: number, newRunId: string): PomoState {
  if (s.status === 'running') return s;
  const runId = s.status === 'idle' ? newRunId : s.runId; // duraklatılmışsa aynı seans devam eder
  return { ...s, status: 'running', runId, endsAt: now + s.remainingMs, lastCompleted: null };
}

export function pause(s: PomoState, now: number): PomoState {
  if (s.status !== 'running') return s;
  return { ...s, status: 'paused', remainingMs: remainingNow(s, now), endsAt: null };
}

/** Yarım kalan/sıfırlanan seans sayılmaz; aynı aşama baştan hazırlanır. */
export function reset(s: PomoState, cfg: PomodoroConfig): PomoState {
  const ms = phaseMs(cfg, s.phase);
  return { ...s, status: 'idle', endsAt: null, remainingMs: ms, durationMs: ms, runId: '', lastCompleted: null };
}

/** Molayı atla: sayılmadan sıradaki odak aşamasına geç. Odakta = sıfırla. */
export function skipBreak(s: PomoState, cfg: PomodoroConfig): PomoState {
  if (s.phase === 'focus') return reset(s, cfg);
  const ms = phaseMs(cfg, 'focus');
  return {
    ...s,
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: ms,
    durationMs: ms,
    cycleCount: s.phase === 'long' ? 0 : s.cycleCount,
    runId: '',
    lastCompleted: null,
  };
}

/**
 * Aşamayı elle seç (Odaklanma / Kısa Mola / Uzun Mola). Çalışan veya duraklatılmış
 * seans bırakılmış olur ve SAYILMAZ; seçilen aşama baştan, beklemede hazırlanır.
 */
export function selectPhase(s: PomoState, cfg: PomodoroConfig, phase: Phase): PomoState {
  if (s.phase === phase && s.status === 'idle') return s;
  const ms = phaseMs(cfg, phase);
  return { ...s, phase, status: 'idle', endsAt: null, remainingMs: ms, durationMs: ms, runId: '', lastCompleted: null };
}

/** Süre ayarı değişince yalnızca bekleyen (idle) aşama güncellenir. */
export function applyConfig(s: PomoState, cfg: PomodoroConfig): PomoState {
  if (s.status !== 'idle') return s;
  const ms = phaseMs(cfg, s.phase);
  return { ...s, remainingMs: ms, durationMs: ms };
}

export interface SettleResult {
  state: PomoState;
  /** Yeni tamamlanan odak seansı (varsa). */
  record: PomoRecord | null;
}

/**
 * Süresi dolmuş çalışan aşamayı tamamlar ve sıradaki aşamayı BEKLEMEDE
 * (idle) hazırlar; otomatik başlatmaz. Uygulama geç açılsa bile tamamlanma
 * zamanı endsAt'tir. İdempotent: durum 'running' değilse hiçbir şey yapmaz.
 */
export function settle(s: PomoState, cfg: PomodoroConfig, now: number): SettleResult {
  if (s.status !== 'running' || s.endsAt === null || s.endsAt > now) return { state: s, record: null };

  const completion: PomoCompletion = { runId: s.runId, phase: s.phase, at: s.endsAt };
  let record: PomoRecord | null = null;
  let cycleCount = s.cycleCount;
  let next: Phase;

  if (s.phase === 'focus') {
    record = { id: s.runId, at: s.endsAt, ms: s.durationMs };
    cycleCount += 1;
    next = cycleCount % cfg.longEvery === 0 ? 'long' : 'short';
  } else {
    if (s.phase === 'long') cycleCount = 0;
    next = 'focus';
  }
  const ms = phaseMs(cfg, next);
  return {
    state: {
      phase: next,
      status: 'idle',
      endsAt: null,
      remainingMs: ms,
      durationMs: ms,
      cycleCount,
      runId: '',
      lastCompleted: completion,
    },
    record,
  };
}

export const dismissCompletion = (s: PomoState): PomoState => (s.lastCompleted ? { ...s, lastCompleted: null } : s);
