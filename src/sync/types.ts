import type { PomoSession } from '../core/pomodoro';
import type { AgendaItem, DayRating, Goal, Habit, JournalEntry, Settings } from '../core/types';

/**
 * Giden kuyruğa (outbox) yazılan tek bir değişiklik. `Store` yalnızca BUNU üretir —
 * Supabase/satır biçimine çevirme işi `sync/mapping.ts`'e aittir (depolama katmanı
 * bulut özelinden habersiz kalır).
 *
 * `day_logs` için `op: 'delta'`: mutlak miktar değil, FARK gönderilir — iki cihazın
 * art arda +1'leri sunucuda birbirini silmesin diye (bkz. supabase/migrations'taki
 * apply_day_log_delta). Diğer tüm tablolar basit upsert/delete'tir.
 */
export type OutboxOp =
  | { table: 'user_settings'; op: 'upsert'; row: Settings }
  | { table: 'habits'; op: 'upsert'; row: Habit }
  | { table: 'habits'; op: 'delete'; id: string }
  | { table: 'day_logs'; op: 'delta'; id: string; habitId: string; date: string; delta: number; updatedAt: number }
  | { table: 'pomo_sessions'; op: 'upsert'; row: PomoSession }
  | { table: 'journal_entries'; op: 'upsert'; row: JournalEntry }
  | { table: 'journal_entries'; op: 'delete'; id: string }
  | { table: 'day_ratings'; op: 'upsert'; row: DayRating }
  | { table: 'day_ratings'; op: 'delete'; date: string }
  | { table: 'agenda_items'; op: 'upsert'; row: AgendaItem }
  | { table: 'agenda_items'; op: 'delete'; id: string }
  | { table: 'goals'; op: 'upsert'; row: Goal }
  | { table: 'goals'; op: 'delete'; id: string };

/** IndexedDB'deki `outbox` deposunda saklanan kayıt biçimi. */
export interface OutboxEntry {
  /** İstemcide üretilir; sunucu tarafı tekrar-denemeleri bununla tekilleştirir. */
  opId: string;
  createdAt: number;
  op: OutboxOp;
}

/** Küçük durum göstergesi için (App.tsx). */
export type SyncStatus = 'offline' | 'idle' | 'pending' | 'syncing' | 'error';
