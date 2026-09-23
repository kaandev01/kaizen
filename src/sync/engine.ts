/**
 * Giden kuyruğu (outbox) buluta boşaltan + bulutu yerele çeken senkron motoru.
 * Yalnızca oturum açıkken var olur (bkz. main.tsx): `start()` ile `Store`'a
 * bağlanır, `stop()` ile (çıkışta) ayrılır. Yerel `Store`/`Storage` bulut
 * özelinden habersiz kalır — tüm Supabase/satır bilgisi burada ve `mapping.ts`'te.
 */
import type { PomoSession } from '../core/pomodoro';
import type { Store } from '../storage/store';
import type { Storage } from '../storage/storage';
import {
  agendaFromRow,
  agendaToRow,
  dayLogFromRow,
  goalFromRow,
  goalToRow,
  habitFromRow,
  habitToRow,
  journalFromRow,
  journalToRow,
  pomoSessionFromRow,
  pomoSessionToRow,
  ratingFromRow,
  ratingToRow,
  settingsFromRow,
  settingsToRow,
  type AgendaRow,
  type DayLogRow,
  type GoalRow,
  type HabitRow,
  type JournalRow,
  type PomoSessionRow,
  type RatingRow,
  type SettingsRow,
} from './mapping';
import { supabase } from './supabaseClient';
import type { OutboxEntry, OutboxOp, SyncStatus } from './types';

const RETRY_INTERVAL_MS = 30_000;
const CURSOR_PREFIX = 'syncCursor:';

const makeOpId = (): string => {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export class SyncEngine {
  private draining = false;
  private pulling = false;
  private timer?: ReturnType<typeof setInterval>;
  private attached = false;
  private status: SyncStatus = 'idle';

  constructor(
    private storage: Storage,
    private store: Store,
    private userId: string,
    private onStatusChange?: (s: SyncStatus) => void,
  ) {}

  start(): void {
    this.store.setSyncHook(this.enqueue);
    if (!this.attached) {
      this.attached = true;
      window.addEventListener('online', this.kick);
      document.addEventListener('visibilitychange', this.kick);
      window.addEventListener('focus', this.kick);
      this.timer = setInterval(this.kick, RETRY_INTERVAL_MS);
    }
    this.kick();
  }

  stop(): void {
    this.store.setSyncHook(null);
    if (this.attached) {
      this.attached = false;
      window.removeEventListener('online', this.kick);
      document.removeEventListener('visibilitychange', this.kick);
      window.removeEventListener('focus', this.kick);
      if (this.timer) clearInterval(this.timer);
    }
  }

  private kick = (): void => {
    void this.drain();
    void this.pullAll();
  };

  private setStatus(s: SyncStatus) {
    if (this.status === s) return;
    this.status = s;
    this.onStatusChange?.(s);
  }

  /** `Store.persist()` tarafından, yerel yazma başarılı olduktan hemen sonra çağrılır. */
  private enqueue = async (op: OutboxOp): Promise<void> => {
    const entry: OutboxEntry = { opId: makeOpId(), createdAt: Date.now(), op };
    await this.storage.putOutboxEntry(entry);
    void this.drain();
  };

  // ---- giden (push) -------------------------------------------------------
  private async drain(): Promise<void> {
    if (this.draining || !supabase) return;
    this.draining = true;
    try {
      for (;;) {
        const [entry] = await this.storage.listOutboxEntries();
        if (!entry) {
          this.setStatus('idle');
          return;
        }
        this.setStatus('syncing');
        try {
          await this.pushOne(entry);
          await this.storage.removeOutboxEntry(entry.opId);
        } catch (e) {
          console.error('Senkron gönderimi başarısız; bir sonraki denemede tekrar edilecek', e);
          this.setStatus(navigator.onLine === false ? 'offline' : 'error');
          return; // sırayı bozmadan dur — online/focus/interval bir sonraki `kick`'te tekrar dener
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async pushOne(entry: OutboxEntry): Promise<void> {
    if (!supabase) throw new Error('Supabase yapılandırılmamış');
    const op = entry.op;
    const nowIso = () => new Date().toISOString();
    switch (op.table) {
      case 'habits': {
        if (op.op === 'upsert') {
          const { error } = await supabase.from('habits').upsert(habitToRow(this.userId, op.row));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('habits').update({ deleted_at: nowIso() }).eq('id', op.id).eq('user_id', this.userId);
          if (error) throw error;
        }
        return;
      }
      case 'day_logs': {
        const { error } = await supabase.rpc('apply_day_log_delta', {
          p_op_id: entry.opId,
          p_id: op.id,
          p_habit_id: op.habitId,
          p_date: op.date,
          p_delta: op.delta,
          p_client_updated_at: op.updatedAt,
        });
        if (error) throw error;
        return;
      }
      case 'pomo_sessions': {
        // Değişmez kayıt: id çakışırsa hiçbir şey yapma (aynı seans iki kez kaydedilmez).
        const { error } = await supabase.from('pomo_sessions').upsert(pomoSessionToRow(this.userId, op.row), { ignoreDuplicates: true });
        if (error) throw error;
        return;
      }
      case 'journal_entries': {
        if (op.op === 'upsert') {
          const { error } = await supabase.from('journal_entries').upsert(journalToRow(this.userId, op.row));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('journal_entries').update({ deleted_at: nowIso() }).eq('id', op.id).eq('user_id', this.userId);
          if (error) throw error;
        }
        return;
      }
      case 'day_ratings': {
        if (op.op === 'upsert') {
          const { error } = await supabase.from('day_ratings').upsert(ratingToRow(this.userId, op.row));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('day_ratings').update({ deleted_at: nowIso() }).eq('date', op.date).eq('user_id', this.userId);
          if (error) throw error;
        }
        return;
      }
      case 'agenda_items': {
        if (op.op === 'upsert') {
          const { error } = await supabase.from('agenda_items').upsert(agendaToRow(this.userId, op.row));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('agenda_items').update({ deleted_at: nowIso() }).eq('id', op.id).eq('user_id', this.userId);
          if (error) throw error;
        }
        return;
      }
      case 'goals': {
        if (op.op === 'upsert') {
          const { error } = await supabase.from('goals').upsert(goalToRow(this.userId, op.row));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('goals').update({ deleted_at: nowIso() }).eq('id', op.id).eq('user_id', this.userId);
          if (error) throw error;
        }
        return;
      }
      case 'user_settings': {
        const { error } = await supabase.from('user_settings').upsert(settingsToRow(this.userId, op.row));
        if (error) throw error;
        return;
      }
    }
  }

  // ---- gelen (pull) --------------------------------------------------------
  private async pullAll(): Promise<void> {
    if (this.pulling || !supabase) return;
    this.pulling = true;
    try {
      await Promise.all([
        this.pullTable<HabitRow>('habits', (r) => {
          if (r.deleted_at) this.store.applyRemoteHabit(r.id, null);
          else this.store.applyRemoteHabit(r.id, habitFromRow(r));
        }),
        this.pullTable<DayLogRow>('day_logs', (r) => this.store.applyRemoteLog(r.id, dayLogFromRow(r))),
        this.pullTable<JournalRow>('journal_entries', (r) => {
          if (r.deleted_at) this.store.applyRemoteJournal(r.id, null);
          else this.store.applyRemoteJournal(r.id, journalFromRow(r));
        }),
        this.pullTable<RatingRow>('day_ratings', (r) => {
          if (r.deleted_at) this.store.applyRemoteRating(r.date, null);
          else this.store.applyRemoteRating(r.date, ratingFromRow(r));
        }),
        this.pullTable<AgendaRow>('agenda_items', (r) => {
          if (r.deleted_at) this.store.applyRemoteAgenda(r.id, null);
          else this.store.applyRemoteAgenda(r.id, agendaFromRow(r));
        }),
        this.pullTable<GoalRow>('goals', (r) => {
          if (r.deleted_at) this.store.applyRemoteGoal(r.id, null);
          else this.store.applyRemoteGoal(r.id, goalFromRow(r));
        }),
        this.pullTable<PomoSessionRow>('pomo_sessions', (r) => this.store.applyRemotePomoSession(pomoSessionFromRow(r) as PomoSession)),
        this.pullSettings(),
      ]);
    } catch (e) {
      console.error('Buluttan çekme başarısız; bir sonraki denemede tekrar edilecek', e);
    } finally {
      this.pulling = false;
    }
  }

  /** Tek bir tabloyu son senkron imlecinden (server_updated_at) itibaren artımlı çeker. */
  private async pullTable<R extends { server_updated_at: string }>(table: string, apply: (row: R) => void): Promise<void> {
    if (!supabase) return;
    const cursorKey = CURSOR_PREFIX + table;
    const cursor = (await this.storage.getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00.000Z';
    const { data, error } = await supabase.from(table).select('*').eq('user_id', this.userId).gt('server_updated_at', cursor).order('server_updated_at', { ascending: true }).limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as R[];
    for (const row of rows) apply(row);
    const last = rows.at(-1)?.server_updated_at;
    if (last) await this.storage.putMeta(cursorKey, last);
  }

  private async pullSettings(): Promise<void> {
    if (!supabase) return;
    const cursorKey = CURSOR_PREFIX + 'user_settings';
    const cursor = (await this.storage.getMeta<string>(cursorKey)) ?? '1970-01-01T00:00:00.000Z';
    const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', this.userId).gt('server_updated_at', cursor).limit(1);
    if (error) throw error;
    const row = (data ?? [])[0] as SettingsRow | undefined;
    if (!row) return;
    this.store.applyRemoteSettings(settingsFromRow(row));
    await this.storage.putMeta(cursorKey, row.server_updated_at);
  }
}
