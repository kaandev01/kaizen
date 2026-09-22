import { atLocalTime, toDateKey, type DateKey } from './dates';
import type { AgendaItem } from './types';

/**
 * Gecikmiş mi: saatli kayıtlar saatleri geçince, tüm günlük kayıtlar ise
 * yalnızca KENDİ GÜNÜ bitince (ertesi güne geçilince) gecikmiş sayılır.
 * Tamamlanan kayıtlar hiçbir zaman gecikmiş sayılmaz.
 */
export function isOverdue(item: AgendaItem, now: Date): boolean {
  if (item.done) return false;
  if (item.time) return atLocalTime(item.date, item.time) < now.getTime();
  return item.date < toDateKey(now);
}

/** Sıralama anahtarı: tarih, sonra saat (saat yoksa günün başı — tüm günlükler önce gelir). */
const sortKey = (item: AgendaItem): number => atLocalTime(item.date, item.time ?? '00:00');

export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => sortKey(a) - sortKey(b));
}

/** Bir güne ait kayıtlar (tarih sırasıyla). */
export function agendaForDay(items: AgendaItem[], date: DateKey): AgendaItem[] {
  return sortAgenda(items.filter((i) => i.date === date));
}

/** Yaklaşan (tamamlanmamış, bugünden itibaren) kayıtlar; gecikmişler de dahildir. */
export function upcomingAgenda(items: AgendaItem[], now: Date, opts: { horizonDays?: number } = {}): AgendaItem[] {
  const today = toDateKey(now);
  const { horizonDays } = opts;
  const cutoff = horizonDays !== undefined ? atLocalTime(today, '00:00') + horizonDays * 86_400_000 : Infinity;
  return sortAgenda(items.filter((i) => !i.done && (i.date >= today || isOverdue(i, now)) && sortKey(i) <= cutoff));
}

/** Hatırlatma yerel zaman damgası; hatırlatma yoksa null. */
export function agendaReminderAt(item: AgendaItem): number | null {
  return item.reminder ? atLocalTime(item.date, item.reminder) : null;
}

export interface AgendaReminderOccurrence {
  id: string; // `${itemId}|${date}|${HH:mm}` — düzenleme/silme sonrası doğal olarak değişir
  itemId: string;
  title: string;
  at: number;
}

/** (fromMs, toMs] aralığında, henüz tamamlanmamış kayıtların hatırlatmaları. */
export function agendaRemindersBetween(items: AgendaItem[], fromMs: number, toMs: number): AgendaReminderOccurrence[] {
  const out: AgendaReminderOccurrence[] = [];
  for (const item of items) {
    if (item.done) continue;
    const at = agendaReminderAt(item);
    if (at !== null && at > fromMs && at <= toMs) {
      out.push({ id: `${item.id}|${item.date}|${item.reminder}`, itemId: item.id, title: item.title, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
