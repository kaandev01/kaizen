import { monthRange, rangesOverlap, yearRange, type DateRange } from './periods';
import type { Goal, GoalPeriod } from './types';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "Eylül 2026" ya da "2026". */
export function formatGoalPeriod(p: GoalPeriod): string {
  return p.kind === 'month' && p.month ? `${MONTHS[p.month - 1]} ${p.year}` : String(p.year);
}

export function goalPeriodRange(p: GoalPeriod): DateRange {
  return p.kind === 'month' && p.month ? monthRange(p.year, p.month) : yearRange(p.year);
}

export const samePeriod = (a: GoalPeriod, b: GoalPeriod): boolean => a.kind === b.kind && a.year === b.year && a.month === b.month;

/** Bir hedefin dönemi verilen tarih aralığıyla kesişiyor mu (hafıza sorguları için). */
export const goalTouchesRange = (goal: Goal, range: DateRange): boolean => rangesOverlap(goalPeriodRange(goal.period), range);

const STATUS_ORDER: Record<Goal['status'], number> = { active: 0, done: 1, abandoned: 2 };
export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.createdAt - a.createdAt);
}
