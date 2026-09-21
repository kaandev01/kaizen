import { toDateKey, type Clock, type DateKey } from '../core/dates';
import { withRevision } from '../core/plan';
import * as pomo from '../core/pomodoro';
import { amountOf, type LogMap } from '../core/progress';
import { DEFAULT_SETTINGS, logKey, type DayLog, type Habit, type Settings } from '../core/types';
import { clampAmount, normalizeHabitInput, sanitizePomodoroConfig, validateHabitInput, type HabitInput } from '../core/validation';
import type { Storage } from './storage';

export const SCHEMA_VERSION = 1;
const MAX_POMO_HISTORY = 2000;

export interface AppState {
  ready: boolean;
  habits: Habit[];
  logs: LogMap;
  settings: Settings;
  pomodoro: pomo.PomoState;
  pomoHistory: pomo.PomoRecord[];
  /** Kaydetme başarısız olduysa kullanıcıya gösterilecek mesaj. */
  persistError: string | null;
  storageKind: Storage['kind'];
}

export interface ExportData {
  app: 'kaizen';
  schemaVersion: number;
  exportedAt: string;
  habits: Habit[];
  logs: DayLog[];
  settings: Settings;
  pomodoro: pomo.PomoState;
  pomoHistory: pomo.PomoRecord[];
}

export function makeId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // randomUUID güvenli olmayan bağlamda (http) yok; yedek üretici.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function mergeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  return {
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_SETTINGS.theme,
    haptics: typeof r.haptics === 'boolean' ? r.haptics : DEFAULT_SETTINGS.haptics,
    notifications: typeof r.notifications === 'boolean' ? r.notifications : DEFAULT_SETTINGS.notifications,
    silent: typeof r.silent === 'boolean' ? r.silent : DEFAULT_SETTINGS.silent,
    keepAwake: typeof r.keepAwake === 'boolean' ? r.keepAwake : DEFAULT_SETTINGS.keepAwake,
    pomodoro: sanitizePomodoroConfig({ ...DEFAULT_SETTINGS.pomodoro, ...(r.pomodoro ?? {}) }),
  };
}

const validHabit = (h: Habit) => !!h && typeof h.id === 'string' && Array.isArray(h.revisions) && h.revisions.length > 0;

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private storage: Storage,
    private clock: Clock,
    private genId: () => string = makeId,
  ) {
    this.state = {
      ready: false,
      habits: [],
      logs: {},
      settings: DEFAULT_SETTINGS,
      pomodoro: pomo.initialPomo(DEFAULT_SETTINGS.pomodoro),
      pomoHistory: [],
      persistError: null,
      storageKind: storage.kind,
    };
  }

  // ---- durum / abonelik --------------------------------------------------
  getState = (): AppState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private persist(job: () => Promise<void>) {
    this.queue = this.queue.then(job).then(
      () => {
        if (this.state.persistError) this.set({ persistError: null });
      },
      (e) => {
        console.error('Kaydetme hatası', e);
        this.set({ persistError: 'Veriler cihaza kaydedilemedi. Verilerini dışa aktarmayı düşün.' });
      },
    );
  }

  /** Bekleyen tüm yazmaların bitmesini bekler (testler ve kapanış için). */
  flush = (): Promise<void> => this.queue;

  // ---- başlatma ----------------------------------------------------------
  async init(): Promise<void> {
    const snap = await this.storage.load();
    const settings = mergeSettings(snap.meta.settings);
    const habits = snap.habits.filter(validHabit).sort((a, b) => a.order - b.order);
    const logs: LogMap = {};
    for (const l of snap.logs) logs[l.key] = l;

    let pomodoro = pomo.initialPomo(settings.pomodoro);
    const savedPomo = snap.meta.pomodoro as pomo.PomoState | undefined;
    if (savedPomo && typeof savedPomo === 'object' && 'phase' in savedPomo) pomodoro = savedPomo;
    const pomoHistory = Array.isArray(snap.meta.pomoHistory) ? (snap.meta.pomoHistory as pomo.PomoRecord[]) : [];

    this.state = { ...this.state, ready: true, habits, logs, settings, pomodoro, pomoHistory };
    if (snap.meta.schemaVersion !== SCHEMA_VERSION) {
      // Gelecekteki şema geçişleri burada, schemaVersion'a göre yapılır.
      this.persist(() => this.storage.putMeta('schemaVersion', SCHEMA_VERSION));
    }
    // Uygulama kapalıyken biten aşamayı tamamla (tam bir kez).
    this.pomoSettle();
    this.listeners.forEach((l) => l());
  }

  // ---- alışkanlıklar -----------------------------------------------------
  addHabit(input: HabitInput): Habit {
    const err = validateHabitInput(input);
    if (err) throw new Error(err);
    const i = normalizeHabitInput(input);
    const today = toDateKey(this.clock.now());
    const habit: Habit = {
      id: this.genId(),
      name: i.name,
      icon: i.icon,
      color: i.color,
      reminders: i.reminders,
      revisions: [{ from: today, target: i.target, unit: i.unit, schedule: i.schedule }],
      createdAt: today,
      order: this.state.habits.reduce((m, h) => Math.max(m, h.order), -1) + 1,
    };
    this.set({ habits: [...this.state.habits, habit] });
    this.persist(() => this.storage.putHabit(habit));
    return habit;
  }

  /** Hedef/birim/tekrar değişiklikleri bugünden itibaren geçerli olur; geçmiş korunur. */
  updateHabit(id: string, input: HabitInput): Habit {
    const err = validateHabitInput(input);
    if (err) throw new Error(err);
    const existing = this.state.habits.find((h) => h.id === id);
    if (!existing) throw new Error('Alışkanlık bulunamadı.');
    const i = normalizeHabitInput(input);
    const today = toDateKey(this.clock.now());
    const habit: Habit = {
      ...existing,
      name: i.name,
      icon: i.icon,
      color: i.color,
      reminders: i.reminders,
      revisions: withRevision(existing, { target: i.target, unit: i.unit, schedule: i.schedule }, today),
    };
    this.set({ habits: this.state.habits.map((h) => (h.id === id ? habit : h)) });
    this.persist(() => this.storage.putHabit(habit));
    return habit;
  }

  /** Alışkanlığı ve tüm günlük kayıtlarını siler. */
  deleteHabit(id: string): void {
    const logs: LogMap = {};
    for (const [k, l] of Object.entries(this.state.logs)) if (l.habitId !== id) logs[k] = l;
    this.set({ habits: this.state.habits.filter((h) => h.id !== id), logs });
    this.persist(() => this.storage.removeHabit(id));
  }

  // ---- günlük miktar -----------------------------------------------------
  /** Yeni miktarı kaydeder; önceki miktarı döndürür (geri alma için). */
  setAmount(habitId: string, date: DateKey, amount: number): number {
    const prev = amountOf(this.state.logs, habitId, date);
    const next = clampAmount(amount);
    if (next === prev) return prev;
    const key = logKey(habitId, date);
    const logs = { ...this.state.logs };
    if (next === 0) {
      delete logs[key];
      this.persist(() => this.storage.removeLog(key));
    } else {
      const log: DayLog = { key, habitId, date, amount: next, updatedAt: this.clock.now().getTime() };
      logs[key] = log;
      this.persist(() => this.storage.putLog(log));
    }
    this.set({ logs });
    return prev;
  }

  // ---- ayarlar -----------------------------------------------------------
  updateSettings(patch: Partial<Settings>): void {
    const settings = mergeSettings({ ...this.state.settings, ...patch });
    const pomodoro = pomo.applyConfig(this.state.pomodoro, settings.pomodoro);
    this.set({ settings, pomodoro });
    this.persist(() => this.storage.putMeta('settings', settings));
    this.persist(() => this.storage.putMeta('pomodoro', pomodoro));
  }

  // ---- pomodoro ----------------------------------------------------------
  private setPomo(next: pomo.PomoState, record: pomo.PomoRecord | null = null) {
    if (next === this.state.pomodoro && !record) return;
    let pomoHistory = this.state.pomoHistory;
    if (record && !pomoHistory.some((r) => r.id === record.id)) {
      pomoHistory = [...pomoHistory, record].slice(-MAX_POMO_HISTORY);
      this.persist(() => this.storage.putMeta('pomoHistory', pomoHistory));
    }
    this.set({ pomodoro: next, pomoHistory });
    this.persist(() => this.storage.putMeta('pomodoro', next));
  }

  /** Süresi dolduysa aşamayı tamamlar. Sık çağrılabilir; idempotent. */
  pomoSettle(): boolean {
    const { state, record } = pomo.settle(this.state.pomodoro, this.state.settings.pomodoro, this.clock.now().getTime());
    if (state === this.state.pomodoro) return false;
    this.setPomo(state, record);
    return true;
  }

  pomoStart() {
    this.pomoSettle();
    this.setPomo(pomo.start(this.state.pomodoro, this.clock.now().getTime(), this.genId()));
  }
  pomoPause() {
    if (this.pomoSettle()) return; // zaten bitmişse duraklatma anlamsız
    this.setPomo(pomo.pause(this.state.pomodoro, this.clock.now().getTime()));
  }
  pomoReset() {
    this.setPomo(pomo.reset(this.state.pomodoro, this.state.settings.pomodoro));
  }
  pomoSelectPhase(phase: pomo.Phase) {
    this.setPomo(pomo.selectPhase(this.state.pomodoro, this.state.settings.pomodoro, phase));
  }
  pomoSkipBreak() {
    this.setPomo(pomo.skipBreak(this.state.pomodoro, this.state.settings.pomodoro));
  }
  pomoDismissCompletion() {
    this.setPomo(pomo.dismissCompletion(this.state.pomodoro));
  }

  // ---- yedek -------------------------------------------------------------
  exportData(): ExportData {
    return {
      app: 'kaizen',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.clock.now().toISOString(),
      habits: this.state.habits,
      logs: Object.values(this.state.logs),
      settings: this.state.settings,
      pomodoro: this.state.pomodoro,
      pomoHistory: this.state.pomoHistory,
    };
  }

}
