import { nextMidnight, toDateKey, type DateKey } from './dates';
import type { PomoSegment, PomoSession } from './pomodoro';

/**
 * Bir çalışma aralığını yerel gün sınırlarına göre parçalara böler. Gece
 * yarısını geçen bir aralığın aktif süresi ilgili günlere doğru şekilde
 * dağıtılsın diye kullanılır.
 */
export function splitByLocalDay(seg: PomoSegment): { date: DateKey; ms: number }[] {
  const out: { date: DateKey; ms: number }[] = [];
  let cursor = seg.start;
  while (cursor < seg.end) {
    const midnight = nextMidnight(new Date(cursor));
    const chunkEnd = Math.min(seg.end, midnight);
    out.push({ date: toDateKey(new Date(cursor)), ms: chunkEnd - cursor });
    cursor = chunkEnd;
  }
  return out;
}

export interface DayFocusStats {
  /** O gün BİTEN, tamamlanmış (tam süresi dolmuş) seans sayısı. */
  completedCount: number;
  /** O güne dağıtılan toplam gerçek aktif odaklanma süresi (tamamlanan + erken bitirilen). */
  activeMs: number;
}

/** Bir günün Pomodoro özeti: tamamlanan seans sayısı ve gerçek toplam odaklanma süresi. */
export function focusStatsForDay(sessions: PomoSession[], date: DateKey): DayFocusStats {
  let activeMs = 0;
  let completedCount = 0;
  for (const s of sessions) {
    for (const seg of s.segments) {
      for (const part of splitByLocalDay(seg)) {
        if (part.date === date) activeMs += part.ms;
      }
    }
    if (s.status === 'completed' && toDateKey(new Date(s.endedAt)) === date) completedCount++;
  }
  return { completedCount, activeMs };
}

/** O günü (kısmen de olsa) kapsayan seanslar, başlangıç saatine göre sıralı. */
export function sessionsTouchingDay(sessions: PomoSession[], date: DateKey): PomoSession[] {
  return sessions
    .filter((s) => s.segments.some((seg) => splitByLocalDay(seg).some((p) => p.date === date)))
    .sort((a, b) => a.startedAt - b.startedAt);
}
