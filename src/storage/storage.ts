import type { DayLog, Habit } from '../core/types';

export interface Snapshot {
  habits: Habit[];
  logs: DayLog[];
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
}

export class MemoryStorage implements Storage {
  readonly kind = 'memory' as const;
  private habits = new Map<string, Habit>();
  private logs = new Map<string, DayLog>();
  private meta = new Map<string, unknown>();

  async load(): Promise<Snapshot> {
    return {
      habits: structuredClone([...this.habits.values()]),
      logs: structuredClone([...this.logs.values()]),
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
}

const DB_VERSION = 1;

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
    const tx = this.db.transaction(['habits', 'logs', 'meta'], 'readonly');
    const [habits, logs, metaRows] = await Promise.all([
      req(tx.objectStore('habits').getAll() as IDBRequest<Habit[]>),
      req(tx.objectStore('logs').getAll() as IDBRequest<DayLog[]>),
      req(tx.objectStore('meta').getAll() as IDBRequest<{ key: string; value: unknown }[]>),
    ]);
    return { habits, logs, meta: Object.fromEntries(metaRows.map((r) => [r.key, r.value])) };
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
}

/** IndexedDB açılamazsa (ör. bazı gizli modlar) bellek deposuna düşer. */
export async function openBestStorage(): Promise<{ storage: Storage; fallbackReason: string | null }> {
  try {
    const storage = await IndexedDbStorage.open();
    return { storage, fallbackReason: null };
  } catch (e) {
    return {
      storage: new MemoryStorage(),
      fallbackReason: e instanceof Error ? e.message : 'IndexedDB kullanılamıyor',
    };
  }
}
