import { migrateLegacyPomoHistory, type PomoSession, type PomoState } from './pomodoro';
import type { AgendaItem, DayLog, DayRating, Goal, Habit, JournalEntry, Settings } from './types';

/** Dışa aktarılan/geri yüklenen tüm veri. Sürüm bilgisi taşır (bkz. `parseBackup`). */
export interface Backup {
  app: 'kaizen';
  schemaVersion: number;
  exportedAt: string;
  habits: Habit[];
  logs: DayLog[];
  settings: Settings;
  pomodoro: PomoState;
  pomoSessions: PomoSession[];
  journal: JournalEntry[];
  ratings: DayRating[];
  agenda: AgendaItem[];
  goals: Goal[];
}

export interface BackupSummary {
  habits: number;
  logs: number;
  pomoSessions: number;
  journal: number;
  ratings: number;
  agenda: number;
  goals: number;
}

export type ParseResult = { ok: true; data: Backup; summary: BackupSummary } | { ok: false; error: string };

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const hasStringId = (v: unknown): v is { id: string } => !!v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string';

function summarize(d: Backup): BackupSummary {
  return {
    habits: d.habits.length,
    logs: d.logs.length,
    pomoSessions: d.pomoSessions.length,
    journal: d.journal.length,
    ratings: d.ratings.length,
    agenda: d.agenda.length,
    goals: d.goals.length,
  };
}

/**
 * Bir yedek dosyasını doğrular. Hatalı/tanınmayan dosyada mevcut veriye
 * DOKUNMADAN bir hata döndürür — çağıran taraf yalnızca `ok: true` ise
 * geri yüklemeye devam etmelidir.
 */
export function parseBackup(raw: unknown, currentSchemaVersion: number): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Dosya okunamadı: geçersiz JSON.' };
  const r = { ...(raw as Record<string, unknown>) };
  if (r.app !== 'kaizen') return { ok: false, error: 'Bu dosya bir Kaizen yedeği değil.' };
  if (typeof r.schemaVersion !== 'number' || !Number.isInteger(r.schemaVersion) || r.schemaVersion < 1) {
    return { ok: false, error: 'Yedek dosyasının sürüm bilgisi okunamadı.' };
  }
  if (r.schemaVersion > currentSchemaVersion) {
    return { ok: false, error: 'Bu yedek uygulamanın daha yeni bir sürümünden alınmış; önce uygulamayı güncelle.' };
  }
  if (typeof r.exportedAt !== 'string') return { ok: false, error: 'Yedek dosyasının tarihi okunamadı.' };

  // v1 → v2 alan göçü: bu koleksiyonlar eski yedeklerde hiç yoktu.
  if (r.schemaVersion < 2) {
    if (!Array.isArray(r.pomoSessions)) r.pomoSessions = migrateLegacyPomoHistory(r.pomoHistory);
    if (!Array.isArray(r.journal)) r.journal = [];
    if (!Array.isArray(r.ratings)) r.ratings = [];
    if (!Array.isArray(r.agenda)) r.agenda = [];
    if (!Array.isArray(r.goals)) r.goals = [];
    r.schemaVersion = currentSchemaVersion;
  }
  if (!isArr(r.habits) || !r.habits.every((h) => hasStringId(h) && Array.isArray((h as Habit).revisions))) {
    return { ok: false, error: 'Yedek dosyasındaki alışkanlık verisi bozuk.' };
  }
  const validLog = (l: unknown): l is DayLog => !!l && typeof l === 'object' && typeof (l as DayLog).habitId === 'string' && typeof (l as DayLog).date === 'string';
  if (!isArr(r.logs) || !r.logs.every(validLog)) return { ok: false, error: 'Yedek dosyasındaki günlük kayıt verisi bozuk.' };
  if (!r.settings || typeof r.settings !== 'object') return { ok: false, error: 'Yedek dosyasındaki ayar verisi bozuk.' };
  if (!r.pomodoro || typeof r.pomodoro !== 'object') return { ok: false, error: 'Yedek dosyasındaki Pomodoro durumu bozuk.' };
  for (const [key, label] of [
    ['pomoSessions', 'Pomodoro geçmişi'],
    ['journal', 'günlük'],
    ['ratings', 'gün puanı'],
    ['agenda', 'ajanda'],
    ['goals', 'hedef'],
  ] as const) {
    if (!isArr(r[key])) return { ok: false, error: `Yedek dosyasındaki ${label} verisi bozuk.` };
  }

  const data = r as unknown as Backup;
  return { ok: true, data, summary: summarize(data) };
}
