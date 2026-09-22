import { atLocalTime, daysBetween, toDateKey, type DateKey } from './dates';
import type { AgendaItem, AgendaReminder, ReminderOffsetKind } from './types';

/** Eski/eksik kayıtlara (şema genişlemesinden önce saklanmış olabilir) güvenli varsayılanlar uygular. */
export function normalizeAgendaItem(raw: AgendaItem): AgendaItem {
  return {
    ...raw,
    importance: raw.importance ?? 'normal',
    reminders: Array.isArray(raw.reminders) ? raw.reminders : legacyReminderToList(raw),
    reminderAnchorTime: raw.reminderAnchorTime ?? null,
    completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : raw.done ? raw.updatedAt : null,
  };
}

/** v1 tekil `reminder: "HH:mm"` alanını yeni çoklu listeye çevirir (geriye dönük uyumluluk). */
function legacyReminderToList(raw: AgendaItem): AgendaReminder[] {
  const legacy = (raw as unknown as { reminder?: string | null }).reminder;
  return legacy && isValidTimeStr(legacy) ? [{ id: 'legacy', kind: 'exact' }] : [];
}
const isValidTimeStr = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

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

/**
 * Zamana bağlı aciliyet — kullanıcının seçtiği `importance` (önem) alanından
 * BAĞIMSIZDIR, ikisi karıştırılmaz. Yalnızca "ne kadar yakın/geçmiş" bilgisini taşır.
 */
export type Urgency = 'overdue' | 'today' | 'soon' | 'later';

export function urgencyOf(item: AgendaItem, now: Date): Urgency {
  if (isOverdue(item, now)) return 'overdue';
  const today = toDateKey(now);
  if (item.date === today) return 'today';
  return daysBetween(today, item.date) <= 3 ? 'soon' : 'later';
}

/** "Bugün 18:30", "Yarın", "3 gün kaldı", "2 gün gecikti" gibi kısa bir ifade. Saatler her zaman 24 saat, "HH:mm". */
export function formatUrgencyPhrase(item: AgendaItem, now: Date): string {
  const today = toDateKey(now);
  if (isOverdue(item, now)) {
    if (item.date === today) return 'Bugün geçti';
    return `${daysBetween(item.date, today)} gün gecikti`;
  }
  if (item.date === today) return item.time ? `Bugün ${item.time}` : 'Bugün';
  const days = daysBetween(today, item.date);
  if (days === 1) return item.time ? `Yarın ${item.time}` : 'Yarın';
  return `${days} gün kaldı`;
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

/** Yaklaşan (tamamlanmamış, bugünden itibaren) kayıtlar; gecikmişler de dahildir — gecikenler tarih sırasıyla en başta. */
export function upcomingAgenda(items: AgendaItem[], now: Date, opts: { horizonDays?: number } = {}): AgendaItem[] {
  const today = toDateKey(now);
  const { horizonDays } = opts;
  const cutoff = horizonDays !== undefined ? atLocalTime(today, '00:00') + horizonDays * 86_400_000 : Infinity;
  return sortAgenda(items.filter((i) => !i.done && (i.date >= today || isOverdue(i, now)) && sortKey(i) <= cutoff));
}

/** Ana ekranın "Yaklaşan" bölümü için: en fazla `limit` kayıt, gecikenler önce. */
export function homeUpcoming(items: AgendaItem[], now: Date, limit = 3): AgendaItem[] {
  return upcomingAgenda(items, now).slice(0, limit);
}

export interface AgendaGroups {
  overdue: AgendaItem[];
  today: AgendaItem[];
  upcoming: AgendaItem[];
  completed: AgendaItem[];
}

/** Ajanda liste görünümü için: Geciken / Bugün / Yaklaşan / Tamamlanan. */
export function groupAgenda(items: AgendaItem[], now: Date): AgendaGroups {
  const today = toDateKey(now);
  const groups: AgendaGroups = { overdue: [], today: [], upcoming: [], completed: [] };
  for (const item of sortAgenda(items)) {
    if (item.done) groups.completed.push(item);
    else if (isOverdue(item, now)) groups.overdue.push(item);
    else if (item.date === today) groups.today.push(item);
    else groups.upcoming.push(item);
  }
  // Tamamlananlar en son tamamlanan en üstte olacak şekilde (sortAgenda'nın tarih sırasını burada tersine çeviriyoruz).
  groups.completed.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  return groups;
}

/**
 * Bir hatırlatmanın tetiklenme anı (epoch ms). Tüm günlük bir kayıtta,
 * kullanıcı `reminderAnchorTime` seçmeden offset tabanlı (exact/1h/1d/1w)
 * hatırlatmalar HİÇBİR ZAMAN gece yarısına düşerek sessizce hesaplanmaz —
 * bu durumda `null` döner (hatırlatma planlanmaz).
 */
export function reminderTriggerAt(item: AgendaItem, r: AgendaReminder): number | null {
  if (r.kind === 'custom') {
    return r.customDate && r.customTime && isValidTimeStr(r.customTime) ? atLocalTime(r.customDate, r.customTime) : null;
  }
  const time = item.time ?? item.reminderAnchorTime;
  if (!time) return null;
  const base = atLocalTime(item.date, time);
  const OFFSET_MS: Record<Exclude<ReminderOffsetKind, 'custom'>, number> = { exact: 0, '1h': 3_600_000, '1d': 86_400_000, '1w': 7 * 86_400_000 };
  return base - OFFSET_MS[r.kind as Exclude<ReminderOffsetKind, 'custom'>];
}

export interface AgendaReminderOccurrence {
  /** `${itemId}|${reminderId}|${tetiklenmeAnı}` — düzenleme/silme sonrası doğal olarak değişir, çift oluşmaz. */
  id: string;
  itemId: string;
  reminderId: string;
  title: string;
  at: number;
}

/** (fromMs, toMs] aralığında, henüz tamamlanmamış kayıtların TÜM hatırlatmaları. */
export function agendaRemindersBetween(items: AgendaItem[], fromMs: number, toMs: number): AgendaReminderOccurrence[] {
  const out: AgendaReminderOccurrence[] = [];
  for (const item of items) {
    if (item.done) continue;
    for (const r of item.reminders) {
      const at = reminderTriggerAt(item, r);
      if (at !== null && at > fromMs && at <= toMs) {
        out.push({ id: `${item.id}|${r.id}|${at}`, itemId: item.id, reminderId: r.id, title: item.title, at });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Bir kaydın tüm hatırlatmalarının anları — geçmişte kalanları da işaretleyerek (editör uyarısı için). */
export function reminderPreview(item: AgendaItem, now: Date): { reminder: AgendaReminder; at: number | null; past: boolean }[] {
  return item.reminders.map((r) => {
    const at = reminderTriggerAt(item, r);
    return { reminder: r, at, past: at !== null && at <= now.getTime() };
  });
}

export const REMINDER_OFFSET_LABEL: Record<ReminderOffsetKind, string> = {
  '1w': '1 hafta önce',
  '1d': '1 gün önce',
  '1h': '1 saat önce',
  exact: 'Tam zamanında',
  custom: 'Özel zaman',
};
