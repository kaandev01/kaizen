import type { DateKey } from './dates';
import type { DateRange } from './periods';
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
 * Bir tarih aralığında (dahil-dahil) kategori başına gerçek odaklanma süresi
 * (ms) — ROLLUP: bir alt kategoride geçen süre, tüm atalarına da eklenir (ör.
 * "Atomic Habits"ta geçen süre "Kitap"ın toplamına da yansır). Yalnızca
 * aralıkta en az bir kaydı olan kategoriler haritada yer alır.
 *
 * UYARI: bu haritanın değerlerini toplayarak "genel toplam" hesaplama — iç
 * içe kategorilerde bir seans birden fazla atanın toplamına yansıdığından
 * çift sayılır. Genel toplam gerekiyorsa seanslar üzerinden kategoriden
 * bağımsız doğrudan toplanmalı.
 */
export function categoryStatsForRange(sessions: PomoSession[], categories: Category[], range: DateRange): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    let msInRange = 0;
    for (const seg of s.segments) {
      for (const part of splitByLocalDay(seg)) {
        if (part.date >= range.start && part.date <= range.end) msInRange += part.ms;
      }
    }
    if (msInRange <= 0) continue;
    for (const ancestorId of ancestorIds(categories, s.categoryId)) {
      totals.set(ancestorId, (totals.get(ancestorId) ?? 0) + msInRange);
    }
  }
  return totals;
}

/** Bir günde kategori başına gerçek odaklanma süresi (ms) — bkz. `categoryStatsForRange`. */
export function categoryStatsForDay(sessions: PomoSession[], categories: Category[], date: DateKey): Map<string, number> {
  return categoryStatsForRange(sessions, categories, { start: date, end: date });
}

/**
 * Bir kategorinin haftalık zaman bütçesi. Hedef, `Habit.revisions` ile aynı
 * versiyonlama ilkesiyle haftalara göre sürümlenir: `from` her zaman bir
 * Pazartesi (bkz. `periods.ts` → `weekRange`). Hiç düzenlenmeyen gelecek
 * haftalar otomatik olarak son revizyonu miras alır (bkz. `budgetRevisionFor`)
 * — "sonraki haftalara taşınma" için ayrıca kod gerekmez.
 */
export interface CategoryBudgetRevision {
  /** Bu revizyonun geçerli olduğu haftanın Pazartesi'si. */
  from: DateKey;
  /** null = bu haftadan itibaren hedef yok (kaldırıldı) — geçmiş revizyonlar silinmez. */
  targetMs: number | null;
}
export interface CategoryBudget {
  /** Birincil anahtar — kategori başına en fazla bir bütçe kaydı. */
  categoryId: string;
  /** `from`'a göre artan sıralı. */
  revisions: CategoryBudgetRevision[];
  updatedAt: number;
}

/** Verilen haftanın Pazartesi'si için geçerli revizyon (`from <= weekStart` olan son revizyon). */
export function budgetRevisionFor(budget: CategoryBudget | undefined, weekStart: DateKey): CategoryBudgetRevision | undefined {
  if (!budget) return undefined;
  let found: CategoryBudgetRevision | undefined;
  for (const r of budget.revisions) {
    if (r.from <= weekStart) found = r;
    else break;
  }
  return found;
}
