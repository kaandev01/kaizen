import type { DateKey } from './dates';
import { splitByLocalDay } from './pomoStats';
import type { PomoSession } from './pomodoro';

/**
 * Pomodoro seanslarını gruplamak için sınırsız derinlikte iç içe kategoriler
 * (klasör sistemi). Her seans TAM OLARAK bir kategoriye bağlıdır — hiçbir
 * seans "kategorisiz" kalmaz, kategori seçilmeden başlatılan seanslar
 * `GENERAL_CATEGORY_ID`'ye düşer (bkz. `core/pomodoro.ts` → `initialPomo`/`normalizePomoSession`).
 */
export interface Category {
  id: string;
  name: string;
  /** Kök kategori için null. */
  parentId: string | null;
  color: string;
  /** Aynı ebeveyn altında kararlı sıralama. */
  order: number;
  createdAt: number;
}

/** Yerleşik, silinemez/yeniden adlandırılamaz kök kategori — bkz. `src/storage/store.ts` → `init()`. */
export const GENERAL_CATEGORY_ID = 'general';

const byId = (categories: Category[]) => new Map(categories.map((c) => [c.id, c]));

/**
 * `id`'den köke doğru ata zinciri: `[id, ebeveyn, büyükebeveyn, ...]`. Bozuk/
 * döngüsel veriye karşı korumalı (en fazla kategori sayısı kadar adım atar).
 */
export function ancestorIds(categories: Category[], id: string): string[] {
  const map = byId(categories);
  const seen = new Set<string>();
  const out: string[] = [];
  let cur: string | undefined = id;
  while (cur && map.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = map.get(cur)?.parentId ?? undefined;
  }
  return out;
}

/** Belirli bir ebeveynin doğrudan alt kategorileri, sıraya göre. */
export function childrenOf(categories: Category[], parentId: string | null): Category[] {
  return categories.filter((c) => c.parentId === parentId).sort((a, b) => a.order - b.order);
}

/** Kök → yaprak sırasıyla tam yol (breadcrumb/görüntüleme için). Bozuk id'de boş dizi döner. */
export function categoryPath(categories: Category[], id: string): Category[] {
  const map = byId(categories);
  const chain = ancestorIds(categories, id);
  if (chain.length === 0 || !map.has(id)) return [];
  return chain
    .map((cid) => map.get(cid)!)
    .reverse();
}

/**
 * Bir günde kategori başına gerçek odaklanma süresi (ms) — ROLLUP: bir alt
 * kategoride geçen süre, tüm atalarına da eklenir (ör. "Atomic Habits"ta
 * geçen süre "Kitap"ın toplamına da yansır). Yalnızca o gün en az bir kaydı
 * olan kategoriler haritada yer alır.
 */
export function categoryStatsForDay(sessions: PomoSession[], categories: Category[], date: DateKey): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    let msToday = 0;
    for (const seg of s.segments) {
      for (const part of splitByLocalDay(seg)) {
        if (part.date === date) msToday += part.ms;
      }
    }
    if (msToday <= 0) continue;
    for (const ancestorId of ancestorIds(categories, s.categoryId)) {
      totals.set(ancestorId, (totals.get(ancestorId) ?? 0) + msToday);
    }
  }
  return totals;
}
