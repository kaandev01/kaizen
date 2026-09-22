import { normalizeAgendaItem } from '../core/agenda';
import type { Backup } from '../core/backup';
import { toDateKey, type Clock, type DateKey } from '../core/dates';
import { withRevision } from '../core/plan';
import * as pomo from '../core/pomodoro';
import { amountOf, type LogMap } from '../core/progress';
import {
  DEFAULT_SETTINGS,
  logKey,
  type AgendaItem,
  type DayLog,
  type DayRating,
  type Goal,
  type GoalPeriod,
  type Habit,
  type JournalEntry,
  type Settings,
} from '../core/types';
import {
  clampAmount,
  isValidRating,
  normalizeAgendaReminders,
  normalizeHabitInput,
  sanitizePomodoroConfig,
  validateAgendaInput,
  validateGoalInput,
  validateHabitInput,
  validateJournalText,
  type AgendaInput,
  type GoalInput,
  type HabitInput,
} from '../core/validation';
import type { FullSnapshot, Storage } from './storage';

/** Bir yazma işleminin sonucu: kalıcı olarak gerçekten yazıldı mı (`saved` çözümlenince). */
export interface Persisted<T> {
  item: T;
  saved: Promise<boolean>;
}

/**
 * v1: habits/logs/settings/pomodoro/pomoHistory.
 * v2: Pomodoro geçmişi zengin `PomoSession` kayıtlarına taşındı (kendi
 * deposunda); günlük, gün puanı, ajanda ve hedefler eklendi. Geçiş `init()`
 * içinde, mevcut kullanıcı verisi kaybedilmeden yapılır (bkz. aşağıdaki yorum).
 */
export const SCHEMA_VERSION = 2;

export interface AppState {
  ready: boolean;
  habits: Habit[];
  logs: LogMap;
  settings: Settings;
  pomodoro: pomo.PomoState;
  pomoSessions: pomo.PomoSession[];
  journal: JournalEntry[];
  /** Gün → puan; girilmemiş gün için kayıt yoktur. */
  ratings: Record<DateKey, DayRating>;
  agenda: AgendaItem[];
  goals: Goal[];
  /** Kaydetme başarısız olduysa kullanıcıya gösterilecek mesaj. */
  persistError: string | null;
  storageKind: Storage['kind'];
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
const validJournalEntry = (e: JournalEntry) => !!e && typeof e.id === 'string' && typeof e.date === 'string' && typeof e.text === 'string';
const validRating = (r: DayRating) => !!r && typeof r.date === 'string' && isValidRating(r.score);
const validAgendaItem = (a: AgendaItem) => !!a && typeof a.id === 'string' && typeof a.date === 'string' && typeof a.title === 'string';
const validGoal = (g: Goal) => !!g && typeof g.id === 'string' && typeof g.title === 'string' && !!g.period;

/** Bekleyen (idle olmayan) bir pomodoro durumunu güvenle geri yükler; alan eksikse (eski şema) tamamlar. */
function normalizePomoState(raw: unknown, fallback: pomo.PomoState): pomo.PomoState {
  if (!raw || typeof raw !== 'object' || !('phase' in raw)) return fallback;
  const p = raw as pomo.PomoState;
  return {
    ...p,
    segments: Array.isArray(p.segments) ? p.segments : [],
    startedAt: typeof p.startedAt === 'number' ? p.startedAt : null,
    runningSince: typeof p.runningSince === 'number' ? p.runningSince : null,
  };
}

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
      pomoSessions: [],
      journal: [],
      ratings: {},
      agenda: [],
      goals: [],
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

  /**
   * Yazma işlemini sıraya sokar (kalıcı hata durumunu her zamanki gibi genel
   * `persistError` bandına yansıtır) VE bu belirli çağrının gerçekten başarılı
   * olup olmadığını `Promise<boolean>` olarak döndürür. Çoğu çağıran bunu
   * beklemeden (fire-and-forget) kullanır — bu, kuyruğun sırasını bozmaz.
   * Anlık başarı/başarısızlığı bilmesi gereken çağıranlar (ör. bir formu
   * kapatmadan önce) sonucu await edebilir.
   */
  private persist(job: () => Promise<void>): Promise<boolean> {
    const attempt = this.queue.then(job);
    this.queue = attempt.then(
      () => {
        if (this.state.persistError) this.set({ persistError: null });
      },
      (e) => {
        console.error('Kaydetme hatası', e);
        this.set({ persistError: 'Veriler cihaza kaydedilemedi. Verilerini dışa aktarmayı düşün.' });
      },
    );
    return attempt.then(
      () => true,
      () => false,
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

    const schemaVersion = typeof snap.meta.schemaVersion === 'number' ? snap.meta.schemaVersion : 0;
    let pomoSessions = snap.pomoSessions;
    let pomodoroMeta = snap.meta.pomodoro;

    if (schemaVersion < SCHEMA_VERSION) {
      if (schemaVersion < 2) {
        // v1 → v2: eski meta.pomoHistory blobu yeni pomoSessions deposuna taşınır.
        const existingIds = new Set(pomoSessions.map((s) => s.id));
        const migrated = pomo.migrateLegacyPomoHistory(snap.meta.pomoHistory).filter((s) => !existingIds.has(s.id));
        pomoSessions = [...pomoSessions, ...migrated];
        for (const s of migrated) this.persist(() => this.storage.putPomoSession(s));
        // Şema geçişinde o an sürmekte olan sayaç bırakılır: kalıcı kayıtlar (alışkanlıklar,
        // günlük kayıtlar, tamamlanmış Pomodoro geçmişi) korunur; yalnızca canlı sayaç,
        // hangi güne ait olduğu belirsiz sahte bir kayıt üretmemek için sıfırlanır.
        const pm = pomodoroMeta as pomo.PomoState | undefined;
        if (pm && (pm.status === 'running' || pm.status === 'paused')) pomodoroMeta = undefined;
      }
      this.persist(() => this.storage.putMeta('schemaVersion', SCHEMA_VERSION));
    }

    const pomodoro = normalizePomoState(pomodoroMeta, pomo.initialPomo(settings.pomodoro));
    const journal = snap.journal.filter(validJournalEntry);
    const ratings: Record<DateKey, DayRating> = {};
    for (const r of snap.ratings.filter(validRating)) ratings[r.date] = r;
    const agenda = snap.agenda.filter(validAgendaItem).map(normalizeAgendaItem);
    const goals = snap.goals.filter(validGoal);

    this.state = { ...this.state, ready: true, habits, logs, settings, pomodoro, pomoSessions, journal, ratings, agenda, goals };
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

  // ---- pomodoro ------------------------------------------------------------
  /** Pomodoro durumunu ve (varsa) yeni kalıcı seans kaydını birlikte uygular. */
  private applyPomo(next: pomo.PomoState, record: pomo.PomoSession | null) {
    let pomoSessions = this.state.pomoSessions;
    if (record && !pomoSessions.some((s) => s.id === record.id)) {
      // Aynı seans (runId) iki kez kaydedilmez — yeniden açılış/deneme güvenlidir.
      pomoSessions = [...pomoSessions, record];
      this.persist(() => this.storage.putPomoSession(record));
    }
    if (next === this.state.pomodoro && pomoSessions === this.state.pomoSessions) return;
    this.set({ pomodoro: next, pomoSessions });
    this.persist(() => this.storage.putMeta('pomodoro', next));
  }

  /** Süresi dolduysa aşamayı tamamlar. Sık çağrılabilir; idempotent. */
  pomoSettle(): boolean {
    const { state, record } = pomo.settle(this.state.pomodoro, this.state.settings.pomodoro, this.clock.now().getTime());
    if (state === this.state.pomodoro) return false;
    this.applyPomo(state, record);
    return true;
  }

  pomoStart() {
    this.pomoSettle();
    this.applyPomo(pomo.start(this.state.pomodoro, this.clock.now().getTime(), this.genId()), null);
  }
  pomoPause() {
    if (this.pomoSettle()) return; // zaten bitmişse duraklatma anlamsız
    this.applyPomo(pomo.pause(this.state.pomodoro, this.clock.now().getTime()), null);
  }
  pomoReset() {
    const { state, record } = pomo.reset(this.state.pomodoro, this.state.settings.pomodoro, this.clock.now().getTime());
    this.applyPomo(state, record);
  }
  pomoSelectPhase(phase: pomo.Phase) {
    const { state, record } = pomo.selectPhase(this.state.pomodoro, this.state.settings.pomodoro, phase, this.clock.now().getTime());
    this.applyPomo(state, record);
  }
  pomoSkipBreak() {
    const { state, record } = pomo.skipBreak(this.state.pomodoro, this.state.settings.pomodoro, this.clock.now().getTime());
    this.applyPomo(state, record);
  }
  pomoDismissCompletion() {
    this.applyPomo(pomo.dismissCompletion(this.state.pomodoro), null);
  }

  // ---- günlük (journal) ------------------------------------------------------
  addJournalEntry(date: DateKey, text: string, source: JournalEntry['source']): JournalEntry {
    const err = validateJournalText(text);
    if (err) throw new Error(err);
    const now = this.clock.now().getTime();
    const entry: JournalEntry = { id: this.genId(), date, text: text.trim(), source, createdAt: now, updatedAt: now };
    this.set({ journal: [...this.state.journal, entry] });
    this.persist(() => this.storage.putJournalEntry(entry));
    return entry;
  }

  updateJournalEntry(id: string, text: string): JournalEntry {
    const err = validateJournalText(text);
    if (err) throw new Error(err);
    const existing = this.state.journal.find((e) => e.id === id);
    if (!existing) throw new Error('Not bulunamadı.');
    const entry: JournalEntry = { ...existing, text: text.trim(), updatedAt: this.clock.now().getTime() };
    this.set({ journal: this.state.journal.map((e) => (e.id === id ? entry : e)) });
    this.persist(() => this.storage.putJournalEntry(entry));
    return entry;
  }

  deleteJournalEntry(id: string): void {
    this.set({ journal: this.state.journal.filter((e) => e.id !== id) });
    this.persist(() => this.storage.removeJournalEntry(id));
  }

  // ---- gün puanı ---------------------------------------------------------------
  /** `score=null` puanı temizler. Girilmemiş gün için hiçbir zaman 0 kaydı oluşturulmaz. */
  setRating(date: DateKey, score: number | null): void {
    if (score === null) {
      if (!this.state.ratings[date]) return;
      const ratings = { ...this.state.ratings };
      delete ratings[date];
      this.set({ ratings });
      this.persist(() => this.storage.removeRating(date));
      return;
    }
    if (!isValidRating(score)) throw new Error('Puan 1 ile 10 arasında bir tam sayı olmalı.');
    const rating: DayRating = { date, score, updatedAt: this.clock.now().getTime() };
    this.set({ ratings: { ...this.state.ratings, [date]: rating } });
    this.persist(() => this.storage.putRating(rating));
  }

  // ---- ajanda (deadline / etkinlik) -------------------------------------------
  /**
   * Anında (iyimser) olarak listeye ekler — kaydetme çağrısını bekletmeden
   * "yeni kaydı hemen göster" gereksinimini karşılar. `saved` gerçek
   * IndexedDB yazması başarılı mı diye çözümlenir; başarısızsa öğe otomatik
   * olarak geri alınır (listeden kaldırılır) ki arayüz gerçeği yanlış göstermesin.
   */
  addAgendaItem(input: AgendaInput): Persisted<AgendaItem> {
    const err = validateAgendaInput(input);
    if (err) throw new Error(err);
    const now = this.clock.now().getTime();
    const item: AgendaItem = {
      id: this.genId(),
      title: input.title.trim(),
      kind: input.kind,
      date: input.date,
      time: input.time,
      description: input.description.trim(),
      importance: input.importance,
      reminders: normalizeAgendaReminders(input.reminders),
      reminderAnchorTime: input.time ? null : input.reminderAnchorTime,
      done: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.set({ agenda: [...this.state.agenda, item] });
    const saved = this.persist(() => this.storage.putAgendaItem(item)).then((ok) => {
      if (!ok) this.set({ agenda: this.state.agenda.filter((a) => a.id !== item.id) });
      return ok;
    });
    return { item, saved };
  }

  updateAgendaItem(id: string, input: AgendaInput): Persisted<AgendaItem> {
    const err = validateAgendaInput(input);
    if (err) throw new Error(err);
    const existing = this.state.agenda.find((a) => a.id === id);
    if (!existing) throw new Error('Kayıt bulunamadı.');
    const item: AgendaItem = {
      ...existing,
      title: input.title.trim(),
      kind: input.kind,
      date: input.date,
      time: input.time,
      description: input.description.trim(),
      importance: input.importance,
      reminders: normalizeAgendaReminders(input.reminders),
      reminderAnchorTime: input.time ? null : input.reminderAnchorTime,
      updatedAt: this.clock.now().getTime(),
    };
    this.set({ agenda: this.state.agenda.map((a) => (a.id === id ? item : a)) });
    const saved = this.persist(() => this.storage.putAgendaItem(item)).then((ok) => {
      if (!ok) this.set({ agenda: this.state.agenda.map((a) => (a.id === id ? existing : a)) });
      return ok;
    });
    return { item, saved };
  }

  /** Tamamlanma zamanını (`completedAt`) tutar; geri alınırsa null'a döner ve gelecekteki hatırlatmalar tekrar geçerli olur. */
  setAgendaDone(id: string, done: boolean): void {
    const existing = this.state.agenda.find((a) => a.id === id);
    if (!existing || existing.done === done) return;
    const item: AgendaItem = { ...existing, done, completedAt: done ? this.clock.now().getTime() : null, updatedAt: this.clock.now().getTime() };
    this.set({ agenda: this.state.agenda.map((a) => (a.id === id ? item : a)) });
    this.persist(() => this.storage.putAgendaItem(item));
  }

  deleteAgendaItem(id: string): void {
    this.set({ agenda: this.state.agenda.filter((a) => a.id !== id) });
    this.persist(() => this.storage.removeAgendaItem(id));
  }

  // ---- hedefler (aylık/yıllık) -------------------------------------------------
  addGoal(input: GoalInput, period: GoalPeriod): Goal {
    const err = validateGoalInput(input);
    if (err) throw new Error(err);
    const now = this.clock.now().getTime();
    const goal: Goal = { id: this.genId(), title: input.title.trim(), description: input.description.trim(), period, status: 'active', createdAt: now, updatedAt: now };
    this.set({ goals: [...this.state.goals, goal] });
    this.persist(() => this.storage.putGoal(goal));
    return goal;
  }

  updateGoal(id: string, input: GoalInput, period: GoalPeriod): Goal {
    const err = validateGoalInput(input);
    if (err) throw new Error(err);
    const existing = this.state.goals.find((g) => g.id === id);
    if (!existing) throw new Error('Hedef bulunamadı.');
    const goal: Goal = { ...existing, title: input.title.trim(), description: input.description.trim(), period, updatedAt: this.clock.now().getTime() };
    this.set({ goals: this.state.goals.map((g) => (g.id === id ? goal : g)) });
    this.persist(() => this.storage.putGoal(goal));
    return goal;
  }

  setGoalStatus(id: string, status: Goal['status']): void {
    const existing = this.state.goals.find((g) => g.id === id);
    if (!existing || existing.status === status) return;
    const goal: Goal = { ...existing, status, updatedAt: this.clock.now().getTime() };
    this.set({ goals: this.state.goals.map((g) => (g.id === id ? goal : g)) });
    this.persist(() => this.storage.putGoal(goal));
  }

  deleteGoal(id: string): void {
    this.set({ goals: this.state.goals.filter((g) => g.id !== id) });
    this.persist(() => this.storage.removeGoal(id));
  }

  // ---- yedek: dışa aktar / geri yükle -----------------------------------------
  exportData(): Backup {
    return {
      app: 'kaizen',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.clock.now().toISOString(),
      habits: this.state.habits,
      logs: Object.values(this.state.logs),
      settings: this.state.settings,
      pomodoro: this.state.pomodoro,
      pomoSessions: this.state.pomoSessions,
      journal: this.state.journal,
      ratings: Object.values(this.state.ratings),
      agenda: this.state.agenda,
      goals: this.state.goals,
    };
  }

  /**
   * Geçerli TÜM veriyi verilen yedeğin içeriğiyle değiştirir. Çağıran taraf
   * (`parseBackup` ile) dosyayı önceden doğrulamış ve kullanıcıya onaylatmış
   * olmalıdır — burada geri dönüş yoktur. Canlı Pomodoro sayacı geri
   * yüklenmez (temiz/idle başlar): geçmişte kalmış bir sayaç durumunun bu anda
   * tamamlanmış gibi görünüp sahte bir kayıt üretmesini engeller.
   */
  async restoreBackup(data: Backup): Promise<void> {
    const habits = data.habits.filter(validHabit).sort((a, b) => a.order - b.order);
    const logs: LogMap = {};
    for (const l of data.logs) logs[l.key] = l;
    const journal = data.journal.filter(validJournalEntry);
    const ratings: Record<DateKey, DayRating> = {};
    for (const r of data.ratings.filter(validRating)) ratings[r.date] = r;
    const agenda = data.agenda.filter(validAgendaItem).map(normalizeAgendaItem);
    const goals = data.goals.filter(validGoal);
    const settings = mergeSettings(data.settings);
    const pomodoro = pomo.initialPomo(settings.pomodoro);
    const pomoSessions = data.pomoSessions;

    await this.flush(); // bekleyen eski yazmalar bitsin, sonra hepsini tek işlemde değiştir
    const snapshot: FullSnapshot = {
      habits,
      logs: Object.values(logs),
      pomoSessions,
      journal,
      ratings: Object.values(ratings),
      agenda,
      goals,
      meta: { settings, pomodoro, schemaVersion: SCHEMA_VERSION },
    };
    await this.storage.replaceAll(snapshot);
    this.state = { ...this.state, habits, logs, settings, pomodoro, pomoSessions, journal, ratings, agenda, goals, persistError: null };
    this.listeners.forEach((l) => l());
  }
}
