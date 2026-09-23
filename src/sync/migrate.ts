/**
 * İlk girişten sonra bu cihazdaki (giriş öncesi, varsayılan `kaizen` adlı eski
 * veritabanındaki) veriyi hesaba aktarma. Yerel veri hiçbir zaman silinmez —
 * yalnızca buluta yüklenir; `ignoreDuplicates: true` hem "tekrar denenirse
 * kopya oluşmaz" hem "buluttaki mevcut kayıt körlemesine ezilmez" gereksinimini
 * tek satırda karşılar (id zaten client-üretimli UUID, PK çakışırsa dokunulmaz).
 */
import type { Snapshot } from '../storage/storage';
import { openBestStorage } from '../storage/storage';
import { agendaToRow, goalToRow, habitToRow, journalToRow, pomoSessionToRow, ratingToRow } from './mapping';
import { supabase } from './supabaseClient';

export interface LegacySummary {
  habits: number;
  logs: number;
  pomoSessions: number;
  journal: number;
  ratings: number;
  agenda: number;
  goals: number;
}

export interface LegacyMigration {
  snapshot: Snapshot;
  summary: LegacySummary;
}

const summarize = (s: Snapshot): LegacySummary => ({
  habits: s.habits.length,
  logs: s.logs.length,
  pomoSessions: s.pomoSessions.length,
  journal: s.journal.length,
  ratings: s.ratings.length,
  agenda: s.agenda.length,
  goals: s.goals.length,
});

/**
 * Eski (giriş öncesi) `kaizen` veritabanını okur — DEĞİŞTİRMEZ, yalnızca okur.
 * `alreadyHandled` true ise (bu cihazda daha önce aktarım teklif edilip
 * sonuçlandıysa — kabul ya da atlama fark etmez) hiç açmadan `null` döner:
 * "sonra giriş yapan başka bir hesaba otomatik aktarma" riskini kapatır.
 */
export async function checkLegacyMigration(alreadyHandled: boolean): Promise<LegacyMigration | null> {
  if (alreadyHandled) return null;
  const { storage } = await openBestStorage('kaizen');
  const snapshot = await storage.load();
  const summary = summarize(snapshot);
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  return total > 0 ? { snapshot, summary } : null;
}

/**
 * Yerel veriyi hesaba yükler (insert-only upsert — bkz. üstteki not). Yerel
 * veri SİLİNMEZ; yarım kalırsa (ağ hatası vb.) güvenle tekrar çağrılabilir.
 */
export async function importLegacyData(userId: string, snapshot: Snapshot): Promise<void> {
  if (!supabase) throw new Error('Supabase yapılandırılmamış');
  const jobs: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (snapshot.habits.length) {
    jobs.push(supabase.from('habits').upsert(snapshot.habits.map((h) => habitToRow(userId, h)), { ignoreDuplicates: true }));
  }
  if (snapshot.logs.length) {
    jobs.push(
      supabase.from('day_logs').upsert(
        snapshot.logs.map((l) => ({ id: l.key, user_id: userId, habit_id: l.habitId, date: l.date, amount: l.amount, updated_at: l.updatedAt })),
        { ignoreDuplicates: true },
      ),
    );
  }
  if (snapshot.journal.length) {
    jobs.push(supabase.from('journal_entries').upsert(snapshot.journal.map((e) => journalToRow(userId, e)), { ignoreDuplicates: true }));
  }
  if (snapshot.ratings.length) {
    jobs.push(supabase.from('day_ratings').upsert(snapshot.ratings.map((r) => ratingToRow(userId, r)), { ignoreDuplicates: true }));
  }
  if (snapshot.agenda.length) {
    jobs.push(supabase.from('agenda_items').upsert(snapshot.agenda.map((a) => agendaToRow(userId, a)), { ignoreDuplicates: true }));
  }
  if (snapshot.goals.length) {
    jobs.push(supabase.from('goals').upsert(snapshot.goals.map((g) => goalToRow(userId, g)), { ignoreDuplicates: true }));
  }
  if (snapshot.pomoSessions.length) {
    jobs.push(supabase.from('pomo_sessions').upsert(snapshot.pomoSessions.map((s) => pomoSessionToRow(userId, s)), { ignoreDuplicates: true }));
  }
  const results = await Promise.all(jobs);
  for (const { error } of results) if (error) throw new Error(error.message);
}
