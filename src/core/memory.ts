/**
 * "Hafıza" sorguları — gelecekteki AI analiz fazı için veri hazırlar.
 * Burada hiçbir yorum/özet üretilmez, yalnızca bir tarih aralığına düşen
 * kalıcı kayıtlar bir araya toplanır. Otomatik rapor üretimi veya zamanlayıcı
 * YOK; yalnızca "bu döneme ait veriler nedir" sorusunu kolaylaştırır.
 */
import { addDays, atLocalTime, type DateKey } from './dates';
import { goalTouchesRange } from './goals';
import { planFor, revisionFor } from './plan';
import type { PomoSession } from './pomodoro';
import type { DateRange } from './periods';
import { inRange } from './periods';
import type { AgendaItem, DayLog, DayRating, Goal, Habit, JournalEntry, Schedule } from './types';

export interface HabitDayRecord {
  habitId: string;
  date: DateKey;
  amount: number;
  /** O gün geçerli hedef/birim/tekrar planı — bugünkü ayarlarla yeniden yorumlanmaz. */
  target: number;
  unit: string;
  schedule: Schedule | null;
}

export interface PeriodSnapshot {
  range: DateRange;
  habitDays: HabitDayRecord[];
  pomoSessions: PomoSession[];
  journal: JournalEntry[];
  ratings: DayRating[];
  agenda: AgendaItem[];
  goals: Goal[];
}

export interface MemorySource {
  habits: Habit[];
  logs: DayLog[];
  pomoSessions: PomoSession[];
  journal: JournalEntry[];
  ratings: DayRating[];
  agenda: AgendaItem[];
  goals: Goal[];
}

function sessionOverlapsRange(s: PomoSession, startMs: number, endMs: number): boolean {
  return s.startedAt < endMs && s.endedAt > startMs;
}

export function snapshotForRange(src: MemorySource, range: DateRange): PeriodSnapshot {
  const rangeStartMs = atLocalTime(range.start, '00:00');
  const rangeEndMs = atLocalTime(addDays(range.end, 1), '00:00'); // dahil değil

  const habitDays: HabitDayRecord[] = src.logs
    .filter((l) => inRange(l.date, range))
    .map((l) => {
      const habit = src.habits.find((h) => h.id === l.habitId);
      const rev = habit ? revisionFor(habit, l.date) : undefined;
      const plan = habit ? planFor(habit, l.date) : null;
      return {
        habitId: l.habitId,
        date: l.date,
        amount: l.amount,
        target: plan?.target ?? rev?.target ?? 0,
        unit: plan?.unit ?? rev?.unit ?? '',
        schedule: rev?.schedule ?? null,
      };
    });

  return {
    range,
    habitDays,
    pomoSessions: src.pomoSessions.filter((s) => sessionOverlapsRange(s, rangeStartMs, rangeEndMs)),
    journal: src.journal.filter((e) => inRange(e.date, range)),
    ratings: src.ratings.filter((r) => inRange(r.date, range)),
    agenda: src.agenda.filter((a) => inRange(a.date, range)),
    goals: src.goals.filter((g) => goalTouchesRange(g, range)),
  };
}
