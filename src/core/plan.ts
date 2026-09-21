import { isoWeekday, type DateKey } from './dates';
import type { Habit, HabitRevision, Schedule } from './types';

export interface Plan {
  target: number;
  unit: string;
}

/** Verilen gün için geçerli sürüm (yoksa alışkanlık o gün yoktu). */
export function revisionFor(habit: Habit, date: DateKey): HabitRevision | undefined {
  let found: HabitRevision | undefined;
  for (const r of habit.revisions) {
    if (r.from <= date) found = r;
    else break;
  }
  return found;
}

export function scheduleIncludes(schedule: Schedule, date: DateKey): boolean {
  return schedule.kind === 'daily' || schedule.days.includes(isoWeekday(date));
}

/** O gün için plan; planlı değilse null. */
export function planFor(habit: Habit, date: DateKey): Plan | null {
  const rev = revisionFor(habit, date);
  if (!rev || !scheduleIncludes(rev.schedule, date)) return null;
  return { target: rev.target, unit: rev.unit };
}

export function currentRevision(habit: Habit): HabitRevision {
  return habit.revisions[habit.revisions.length - 1];
}

export function sameRevisionContent(a: HabitRevision, b: HabitRevision): boolean {
  if (a.target !== b.target || a.unit !== b.unit || a.schedule.kind !== b.schedule.kind) return false;
  if (a.schedule.kind === 'daily' || b.schedule.kind === 'daily') return true;
  return a.schedule.days.join(',') === b.schedule.days.join(',');
}

/**
 * Düzenleme: yeni sürüm `today`'den itibaren geçerli olur, geçmiş sürümlere
 * dokunulmaz. Aynı gün içinde tekrar düzenleme son sürümü değiştirir.
 */
export function withRevision(habit: Habit, next: Omit<HabitRevision, 'from'>, today: DateKey): HabitRevision[] {
  const revisions = habit.revisions.slice();
  const candidate: HabitRevision = { ...next, from: today };
  const last = revisions[revisions.length - 1];
  if (sameRevisionContent(last, candidate)) return revisions;
  if (last.from >= today) {
    // Aynı gün (veya saat geri alınmışsa): son sürümü güncelle.
    revisions[revisions.length - 1] = { ...candidate, from: last.from };
    if (revisions.length >= 2 && sameRevisionContent(revisions[revisions.length - 2], revisions[revisions.length - 1])) {
      revisions.pop();
    }
    return revisions;
  }
  revisions.push(candidate);
  return revisions;
}
