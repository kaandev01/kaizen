import type { DateKey } from './dates';
import { planFor } from './plan';
import { logKey, type DayLog, type Habit } from './types';

export type LogMap = Record<string, DayLog>;

export const amountOf = (logs: LogMap, habitId: string, date: DateKey): number =>
  logs[logKey(habitId, date)]?.amount ?? 0;

export interface HabitDay {
  habit: Habit;
  target: number;
  unit: string;
  amount: number;
  /** min(mevcut / hedef, 1) */
  ratio: number;
  done: boolean;
}

/** Bir günün planlı alışkanlıkları (kayıt sırasıyla) ve ilerlemeleri. */
export function habitsForDay(habits: Habit[], logs: LogMap, date: DateKey): HabitDay[] {
  const rows: HabitDay[] = [];
  for (const habit of habits) {
    const plan = planFor(habit, date);
    if (!plan) continue;
    const amount = amountOf(logs, habit.id, date);
    rows.push({
      habit,
      target: plan.target,
      unit: plan.unit,
      amount,
      ratio: Math.min(amount / plan.target, 1),
      done: amount >= plan.target,
    });
  }
  return rows.sort((a, b) => a.habit.order - b.habit.order);
}

export interface DaySummary {
  planned: number;
  completed: number;
  /** Ortalama katkı 0..1; planlı alışkanlık yoksa null (asla %100 değil). */
  ratio: number | null;
}

export function summarize(rows: HabitDay[]): DaySummary {
  if (rows.length === 0) return { planned: 0, completed: 0, ratio: null };
  const sum = rows.reduce((s, r) => s + r.ratio, 0);
  return { planned: rows.length, completed: rows.filter((r) => r.done).length, ratio: sum / rows.length };
}
