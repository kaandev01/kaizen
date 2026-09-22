import type { DateKey } from './dates';

export type Schedule =
  | { kind: 'daily' }
  /** days: ISO gün numaraları (Pzt=1 … Paz=7), sıralı ve tekil. */
  | { kind: 'weekdays'; days: number[] };

/**
 * Geçmişi yeniden yorumlamamak için hedef/birim/tekrar düzeni sürümlenir:
 * bir gün için geçerli plan, `from <= gün` olan son sürümdür.
 */
export interface HabitRevision {
  from: DateKey;
  target: number;
  unit: string;
  schedule: Schedule;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** "HH:mm", sıralı ve tekil. */
  reminders: string[];
  /** from'a göre artan sıralı, en az bir öğe. */
  revisions: HabitRevision[];
  createdAt: DateKey;
  order: number;
}

/** Bir alışkanlığın tek bir gündeki miktarı. */
export interface DayLog {
  key: string; // `${habitId}|${date}`
  habitId: string;
  date: DateKey;
  amount: number;
  updatedAt: number;
}

// ---- Günlük (metin notu) ----------------------------------------------------
/** Bir günün notlarından biri. Bir günde birden fazla not olabilir. */
export interface JournalEntry {
  id: string;
  date: DateKey;
  text: string;
  /** Yalnızca bilgi amaçlı (sesle mi yazıldı). Ham ses hiçbir zaman saklanmaz. */
  source: 'typed' | 'speech';
  createdAt: number;
  updatedAt: number;
}

// ---- Gün puanı ---------------------------------------------------------------
/** Bir günün 1-10 arası puanı. Girilmemiş gün için kayıt hiç oluşturulmaz. */
export interface DayRating {
  date: DateKey;
  score: number; // 1..10
  updatedAt: number;
}

// ---- Takvim: deadline / etkinlik --------------------------------------------
export type AgendaKind = 'deadline' | 'exam' | 'todo' | 'other';

export interface AgendaItem {
  id: string;
  title: string;
  kind: AgendaKind;
  date: DateKey;
  /** "HH:mm" ya da null (tüm gün). */
  time: string | null;
  description: string;
  /** "HH:mm" ya da null; girilen tarihte bu saatte hatırlatma dener. */
  reminder: string | null;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---- Aylık / yıllık hedefler --------------------------------------------------
export type GoalPeriodKind = 'month' | 'year';
/** month yalnızca kind==='month' iken kullanılır (1-12). */
export interface GoalPeriod {
  kind: GoalPeriodKind;
  year: number;
  month?: number;
}
export type GoalStatus = 'active' | 'done' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  description: string;
  period: GoalPeriod;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

export interface PomodoroConfig {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Kaç odak seansında bir uzun mola. */
  longEvery: number;
}

export interface Settings {
  theme: ThemeSetting;
  haptics: boolean;
  /** Hatırlatmalar için ana anahtar. */
  notifications: boolean;
  /** Sessiz mod: Pomodoro bitiş sesi çalmaz. */
  silent: boolean;
  keepAwake: boolean;
  pomodoro: PomodoroConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  haptics: true,
  notifications: true,
  silent: false,
  keepAwake: true,
  pomodoro: { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 },
};

export const logKey = (habitId: string, date: DateKey) => `${habitId}|${date}`;
