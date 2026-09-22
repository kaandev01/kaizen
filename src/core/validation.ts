import { normalizeReminders } from './reminders';
import type { AgendaImportance, AgendaKind, AgendaReminder, PomodoroConfig, Schedule } from './types';

export const MAX_TARGET = 100_000;
export const MAX_AMOUNT = 999_999;
export const MAX_JOURNAL_LEN = 4000;
export const MAX_TITLE_LEN = 80;
export const MAX_DESCRIPTION_LEN = 1000;

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

// ---- günlük -------------------------------------------------------------
/** Kaydetmeden önce: boş metin veya çok uzun metin reddedilir. */
export function validateJournalText(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Not boş olamaz.';
  if (t.length > MAX_JOURNAL_LEN) return `Not en fazla ${MAX_JOURNAL_LEN} karakter olabilir.`;
  return null;
}

// ---- gün puanı -------------------------------------------------------------
export const isValidRating = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 10;

// ---- ajanda (deadline / etkinlik) -------------------------------------------
export interface AgendaInput {
  title: string;
  kind: AgendaKind;
  date: string;
  time: string | null;
  description: string;
  importance: AgendaImportance;
  reminders: AgendaReminder[];
  reminderAnchorTime: string | null;
}

const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function validateAgendaInput(i: AgendaInput): string | null {
  if (!i.title.trim()) return 'Bir başlık gir.';
  if (i.title.trim().length > MAX_TITLE_LEN) return `Başlık en fazla ${MAX_TITLE_LEN} karakter olabilir.`;
  if (!i.date) return 'Bir tarih seç.';
  if (i.description.length > MAX_DESCRIPTION_LEN) return `Açıklama en fazla ${MAX_DESCRIPTION_LEN} karakter olabilir.`;
  // Tüm günlük bir kayıtta offset tabanlı (custom olmayan) hatırlatma varsa, kullanıcı
  // açıkça bir saat seçmiş olmalı — gizlice gece yarısı kabul edilmez.
  if (!i.time && !i.reminderAnchorTime && i.reminders.some((r) => r.kind !== 'custom')) {
    return 'Tüm günlük kayıtta hatırlatma için bir saat seç.';
  }
  for (const r of i.reminders) {
    if (r.kind === 'custom' && (!r.customDate || !r.customTime || !isValidTime(r.customTime))) {
      return 'Özel hatırlatma için tarih ve saat gir.';
    }
  }
  return null;
}

/** Aynı türde birden fazla hatırlatma eklenmesin (ör. iki kez "1 gün önce"); özel olanlar kendi tarih/saatine göre tekilleşir. */
export function normalizeAgendaReminders(reminders: AgendaReminder[]): AgendaReminder[] {
  const seen = new Set<string>();
  const out: AgendaReminder[] = [];
  for (const r of reminders) {
    const key = r.kind === 'custom' ? `custom:${r.customDate}:${r.customTime}` : r.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ---- hedefler (aylık/yıllık) -------------------------------------------------
export interface GoalInput {
  title: string;
  description: string;
}

export function validateGoalInput(i: GoalInput): string | null {
  if (!i.title.trim()) return 'Bir başlık gir.';
  if (i.title.trim().length > MAX_TITLE_LEN) return `Başlık en fazla ${MAX_TITLE_LEN} karakter olabilir.`;
  if (i.description.length > MAX_DESCRIPTION_LEN) return `Açıklama en fazla ${MAX_DESCRIPTION_LEN} karakter olabilir.`;
  return null;
}
