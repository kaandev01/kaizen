import type { Category, CategoryBudget } from '../core/categories';
import type { PomoSession } from '../core/pomodoro';
import type { Routine } from '../core/routines';
import type { AgendaItem, DayLog, DayRating, Goal, Habit, JournalEntry } from '../core/types';
import type { OutboxEntry } from '../sync/types';

export interface Snapshot {
  habits: Habit[];
  logs: DayLog[];
  pomoSessions: PomoSession[];
  journal: JournalEntry[];
  ratings: DayRating[];
  agenda: AgendaItem[];
  goals: Goal[];
  categories: Category[];
  categoryBudgets: CategoryBudget[];
  routines: Routine[];
  meta: Record<string, unknown>;
}

/** `replaceAll` için: mevcut tüm verinin yerine geçecek tam anlık görüntü. */
export interface FullSnapshot extends Snapshot {
  meta: Record<string, unknown>;
}

/** Kalıcı depolama arayüzü. Test için bellek, üretimde IndexedDB kullanılır. */
export interface Storage {
  readonly kind: 'indexeddb' | 'memory';
  load(): Promise<Snapshot>;
  putHabit(habit: Habit): Promise<void>;
  /** Alışkanlığı ve ona ait tüm günlük kayıtları siler. */
  removeHabit(id: string): Promise<void>;
  putLog(log: DayLog): Promise<void>;
  removeLog(key: string): Promise<void>;
  putMeta(key: string, value: unknown): Promise<void>;
  /** Tek bir meta değerini okur (ör. senkron pull-cursor'ı) — tüm anlık görüntüyü yüklemeden. */
  getMeta<T = unknown>(key: string): Promise<T | undefined>;
  putPomoSession(session: PomoSession): Promise<void>;
  putJournalEntry(entry: JournalEntry): Promise<void>;
  removeJournalEntry(id: string): Promise<void>;
  putRating(rating: DayRating): Promise<void>;
  removeRating(date: string): Promise<void>;
  putAgendaItem(item: AgendaItem): Promise<void>;
  removeAgendaItem(id: string): Promise<void>;
  putGoal(goal: Goal): Promise<void>;
  removeGoal(id: string): Promise<void>;
  putCategory(category: Category): Promise<void>;
  removeCategory(id: string): Promise<void>;
  putCategoryBudget(budget: CategoryBudget): Promise<void>;
  removeCategoryBudget(categoryId: string): Promise<void>;
  putRoutine(routine: Routine): Promise<void>;
  removeRoutine(id: string): Promise<void>;
  /** Tüm verinin yerini alır (yedek geri yükleme); tek işlemde, ya hep ya hiç. */
  replaceAll(snapshot: FullSnapshot): Promise<void>;

  // ---- senkron giden kuyruğu (outbox) -------------------------------------
  /** Oturum açıkken üretilen her değişiklik buraya yazılır (bkz. sync/engine.ts). */
  putOutboxEntry(entry: OutboxEntry): Promise<void>;
  removeOutboxEntry(opId: string): Promise<void>;
  listOutboxEntries(): Promise<OutboxEntry[]>;
}

export class MemoryStorage implements Storage {
  readonly kind = 'memory' as const;
  private habits = new Map<string, Habit>();
  private logs = new Map<string, DayLog>();
  private pomoSessions = new Map<string, PomoSession>();
  private journal = new Map<string, JournalEntry>();
  private ratings = new Map<string, DayRating>();
  private agenda = new Map<string, AgendaItem>();
  private goals = new Map<string, Goal>();
  private categories = new Map<string, Category>();
  private categoryBudgets = new Map<string, CategoryBudget>();
  private routines = new Map<string, Routine>();
  private meta = new Map<string, unknown>();
  private outbox = new Map<string, OutboxEntry>();

  async load(): Promise<Snapshot> {
    return {
      habits: structuredClone([...this.habits.values()]),
      logs: structuredClone([...this.logs.values()]),
      pomoSessions: structuredClone([...this.pomoSessions.values()]),
      journal: structuredClone([...this.journal.values()]),
      ratings: structuredClone([...this.ratings.values()]),
      agenda: structuredClone([...this.agenda.values()]),
      goals: structuredClone([...this.goals.values()]),
      categories: structuredClone([...this.categories.values()]),
      categoryBudgets: structuredClone([...this.categoryBudgets.values()]),
      routines: structuredClone([...this.routines.values()]),
      meta: structuredClone(Object.fromEntries(this.meta)),
    };
  }
  async putHabit(h: Habit) {
    this.habits.set(h.id, structuredClone(h));
  }
  async removeHabit(id: string) {
    this.habits.delete(id);
    for (const [k, l] of this.logs) if (l.habitId === id) this.logs.delete(k);
  }
  async putLog(l: DayLog) {
    this.logs.set(l.key, structuredClone(l));
  }
  async removeLog(key: string) {
    this.logs.delete(key);
  }
  async putMeta(key: string, value: unknown) {
    this.meta.set(key, structuredClone(value));
  }
  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    return this.meta.has(key) ? (structuredClone(this.meta.get(key)) as T) : undefined;
  }
  async putPomoSession(s: PomoSession) {
    this.pomoSessions.set(s.id, structuredClone(s));
  }
  async putJournalEntry(e: JournalEntry) {
    this.journal.set(e.id, structuredClone(e));
  }
  async removeJournalEntry(id: string) {
    this.journal.delete(id);
  }
  async putRating(r: DayRating) {
    this.ratings.set(r.date, structuredClone(r));
  }
  async removeRating(date: string) {
    this.ratings.delete(date);
  }
  async putAgendaItem(a: AgendaItem) {
    this.agenda.set(a.id, structuredClone(a));
  }
  async removeAgendaItem(id: string) {
    this.agenda.delete(id);
  }
  async putGoal(g: Goal) {
    this.goals.set(g.id, structuredClone(g));
  }
  async removeGoal(id: string) {
    this.goals.delete(id);
  }
  async putCategory(c: Category) {
    this.categories.set(c.id, structuredClone(c));
  }
  async removeCategory(id: string) {
    this.categories.delete(id);
  }
  async putCategoryBudget(b: CategoryBudget) {
    this.categoryBudgets.set(b.categoryId, structuredClone(b));
  }
  async removeCategoryBudget(categoryId: string) {
    this.categoryBudgets.delete(categoryId);
  }
  async putRoutine(r: Routine) {
    this.routines.set(r.id, structuredClone(r));
  }
  async removeRoutine(id: string) {
    this.routines.delete(id);
  }
  async replaceAll(snap: FullSnapshot) {
    this.habits = new Map(snap.habits.map((h) => [h.id, structuredClone(h)]));
    this.logs = new Map(snap.logs.map((l) => [l.key, structuredClone(l)]));
    this.pomoSessions = new Map(snap.pomoSessions.map((s) => [s.id, structuredClone(s)]));
    this.journal = new Map(snap.journal.map((e) => [e.id, structuredClone(e)]));
    this.ratings = new Map(snap.ratings.map((r) => [r.date, structuredClone(r)]));
    this.agenda = new Map(snap.agenda.map((a) => [a.id, structuredClone(a)]));
    this.goals = new Map(snap.goals.map((g) => [g.id, structuredClone(g)]));
    this.categories = new Map(snap.categories.map((c) => [c.id, structuredClone(c)]));
    this.categoryBudgets = new Map(snap.categoryBudgets.map((b) => [b.categoryId, structuredClone(b)]));
    this.routines = new Map(snap.routines.map((r) => [r.id, structuredClone(r)]));
    this.meta = new Map(Object.entries(structuredClone(snap.meta)));
  }

  async putOutboxEntry(entry: OutboxEntry) {
    this.outbox.set(entry.opId, structuredClone(entry));
  }
  async removeOutboxEntry(opId: string) {
    this.outbox.delete(opId);
  }
  async listOutboxEntries(): Promise<OutboxEntry[]> {
    return structuredClone([...this.outbox.values()]).sort((a, b) => a.createdAt - b.createdAt);
  }
}

/**
 * IndexedDB şema sürümü. v1: habits/logs/meta. v2: pomoSessions/journal/
 * ratings/agenda/goals depoları eklendi (bkz. store.ts'teki SCHEMA_VERSION
 * göçü — eski meta.pomoHistory buraya taşınır). v3: `outbox` deposu eklendi
 * (bulut senkronu için giden kuyruk) — geriye dönük veri göçü gerekmez, yalnızca
 * yeni boş bir store eklenir. v4: `categories` deposu eklendi (Pomodoro
 * kategorileri/klasör sistemi) — "Genel" kategorisi store.ts'teki init()
 * göçünde oluşturulur. v5: `categoryBudgets` deposu eklendi (haftalık zaman
 * bütçesi) — kategori başına en fazla bir kayıt, hiçbir göç gerekmez (yoksa
 * "hedef yok" sayılır). v6: `routines` deposu eklendi (alışkanlıklardan oluşan
 * sıralı rutinler) — aktif çalıştırma durumu ayrı bir store DEĞİL, `meta`
 * altında (`routineRun` anahtarıyla) saklanır, çünkü Pomodoro'nun canlı sayaç
 * durumu gibi yalnızca yerel/geçicidir.
 */
const DB_VERSION = 6;
const STORES = ['habits', 'logs', 'pomoSessions', 'journal', 'ratings', 'agenda', 'goals', 'categories', 'categoryBudgets', 'routines', 'meta', 'outbox'] as const;
/** `replaceAll` bu depoları TEMİZLEMEZ — outbox'ı bir yedek geri yükleme silmemeli (bekleyen senkron kaybolmasın). */
const REPLACE_ALL_STORES = STORES.filter((s) => s !== 'outbox');

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('İşlem iptal edildi'));
  });

export class IndexedDbStorage implements Storage {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static open(name = 'kaizen', factory: IDBFactory = indexedDB): Promise<IndexedDbStorage> {
    return new Promise((resolve, reject) => {
      const open = factory.open(name, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        // İleride şema değişirse: event.oldVersion'a göre yeni store/index ekleyin.
        if (!db.objectStoreNames.contains('habits')) db.createObjectStore('habits', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('logs')) {
          db.createObjectStore('logs', { keyPath: 'key' }).createIndex('habitId', 'habitId');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('pomoSessions')) db.createObjectStore('pomoSessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('journal')) db.createObjectStore('journal', { keyPath: 'id' }).createIndex('date', 'date');
        if (!db.objectStoreNames.contains('ratings')) db.createObjectStore('ratings', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('agenda')) db.createObjectStore('agenda', { keyPath: 'id' }).createIndex('date', 'date');
        if (!db.objectStoreNames.contains('goals')) db.createObjectStore('goals', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categoryBudgets')) db.createObjectStore('categoryBudgets', { keyPath: 'categoryId' });
        if (!db.objectStoreNames.contains('routines')) db.createObjectStore('routines', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'opId' });
      };
      open.onsuccess = () => resolve(new IndexedDbStorage(open.result));
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('Veritabanı başka bir sekme tarafından kilitli'));
    });
  }

  close() {
    this.db.close();
  }

  async load(): Promise<Snapshot> {
    const tx = this.db.transaction(['habits', 'logs', 'pomoSessions', 'journal', 'ratings', 'agenda', 'goals', 'categories', 'categoryBudgets', 'routines', 'meta'], 'readonly');
    const [habits, logs, pomoSessions, journal, ratings, agenda, goals, categories, categoryBudgets, routines, metaRows] = await Promise.all([
      req(tx.objectStore('habits').getAll() as IDBRequest<Habit[]>),
      req(tx.objectStore('logs').getAll() as IDBRequest<DayLog[]>),
      req(tx.objectStore('pomoSessions').getAll() as IDBRequest<PomoSession[]>),
      req(tx.objectStore('journal').getAll() as IDBRequest<JournalEntry[]>),
      req(tx.objectStore('ratings').getAll() as IDBRequest<DayRating[]>),
      req(tx.objectStore('agenda').getAll() as IDBRequest<AgendaItem[]>),
      req(tx.objectStore('goals').getAll() as IDBRequest<Goal[]>),
      req(tx.objectStore('categories').getAll() as IDBRequest<Category[]>),
      req(tx.objectStore('categoryBudgets').getAll() as IDBRequest<CategoryBudget[]>),
      req(tx.objectStore('routines').getAll() as IDBRequest<Routine[]>),
      req(tx.objectStore('meta').getAll() as IDBRequest<{ key: string; value: unknown }[]>),
    ]);
    return { habits, logs, pomoSessions, journal, ratings, agenda, goals, categories, categoryBudgets, routines, meta: Object.fromEntries(metaRows.map((r) => [r.key, r.value])) };
  }

  async putHabit(h: Habit) {
    const tx = this.db.transaction('habits', 'readwrite');
    tx.objectStore('habits').put(h);
    await done(tx);
  }

  async removeHabit(id: string) {
    const tx = this.db.transaction(['habits', 'logs'], 'readwrite');
    tx.objectStore('habits').delete(id);
    const logs = tx.objectStore('logs');
    const cursorReq = logs.index('habitId').openKeyCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        logs.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    await done(tx);
  }

  async putLog(l: DayLog) {
    const tx = this.db.transaction('logs', 'readwrite');
    tx.objectStore('logs').put(l);
    await done(tx);
  }

  async removeLog(key: string) {
    const tx = this.db.transaction('logs', 'readwrite');
    tx.objectStore('logs').delete(key);
    await done(tx);
  }

  async putMeta(key: string, value: unknown) {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await done(tx);
  }

  async getMeta<T = unknown>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction('meta', 'readonly');
    const row = await req(tx.objectStore('meta').get(key) as IDBRequest<{ key: string; value: unknown } | undefined>);
    return row?.value as T | undefined;
  }

  async putPomoSession(s: PomoSession) {
    const tx = this.db.transaction('pomoSessions', 'readwrite');
    tx.objectStore('pomoSessions').put(s);
    await done(tx);
  }

  async putJournalEntry(e: JournalEntry) {
    const tx = this.db.transaction('journal', 'readwrite');
    tx.objectStore('journal').put(e);
    await done(tx);
  }
  async removeJournalEntry(id: string) {
    const tx = this.db.transaction('journal', 'readwrite');
    tx.objectStore('journal').delete(id);
    await done(tx);
  }

  async putRating(r: DayRating) {
    const tx = this.db.transaction('ratings', 'readwrite');
    tx.objectStore('ratings').put(r);
    await done(tx);
  }
  async removeRating(date: string) {
    const tx = this.db.transaction('ratings', 'readwrite');
    tx.objectStore('ratings').delete(date);
    await done(tx);
  }

  async putAgendaItem(a: AgendaItem) {
    const tx = this.db.transaction('agenda', 'readwrite');
    tx.objectStore('agenda').put(a);
    await done(tx);
  }
  async removeAgendaItem(id: string) {
    const tx = this.db.transaction('agenda', 'readwrite');
    tx.objectStore('agenda').delete(id);
    await done(tx);
  }

  async putGoal(g: Goal) {
    const tx = this.db.transaction('goals', 'readwrite');
    tx.objectStore('goals').put(g);
    await done(tx);
  }
  async removeGoal(id: string) {
    const tx = this.db.transaction('goals', 'readwrite');
    tx.objectStore('goals').delete(id);
    await done(tx);
  }

  async putCategory(c: Category) {
    const tx = this.db.transaction('categories', 'readwrite');
    tx.objectStore('categories').put(c);
    await done(tx);
  }
  async removeCategory(id: string) {
    const tx = this.db.transaction('categories', 'readwrite');
    tx.objectStore('categories').delete(id);
    await done(tx);
  }

  async putCategoryBudget(b: CategoryBudget) {
    const tx = this.db.transaction('categoryBudgets', 'readwrite');
    tx.objectStore('categoryBudgets').put(b);
    await done(tx);
  }
  async removeCategoryBudget(categoryId: string) {
    const tx = this.db.transaction('categoryBudgets', 'readwrite');
    tx.objectStore('categoryBudgets').delete(categoryId);
    await done(tx);
  }

  async putRoutine(r: Routine) {
    const tx = this.db.transaction('routines', 'readwrite');
    tx.objectStore('routines').put(r);
    await done(tx);
  }
  async removeRoutine(id: string) {
    const tx = this.db.transaction('routines', 'readwrite');
    tx.objectStore('routines').delete(id);
    await done(tx);
  }

  async putOutboxEntry(entry: OutboxEntry) {
    const tx = this.db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').put(entry);
    await done(tx);
  }
  async removeOutboxEntry(opId: string) {
    const tx = this.db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').delete(opId);
    await done(tx);
  }
  async listOutboxEntries(): Promise<OutboxEntry[]> {
    const tx = this.db.transaction('outbox', 'readonly');
    const entries = await req(tx.objectStore('outbox').getAll() as IDBRequest<OutboxEntry[]>);
    return entries.sort((a, b) => a.createdAt - b.createdAt);
  }

  async replaceAll(snap: FullSnapshot) {
    const tx = this.db.transaction(REPLACE_ALL_STORES, 'readwrite');
    for (const name of REPLACE_ALL_STORES) tx.objectStore(name).clear();
    for (const h of snap.habits) tx.objectStore('habits').put(h);
    for (const l of snap.logs) tx.objectStore('logs').put(l);
    for (const s of snap.pomoSessions) tx.objectStore('pomoSessions').put(s);
    for (const e of snap.journal) tx.objectStore('journal').put(e);
    for (const r of snap.ratings) tx.objectStore('ratings').put(r);
    for (const a of snap.agenda) tx.objectStore('agenda').put(a);
    for (const g of snap.goals) tx.objectStore('goals').put(g);
    for (const c of snap.categories) tx.objectStore('categories').put(c);
    for (const b of snap.categoryBudgets) tx.objectStore('categoryBudgets').put(b);
    for (const r of snap.routines) tx.objectStore('routines').put(r);
    for (const [key, value] of Object.entries(snap.meta)) tx.objectStore('meta').put({ key, value });
    await done(tx);
  }
}

/**
 * IndexedDB açılamazsa (ör. bazı gizli modlar) bellek deposuna düşer.
 * `name` verilirse o veritabanı açılır — giriş yapmış her kullanıcı kendi
 * `kaizen-${userId}` veritabanında saklanır ki çıkış/hesap değişiminde bir
 * kullanıcının yerel verisi diğerine hiç görünmesin (bkz. main.tsx).
 */
export async function openBestStorage(name?: string): Promise<{ storage: Storage; fallbackReason: string | null }> {
  try {
    const storage = await IndexedDbStorage.open(name);
    return { storage, fallbackReason: null };
  } catch (e) {
    return {
      storage: new MemoryStorage(),
      fallbackReason: e instanceof Error ? e.message : 'IndexedDB kullanılamıyor',
    };
  }
}
