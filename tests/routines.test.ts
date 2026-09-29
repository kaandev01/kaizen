import { describe, expect, it } from 'vitest';
import { hasDuplicateHabit, routineSummary, stepsPlannedToday, type Routine, type RoutineRunState } from '../src/core/routines';
import type { Habit } from '../src/core/types';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Su iç',
  icon: '',
  color: '#000',
  reminders: [],
  revisions: [{ from: '2026-01-01', target: 2, unit: 'bardak', schedule: { kind: 'daily' } }],
  createdAt: '2026-01-01',
  order: 0,
  linkedCategoryId: null,
  ...over,
});

describe('hasDuplicateHabit', () => {
  it('aynı habitId iki kez geçerse true döner', () => {
    expect(hasDuplicateHabit([{ habitId: 'a' }, { habitId: 'b' }, { habitId: 'a' }])).toBe(true);
  });
  it('tekil habitId listesinde false döner', () => {
    expect(hasDuplicateHabit([{ habitId: 'a' }, { habitId: 'b' }])).toBe(false);
  });
  it('boş listede false döner', () => {
    expect(hasDuplicateHabit([])).toBe(false);
  });
});

describe('stepsPlannedToday', () => {
  const routine: Routine = {
    id: 'r1',
    name: 'Sabah',
    steps: [
      { id: 's1', habitId: 'daily', amount: 1 },
      { id: 's2', habitId: 'weekdays-only', amount: 1 },
      { id: 's3', habitId: 'silinmis', amount: 1 },
    ],
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  const habits: Habit[] = [
    habit({ id: 'daily', revisions: [{ from: '2026-01-01', target: 1, unit: 'kez', schedule: { kind: 'daily' } }] }),
    // 2026-09-29 Salı (isoWeekday=2); yalnızca Pazartesi (1) planlı.
    habit({ id: 'weekdays-only', revisions: [{ from: '2026-01-01', target: 1, unit: 'kez', schedule: { kind: 'weekdays', days: [1] } }] }),
    // 'silinmis' habitId'si habits listesinde YOK (silinmiş alışkanlık senaryosu).
  ];

  it('bugün planlı olmayan adımları filtreler', () => {
    const steps = stepsPlannedToday(routine, habits, '2026-09-29');
    expect(steps.map((s) => s.id)).toEqual(['s1']); // yalnızca 'daily' bugün planlı
  });

  it('silinmiş alışkanlığa ait adım rutini bozmaz, yalnızca dışarıda bırakılır', () => {
    const steps = stepsPlannedToday(routine, habits, '2026-09-29');
    expect(steps.some((s) => s.habitId === 'silinmis')).toBe(false);
  });

  it('haftanın doğru gününde weekdays adımı da dahil olur', () => {
    // 2026-09-28 Pazartesi (isoWeekday=1).
    const steps = stepsPlannedToday(routine, habits, '2026-09-28');
    expect(steps.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });
});

describe('routineSummary', () => {
  it('yalnızca "completed" işlemleri sayar, "skipped" sayılmaz', () => {
    const run: RoutineRunState = {
      runId: 'run1',
      routineId: 'r1',
      date: '2026-09-29',
      stepOrder: ['s1', 's2', 's3'],
      currentIndex: 2,
      actions: [
        { stepId: 's1', habitId: 'h1', date: '2026-09-29', kind: 'completed', appliedDelta: 1 },
        { stepId: 's2', habitId: 'h2', date: '2026-09-29', kind: 'skipped', appliedDelta: 0 },
      ],
    };
    expect(routineSummary(run)).toEqual({ total: 3, completed: 1 });
  });
});
