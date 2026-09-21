import { normalizeReminders } from './reminders';
import type { PomodoroConfig, Schedule } from './types';

export const MAX_TARGET = 100_000;
export const MAX_AMOUNT = 999_999;

export interface HabitInput {
  name: string;
  icon: string;
  color: string;
  target: number;
  unit: string;
  schedule: Schedule;
  reminders: string[];
}

/** Geçerliyse null, değilse Türkçe hata mesajı. */
export function validateHabitInput(i: HabitInput): string | null {
  if (!i.name.trim()) return 'Alışkanlığa bir isim ver.';
  if (i.name.trim().length > 40) return 'İsim en fazla 40 karakter olabilir.';
  if (!Number.isInteger(i.target) || i.target < 1) return 'Hedef 1 veya daha büyük bir tam sayı olmalı.';
  if (i.target > MAX_TARGET) return `Hedef en fazla ${MAX_TARGET} olabilir.`;
  if (!i.unit.trim()) return 'Bir birim seç veya yaz.';
  if (i.schedule.kind === 'weekdays' && i.schedule.days.length === 0) return 'En az bir gün seç.';
  return null;
}

export function normalizeHabitInput(i: HabitInput): HabitInput {
  return {
    ...i,
    name: i.name.trim(),
    unit: i.unit.trim(),
    schedule:
      i.schedule.kind === 'daily'
        ? i.schedule
        : { kind: 'weekdays', days: Array.from(new Set(i.schedule.days)).sort((a, b) => a - b) },
    reminders: normalizeReminders(i.reminders),
  };
}

export function clampAmount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), MAX_AMOUNT);
}

export function sanitizePomodoroConfig(c: PomodoroConfig): PomodoroConfig {
  const clamp = (n: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(n) ? Math.min(Math.max(Math.round(n), lo), hi) : fallback;
  return {
    focusMin: clamp(c.focusMin, 1, 180, 25),
    shortMin: clamp(c.shortMin, 1, 60, 5),
    longMin: clamp(c.longMin, 1, 120, 15),
    longEvery: clamp(c.longEvery, 2, 12, 4),
  };
}
