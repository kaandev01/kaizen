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

/** Bir seansın tek bir "çalışıyor" aralığı (duraklama/mola bu aralıkların dışındadır). */
export interface PomoSegment {
  start: number;
  end: number;
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
  /** Geçerli seansın ilk başladığı an (yalnızca bilgi amaçlı; runId ile birlikte sıfırlanır). */
  startedAt: number | null;
  /** status==='running' iken şu anki çalışma aralığının başladığı an. */
  runningSince: number | null;
  /** Geçerli seansta şimdiye kadar kapanmış çalışma aralıkları (duraklama/mola hariç). */
  segments: PomoSegment[];
  /** Arayüzde gösterilecek son tamamlanma olayı. */
  lastCompleted: PomoCompletion | null;
}

export type PomoSessionStatus = 'completed' | 'stopped';

/**
 * Kalıcı Pomodoro geçmişi kaydı — yalnızca odaklanma (focus) fazı için üretilir.
 * `activeMs`, duraklama ve mola sürelerini SAYMAZ; yalnızca gerçekten çalışan
 * aralıkların (segments) toplamıdır. `status==='stopped'` erken bitirilen ama
 * çalışılmış süresi kaydedilen seanstır; tamamlanan Pomodoro sayısına eklenmez.
 */
export interface PomoSession {
  id: string;
  plannedMs: number;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  segments: PomoSegment[];
  status: PomoSessionStatus;
}

export interface PomoResult {
  state: PomoState;
  /** Yeni üretilen kalıcı seans kaydı (varsa). */
  record: PomoSession | null;
}

export const phaseMs = (cfg: PomodoroConfig, phase: Phase): number =>
  (phase === 'focus' ? cfg.focusMin : phase === 'short' ? cfg.shortMin : cfg.longMin) * 60_000;

export const sumSegmentsMs = (segments: PomoSegment[]): number => segments.reduce((sum, s) => sum + (s.end - s.start), 0);

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
    startedAt: null,
    runningSince: null,
    segments: [],
    lastCompleted: null,
  };
}

export function remainingNow(s: PomoState, now: number): number {
  return s.status === 'running' && s.endsAt !== null ? Math.max(s.endsAt - now, 0) : s.remainingMs;
}

export function start(s: PomoState, now: number, newRunId: string): PomoState {
  if (s.status === 'running') return s;
  const isNew = s.status === 'idle';
  const runId = isNew ? newRunId : s.runId; // duraklatılmışsa aynı seans devam eder
  return {
    ...s,
    status: 'running',
    runId,
    endsAt: now + s.remainingMs,
    runningSince: now,
    segments: isNew ? [] : s.segments,
    startedAt: isNew ? now : s.startedAt,
    lastCompleted: null,
  };
}

export function pause(s: PomoState, now: number): PomoState {
  if (s.status !== 'running') return s;
  const segments = s.runningSince !== null ? [...s.segments, { start: s.runningSince, end: now }] : s.segments;
  return { ...s, status: 'paused', remainingMs: remainingNow(s, now), endsAt: null, runningSince: null, segments };
}

/** Şu anki (kapanmamışsa kapatılmış) çalışma aralıklarının tümü. */
function closeSegments(s: PomoState, now: number): PomoSegment[] {
  if (s.status === 'running' && s.runningSince !== null) return [...s.segments, { start: s.runningSince, end: now }];
  return s.segments;
}

/**
 * Odaklanma fazındaki bir seans bırakılıyorsa (sıfırlama/aşama değişimi) ve
 * üzerinde gerçekten çalışılmışsa, çalışılmış süreyi 'stopped' olarak kaydeder.
 * Mola fazları veya hiç başlamamış (runId='') seanslar için kayıt üretmez.
 */
function abandonFocus(s: PomoState, now: number): PomoSession | null {
  if (s.phase !== 'focus' || !s.runId) return null;
  const segments = closeSegments(s, now);
  const activeMs = sumSegmentsMs(segments);
  if (activeMs <= 0) return null;
  return {
    id: s.runId,
    plannedMs: s.durationMs,
    startedAt: s.startedAt ?? segments[0]?.start ?? now,
    endedAt: now,
    activeMs,
    segments,
    status: 'stopped',
  };
}

const freshPhase = (s: PomoState, phase: Phase, ms: number): PomoState => ({
  ...s,
  phase,
  status: 'idle',
  endsAt: null,
  remainingMs: ms,
  durationMs: ms,
  runId: '',
  startedAt: null,
  runningSince: null,
  segments: [],
  lastCompleted: null,
});

/**
 * Yarım kalan/sıfırlanan seans tamamlanmış sayılmaz (tamamlanan Pomodoro
 * sayısına eklenmez), ama odaklanma fazındaysa ve üzerinde çalışılmışsa bu
 * süre 'stopped' bir geçmiş kaydı olarak saklanır — hiçbir emek sessizce kaybolmaz.
 */
export function reset(s: PomoState, cfg: PomodoroConfig, now: number): PomoResult {
  const record = abandonFocus(s, now);
  const ms = phaseMs(cfg, s.phase);
  return { state: freshPhase(s, s.phase, ms), record };
}

/** Molayı atla: sayılmadan sıradaki odak aşamasına geç. Odaktaysa sıfırlamayla aynıdır. */
export function skipBreak(s: PomoState, cfg: PomodoroConfig, now: number): PomoResult {
  if (s.phase === 'focus') return reset(s, cfg, now);
  const ms = phaseMs(cfg, 'focus');
  const state = { ...freshPhase(s, 'focus', ms), cycleCount: s.phase === 'long' ? 0 : s.cycleCount };
  return { state, record: null };
}

/**
 * Aşamayı elle seç (Odaklanma / Kısa Mola / Uzun Mola). Çalışan veya duraklatılmış
 * odaklanma seansı varsa `reset` ile aynı şekilde bırakılır (çalışılmış süre saklanır,
 * tamamlanmış sayılmaz); seçilen aşama baştan, beklemede hazırlanır.
 */
export function selectPhase(s: PomoState, cfg: PomodoroConfig, phase: Phase, now: number): PomoResult {
  if (s.phase === phase && s.status === 'idle') return { state: s, record: null };
  const record = abandonFocus(s, now);
  const ms = phaseMs(cfg, phase);
  return { state: freshPhase(s, phase, ms), record };
}

/** Süre ayarı değişince yalnızca bekleyen (idle) aşama güncellenir. */
export function applyConfig(s: PomoState, cfg: PomodoroConfig): PomoState {
  if (s.status !== 'idle') return s;
  const ms = phaseMs(cfg, s.phase);
  return { ...s, remainingMs: ms, durationMs: ms };
}

/**
 * Süresi dolmuş çalışan aşamayı tamamlar ve sıradaki aşamayı BEKLEMEDE
 * (idle) hazırlar; otomatik başlatmaz. Uygulama geç açılsa bile tamamlanma
 * zamanı endsAt'tir (o anki gerçek zaman değil). İdempotent: durum
 * 'running' değilse hiçbir şey yapmaz.
 */
export function settle(s: PomoState, cfg: PomodoroConfig, now: number): PomoResult {
  if (s.status !== 'running' || s.endsAt === null || s.endsAt > now) return { state: s, record: null };

  // Çalışma aralığı tam olarak planlanan bitiş anında (now değil) kapanır.
  const segments = s.runningSince !== null ? [...s.segments, { start: s.runningSince, end: s.endsAt }] : s.segments;
  const completion: PomoCompletion = { runId: s.runId, phase: s.phase, at: s.endsAt };
  let record: PomoSession | null = null;
  let cycleCount = s.cycleCount;
  let next: Phase;

  if (s.phase === 'focus') {
    record = {
      id: s.runId,
      plannedMs: s.durationMs,
      startedAt: s.startedAt ?? segments[0]?.start ?? s.endsAt,
      endedAt: s.endsAt,
      activeMs: sumSegmentsMs(segments),
      segments,
      status: 'completed',
    };
    cycleCount += 1;
    next = cycleCount % cfg.longEvery === 0 ? 'long' : 'short';
  } else {
    if (s.phase === 'long') cycleCount = 0;
    next = 'focus';
  }
  const ms = phaseMs(cfg, next);
  return {
    state: { ...freshPhase(s, next, ms), cycleCount, lastCompleted: completion },
    record,
  };
}

export const dismissCompletion = (s: PomoState): PomoState => (s.lastCompleted ? { ...s, lastCompleted: null } : s);

/**
 * Şema v1'deki eski `pomoHistory` kayıtlarını (yalnızca id/at/ms) yeni
 * `PomoSession` biçimine çevirir. Hem canlı veritabanı göçünde (store.ts)
 * hem de eski bir yedek dosyası geri yüklenirken (backup.ts) kullanılır.
 */
export function migrateLegacyPomoHistory(raw: unknown): PomoSession[] {
  if (!Array.isArray(raw)) return [];
  const out: PomoSession[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const { id, at, ms } = r as { id?: unknown; at?: unknown; ms?: unknown };
    if (typeof id !== 'string' || typeof at !== 'number' || typeof ms !== 'number' || ms <= 0) continue;
    out.push({ id, plannedMs: ms, startedAt: at - ms, endedAt: at, activeMs: ms, segments: [{ start: at - ms, end: at }], status: 'completed' });
  }
  return out;
}
