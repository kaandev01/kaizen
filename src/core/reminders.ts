import { addDays, atLocalTime, toDateKey, type DateKey } from './dates';
import { planFor } from './plan';
import { amountOf, type LogMap } from './progress';
import type { Habit } from './types';

/**
 * Yerel bildirim sağlayan platformların bekleyen bildirim sınırı.
 * iOS yerel bildirimlerinde uygulama başına en fazla 64 bekleyen bildirim
 * tutulur; native (Capacitor) sürüme geçilirse zamanlayıcı bu sınırı
 * kullanır. PWA'da iOS zamanlanmış yerel bildirim sunmaz (README'ye bakın).
 */
export const PENDING_NOTIFICATION_LIMIT = 64;

export interface ReminderOccurrence {
  id: string; // `${habitId}|${date}|${HH:mm}`
  habitId: string;
  name: string;
  icon: string;
  date: DateKey;
  time: string;
  at: number;
}

/**
 * (fromMs, toMs] aralığındaki hatırlatmalar:
 *  - yalnızca alışkanlığın planlı olduğu günler,
 *  - bugün hedefi tamamlanmış alışkanlığın kalan hatırlatmaları atlanır,
 *    sonraki günlerin hatırlatmaları korunur.
 * `now` bugünün hangi gün olduğunu belirler.
 */
export function remindersBetween(
  habits: Habit[],
  logs: LogMap,
  now: Date,
  fromMs: number,
  toMs: number,
): ReminderOccurrence[] {
  const today = toDateKey(now);
  const startDay = toDateKey(new Date(fromMs));
  const out: ReminderOccurrence[] = [];
  for (let date = startDay; date <= toDateKey(new Date(toMs)); date = addDays(date, 1)) {
    for (const habit of habits) {
      if (habit.reminders.length === 0) continue;
      const plan = planFor(habit, date);
      if (!plan) continue;
      if (date === today && amountOf(logs, habit.id, date) >= plan.target) continue;
      for (const time of habit.reminders) {
        const at = atLocalTime(date, time);
        if (at > fromMs && at <= toMs) {
          out.push({ id: `${habit.id}|${date}|${time}`, habitId: habit.id, name: habit.name, icon: habit.icon, date, time, at });
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Bundan sonraki hatırlatmalar; platform sınırına göre en yakınlar tutulur. */
export function upcomingReminders(
  habits: Habit[],
  logs: LogMap,
  now: Date,
  opts: { horizonDays?: number; limit?: number } = {},
): ReminderOccurrence[] {
  const { horizonDays = 14, limit = PENDING_NOTIFICATION_LIMIT } = opts;
  const end = atLocalTime(addDays(toDateKey(now), horizonDays), '23:59');
  return remindersBetween(habits, logs, now, now.getTime(), end).slice(0, limit);
}

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function normalizeReminders(times: string[]): string[] {
  return Array.from(new Set(times.filter(isValidTime))).sort();
}
