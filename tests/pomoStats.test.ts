import { describe, expect, it } from 'vitest';
import type { PomoSession } from '../src/core/pomodoro';
import { focusStatsForDay, sessionsTouchingDay, splitByLocalDay } from '../src/core/pomoStats';
import { formatDuration, formatFocusSummary } from '../src/core/format';

const at = (y: number, m: number, d: number, h: number, mi = 0) => new Date(y, m - 1, d, h, mi, 0, 0).getTime();

describe('splitByLocalDay: gece yarısını geçen aralığın dağıtımı', () => {
  it('gece yarısını geçmeyen aralık tek parça döner', () => {
    const parts = splitByLocalDay({ start: at(2026, 9, 21, 22, 0), end: at(2026, 9, 21, 23, 0) });
    expect(parts).toEqual([{ date: '2026-09-21', ms: 60 * 60_000 }]);
  });

  it('gece yarısını geçen aralık iki güne doğru oranda dağıtılır', () => {
    const parts = splitByLocalDay({ start: at(2026, 9, 21, 23, 50), end: at(2026, 9, 22, 0, 15) });
    expect(parts).toEqual([
      { date: '2026-09-21', ms: 10 * 60_000 },
      { date: '2026-09-22', ms: 15 * 60_000 },
    ]);
  });

  it('birden fazla gece yarısını geçen (uzun) aralık üç güne dağılır', () => {
    const parts = splitByLocalDay({ start: at(2026, 9, 20, 23, 30), end: at(2026, 9, 22, 0, 10) });
    expect(parts).toEqual([
      { date: '2026-09-20', ms: 30 * 60_000 },
      { date: '2026-09-21', ms: 24 * 60 * 60_000 },
      { date: '2026-09-22', ms: 10 * 60_000 },
    ]);
  });
});

function session(over: Partial<PomoSession>): PomoSession {
  return { id: 'x', plannedMs: 25 * 60_000, startedAt: 0, endedAt: 0, activeMs: 0, segments: [], status: 'completed', ...over };
}

describe('focusStatsForDay / sessionsTouchingDay', () => {
  it('gece yarısını geçen tamamlanan seansın süresi iki güne dağılır; tamamlanma BİTTİĞİ güne yazılır', () => {
    const seg = { start: at(2026, 9, 21, 23, 50), end: at(2026, 9, 22, 0, 15) };
    const s = session({ id: 's1', segments: [seg], activeMs: 25 * 60_000, endedAt: seg.end, status: 'completed' });

    const day1 = focusStatsForDay([s], '2026-09-21');
    expect(day1).toEqual({ completedCount: 0, activeMs: 10 * 60_000 }); // bu gün henüz "bitmedi"
    const day2 = focusStatsForDay([s], '2026-09-22');
    expect(day2).toEqual({ completedCount: 1, activeMs: 15 * 60_000 }); // seans bu gün bitti
  });

  it('erken bitirilen (stopped) seansın çalışılmış süresi de güne yazılır ama tamamlanan sayısına eklenmez', () => {
    const seg = { start: at(2026, 9, 21, 9, 0), end: at(2026, 9, 21, 9, 8) };
    const s = session({ id: 's2', segments: [seg], activeMs: 8 * 60_000, endedAt: seg.end, status: 'stopped' });
    expect(focusStatsForDay([s], '2026-09-21')).toEqual({ completedCount: 0, activeMs: 8 * 60_000 });
  });

  it('birden fazla seans doğru toplanır: "4 Pomodoro · 1 saat 40 dakika" örneği', () => {
    const sessions: PomoSession[] = Array.from({ length: 4 }, (_, i) => {
      const seg = { start: at(2026, 9, 21, 9 + i, 0), end: at(2026, 9, 21, 9 + i, 25) };
      return session({ id: `f${i}`, segments: [seg], activeMs: 25 * 60_000, endedAt: seg.end, status: 'completed' });
    });
    const stats = focusStatsForDay(sessions, '2026-09-21');
    expect(stats).toEqual({ completedCount: 4, activeMs: 100 * 60_000 });
    expect(formatFocusSummary(stats.completedCount, stats.activeMs)).toBe('4 Pomodoro · 1 saat 40 dakika');
  });

  it('başka güne ait seans sayılmaz', () => {
    const seg = { start: at(2026, 9, 20, 9, 0), end: at(2026, 9, 20, 9, 25) };
    const s = session({ segments: [seg], activeMs: 25 * 60_000, endedAt: seg.end });
    expect(focusStatsForDay([s], '2026-09-21')).toEqual({ completedCount: 0, activeMs: 0 });
  });

  it('sessionsTouchingDay başlangıç saatine göre sıralı listeler', () => {
    const s1 = session({ id: 'a', startedAt: at(2026, 9, 21, 14, 0), segments: [{ start: at(2026, 9, 21, 14, 0), end: at(2026, 9, 21, 14, 25) }], endedAt: at(2026, 9, 21, 14, 25) });
    const s2 = session({ id: 'b', startedAt: at(2026, 9, 21, 9, 0), segments: [{ start: at(2026, 9, 21, 9, 0), end: at(2026, 9, 21, 9, 25) }], endedAt: at(2026, 9, 21, 9, 25) });
    expect(sessionsTouchingDay([s1, s2], '2026-09-21').map((s) => s.id)).toEqual(['b', 'a']);
    expect(sessionsTouchingDay([s1, s2], '2026-09-22')).toEqual([]);
  });
});

describe('formatDuration', () => {
  it('saat/dakika birleşimini Türkçe biçimlendirir', () => {
    expect(formatDuration(0)).toBe('0 dakika');
    expect(formatDuration(45 * 60_000)).toBe('45 dakika');
    expect(formatDuration(60 * 60_000)).toBe('1 saat');
    expect(formatDuration(100 * 60_000)).toBe('1 saat 40 dakika');
  });
});
