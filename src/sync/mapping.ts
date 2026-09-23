/**
 * Yerel (camelCase) tipler ↔ Supabase satırları (snake_case) dönüşümleri.
 * Bulut şemasının tek doğruluk kaynağı `supabase/migrations/0001_init.sql`'dir;
 * buradaki alan adları onunla birebir eşleşmelidir.
 */
import type { PomoSession } from '../core/pomodoro';
import type { AgendaItem, DayRating, Goal, Habit, JournalEntry, Settings } from '../core/types';

// ---- push: yerel tip -> Supabase satırı ----------------------------------

export function habitToRow(userId: string, h: Habit) {
  return {
    id: h.id,
    user_id: userId,
    name: h.name,
    icon: h.icon,
    color: h.color,
    reminders: h.reminders,
    revisions: h.revisions,
    created_at: h.createdAt,
    order: h.order,
    deleted_at: null,
  };
}

export function journalToRow(userId: string, e: JournalEntry) {
  return {
    id: e.id,
    user_id: userId,
    date: e.date,
    text: e.text,
    source: e.source,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: null,
  };
}

export function ratingToRow(userId: string, r: DayRating) {
  return { user_id: userId, date: r.date, score: r.score, updated_at: r.updatedAt, deleted_at: null };
}

export function agendaToRow(userId: string, a: AgendaItem) {
  return {
    id: a.id,
    user_id: userId,
    title: a.title,
    kind: a.kind,
    date: a.date,
    time: a.time,
    description: a.description,
    importance: a.importance,
    reminders: a.reminders,
    reminder_anchor_time: a.reminderAnchorTime,
    done: a.done,
    completed_at: a.completedAt,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    deleted_at: null,
  };
}

export function goalToRow(userId: string, g: Goal) {
  return {
    id: g.id,
    user_id: userId,
    title: g.title,
    description: g.description,
    period: g.period,
    status: g.status,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    deleted_at: null,
  };
}

export function settingsToRow(userId: string, s: Settings) {
  return {
    user_id: userId,
    theme: s.theme,
    haptics: s.haptics,
    notifications: s.notifications,
    silent: s.silent,
    keep_awake: s.keepAwake,
    pomodoro: s.pomodoro,
  };
}

export function pomoSessionToRow(userId: string, s: PomoSession) {
  return {
    id: s.id,
    user_id: userId,
    planned_ms: s.plannedMs,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    active_ms: s.activeMs,
    segments: s.segments,
    status: s.status,
  };
}

// ---- pull: Supabase satırı -> yerel tip -----------------------------------
// Sunucu tarafı şemayı biz kontrol ettiğimizden alanlar güvenle geri yazılır;
// yine de yerel tarafta beklenmeyen `null`/eksik alanlara karşı ucuz varsayılanlar var.

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  reminders: string[];
  revisions: Habit['revisions'];
  created_at: string;
  order: number;
  deleted_at: string | null;
  server_updated_at: string;
}
export const habitFromRow = (r: HabitRow): Habit => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  color: r.color,
  reminders: r.reminders ?? [],
  revisions: r.revisions,
  createdAt: r.created_at,
  order: r.order,
});

export interface DayLogRow {
  id: string;
  habit_id: string;
  date: string;
  amount: number;
  updated_at: number;
  server_updated_at: string;
}
export const dayLogFromRow = (r: DayLogRow) => ({ key: r.id, habitId: r.habit_id, date: r.date, amount: r.amount, updatedAt: r.updated_at });

export interface JournalRow {
  id: string;
  date: string;
  text: string;
  source: string;
  created_at: number;
  updated_at: number;
  deleted_at: string | null;
  server_updated_at: string;
}
export const journalFromRow = (r: JournalRow): JournalEntry => ({
  id: r.id,
  date: r.date,
  text: r.text,
  source: r.source === 'speech' ? 'speech' : 'typed',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface RatingRow {
  date: string;
  score: number;
  updated_at: number;
  deleted_at: string | null;
  server_updated_at: string;
}
export const ratingFromRow = (r: RatingRow): DayRating => ({ date: r.date, score: r.score, updatedAt: r.updated_at });

export interface AgendaRow {
  id: string;
  title: string;
  kind: string;
  date: string;
  time: string | null;
  description: string;
  importance: string;
  reminders: AgendaItem['reminders'];
  reminder_anchor_time: string | null;
  done: boolean;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: string | null;
  server_updated_at: string;
}
export const agendaFromRow = (r: AgendaRow): AgendaItem => ({
  id: r.id,
  title: r.title,
  kind: (['deadline', 'exam', 'todo', 'other'] as const).includes(r.kind as AgendaItem['kind']) ? (r.kind as AgendaItem['kind']) : 'other',
  date: r.date,
  time: r.time,
  description: r.description,
  importance: (['normal', 'important', 'critical'] as const).includes(r.importance as AgendaItem['importance']) ? (r.importance as AgendaItem['importance']) : 'normal',
  reminders: r.reminders ?? [],
  reminderAnchorTime: r.reminder_anchor_time,
  done: r.done,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface GoalRow {
  id: string;
  title: string;
  description: string;
  period: Goal['period'];
  status: string;
  created_at: number;
  updated_at: number;
  deleted_at: string | null;
  server_updated_at: string;
}
export const goalFromRow = (r: GoalRow): Goal => ({
  id: r.id,
  title: r.title,
  description: r.description,
  period: r.period,
  status: (['active', 'done', 'abandoned'] as const).includes(r.status as Goal['status']) ? (r.status as Goal['status']) : 'active',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface SettingsRow {
  theme: string;
  haptics: boolean;
  notifications: boolean;
  silent: boolean;
  keep_awake: boolean;
  pomodoro: Settings['pomodoro'];
  server_updated_at: string;
}
export const settingsFromRow = (r: SettingsRow): Partial<Settings> => ({
  theme: r.theme === 'light' || r.theme === 'dark' ? r.theme : 'system',
  haptics: r.haptics,
  notifications: r.notifications,
  silent: r.silent,
  keepAwake: r.keep_awake,
  pomodoro: r.pomodoro,
});

export interface PomoSessionRow {
  id: string;
  planned_ms: number;
  started_at: number;
  ended_at: number;
  active_ms: number;
  segments: PomoSession['segments'];
  status: string;
  server_updated_at: string;
}
export const pomoSessionFromRow = (r: PomoSessionRow): PomoSession => ({
  id: r.id,
  plannedMs: r.planned_ms,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  activeMs: r.active_ms,
  segments: r.segments,
  status: r.status === 'stopped' ? 'stopped' : 'completed',
});
