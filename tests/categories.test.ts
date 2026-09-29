import { describe, expect, it } from 'vitest';
import { ancestorIds, categoryPath, categoryStatsForDay, categoryStatsForRange, childrenOf, GENERAL_CATEGORY_ID, type Category } from '../src/core/categories';
import { weekRange } from '../src/core/periods';
import type { PomoSession } from '../src/core/pomodoro';

const cat = (id: string, parentId: string | null, name = id): Category => ({ id, parentId, name, color: '#000', order: 0, createdAt: 0 });

// Kitap (kök) → Atomic Habits (alt) → Bölüm Notları (alt-alt)
const tree: Category[] = [
  cat(GENERAL_CATEGORY_ID, null, 'Genel'),
  cat('kitap', null, 'Kitap'),
  cat('atomic-habits', 'kitap', 'Atomic Habits'),
  cat('bolum-notlari', 'atomic-habits', 'Bölüm Notları'),
  cat('net', null, '.NET'),
];

describe('ancestorIds', () => {
  it('kökten yaprağa değil, yapraktan köke doğru zinciri döner', () => {
    expect(ancestorIds(tree, 'bolum-notlari')).toEqual(['bolum-notlari', 'atomic-habits', 'kitap']);
  });
  it('kök kategori için yalnızca kendisini döner', () => {
    expect(ancestorIds(tree, 'net')).toEqual(['net']);
  });
  it('bilinmeyen bir id için boş dizi döner', () => {
    expect(ancestorIds(tree, 'yok-boyle-bir-sey')).toEqual([]);
  });
  it('döngüsel/bozuk veriye karşı sonsuz döngüye girmez', () => {
    const cyclic: Category[] = [cat('a', 'b'), cat('b', 'a')];
    expect(ancestorIds(cyclic, 'a')).toEqual(['a', 'b']); // 'a' tekrar görülünce durur
  });
});

describe('childrenOf', () => {
  it('yalnızca doğrudan alt kategorileri döner', () => {
    expect(childrenOf(tree, 'kitap').map((c) => c.id)).toEqual(['atomic-habits']);
    expect(childrenOf(tree, null).map((c) => c.id).sort()).toEqual([GENERAL_CATEGORY_ID, 'kitap', 'net'].sort());
  });
});

describe('categoryPath', () => {
  it('kök → yaprak sırasıyla tam yolu döner', () => {
    expect(categoryPath(tree, 'bolum-notlari').map((c) => c.name)).toEqual(['Kitap', 'Atomic Habits', 'Bölüm Notları']);
  });
});

function session(categoryId: string, startMs: number, ms: number): PomoSession {
  return {
    id: `s-${categoryId}-${startMs}`,
    plannedMs: ms,
    startedAt: startMs,
    endedAt: startMs + ms,
    activeMs: ms,
    segments: [{ start: startMs, end: startMs + ms }],
    status: 'completed',
    rating: null,
    note: '',
    categoryId,
  };
}

describe('categoryStatsForDay — rollup', () => {
  const day = new Date(2026, 8, 29, 10, 0).getTime(); // 2026-09-29, gece yarısını geçmeyen basit bir gün

  it('bir alt kategoride geçen süre, TÜM atalarına da (rollup) yansır', () => {
    const sessions = [session('bolum-notlari', day, 10 * 60_000)];
    const stats = categoryStatsForDay(sessions, tree, '2026-09-29');
    expect(stats.get('bolum-notlari')).toBe(10 * 60_000);
    expect(stats.get('atomic-habits')).toBe(10 * 60_000); // ebeveyn
    expect(stats.get('kitap')).toBe(10 * 60_000); // büyük ebeveyn
    expect(stats.has('net')).toBe(false); // ilgisiz kategori hiç görünmez
  });

  it('aynı üst kategorinin farklı alt kategorilerindeki süreler toplanır', () => {
    const sessions = [session('atomic-habits', day, 5 * 60_000), session('bolum-notlari', day + 60_000, 8 * 60_000)];
    const stats = categoryStatsForDay(sessions, tree, '2026-09-29');
    expect(stats.get('kitap')).toBe(13 * 60_000); // 5 + 8, ikisi de Kitap'ın altında
    expect(stats.get('atomic-habits')).toBe(13 * 60_000); // bolum-notlari da onun altında
    expect(stats.get('bolum-notlari')).toBe(8 * 60_000); // yalnızca doğrudan kendisi
  });

  it('o güne hiç düşmeyen bir seans haritada hiç görünmez', () => {
    const farAway = new Date(2020, 0, 1).getTime();
    const stats = categoryStatsForDay([session('net', farAway, 10 * 60_000)], tree, '2026-09-29');
    expect(stats.size).toBe(0);
  });
});

describe('categoryStatsForRange — hafta sınırı', () => {
  it('bir hafta içindeki farklı günlerdeki seanslar toplanır; hafta dışındaki günler hariç tutulur', () => {
    // 2026-09-29 Salı; o haftanın Pazartesi'si 2026-09-28, Pazar'ı 2026-10-04.
    const week = weekRange('2026-09-29');
    expect(week).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    const mon = new Date(2026, 8, 28, 9, 0).getTime();
    const sun = new Date(2026, 9, 4, 18, 0).getTime();
    const prevSun = new Date(2026, 8, 27, 20, 0).getTime(); // önceki hafta, gece yarısını geçmez — dahil edilmemeli
    const sessions = [session('net', mon, 30 * 60_000), session('net', sun, 20 * 60_000), session('net', prevSun, 30 * 60_000)];
    const stats = categoryStatsForRange(sessions, tree, week);
    expect(stats.get('net')).toBe(50 * 60_000); // yalnızca Pazartesi + Pazar, önceki haftanınki hariç
  });

  it('gece yarısını geçen bir seans doğru günlere (ve dolayısıyla doğru haftaya) dağıtılır', () => {
    const week = weekRange('2026-09-29');
    // Pazar 23:50 → Pazartesi 00:10 (bir sonraki haftanın ilk günü) — 20 dk bu haftada, 10 dk gelecek haftada.
    const crossing = new Date(2026, 9, 4, 23, 50).getTime();
    const stats = categoryStatsForRange([session('net', crossing, 20 * 60_000)], tree, week);
    expect(stats.get('net')).toBe(10 * 60_000); // yalnızca bu haftaya (Pazar 23:50-24:00) düşen kısım
  });

  it('rollup: haritanın değerlerini toplamak çift sayar — genel toplam ayrı hesaplanmalı', () => {
    const week = weekRange('2026-09-29');
    const mon = new Date(2026, 8, 28, 9, 0).getTime();
    const stats = categoryStatsForRange([session('bolum-notlari', mon, 10 * 60_000)], tree, week);
    // "bolum-notlari" + "atomic-habits" + "kitap" üçü de 10dk taşır — haritanın TÜM değerlerini
    // toplamak 30dk verir ama gerçek toplam odaklanma süresi yalnızca 10dk'dır.
    const sumOfMapValues = [...stats.values()].reduce((a, b) => a + b, 0);
    expect(sumOfMapValues).toBe(30 * 60_000);
    expect(stats.get('bolum-notlari')).toBe(10 * 60_000);
  });
});
