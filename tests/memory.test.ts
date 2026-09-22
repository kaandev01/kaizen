import { describe, expect, it } from 'vitest';
import { snapshotForRange } from '../src/core/memory';
import { monthRange } from '../src/core/periods';
import type { AgendaItem, DayLog, DayRating, Goal, Habit, JournalEntry } from '../src/core/types';

const habit: Habit = {
  id: 'h1',
  name: 'Su iç',
  icon: 'droplet',
  color: '#000',
  reminders: [],
  revisions: [{ from: '2026-01-01', target: 8, unit: 'bardak', schedule: { kind: 'daily' } }],
  createdAt: '2026-01-01',
  order: 0,
};
const log = (date: string, amount: number): DayLog => ({ key: `h1|${date}`, habitId: 'h1', date, amount, updatedAt: 0 });
const entry = (date: string): JournalEntry => ({ id: date, date, text: 'x', source: 'typed', createdAt: 0, updatedAt: 0 });
const rating = (date: string, score: number): DayRating => ({ date, score, updatedAt: 0 });
const agendaItem = (date: string): AgendaItem => ({
  id: date,
  title: 'x',
  kind: 'other',
  date,
  time: null,
  description: '',
  reminder: null,
  done: false,
  createdAt: 0,
  updatedAt: 0,
});
const goal = (period: Goal['period']): Goal => ({ id: 'g', title: 'x', description: '', period, status: 'active', createdAt: 0, updatedAt: 0 });

describe('snapshotForRange', () => {
  const range = monthRange(2026, 9); // 2026-09-01..2026-09-30

  it('yalnızca aralığa düşen kayıtları toplar; sınırın dışındakileri dışarıda bırakır', () => {
    const src = {
      habits: [habit],
      logs: [log('2026-08-31', 5), log('2026-09-01', 8), log('2026-09-30', 3), log('2026-10-01', 1)],
      pomoSessions: [],
      journal: [entry('2026-08-31'), entry('2026-09-15')],
      ratings: [rating('2026-09-15', 7), rating('2026-10-01', 9)],
      agenda: [agendaItem('2026-09-05'), agendaItem('2026-10-05')],
      goals: [goal({ kind: 'month', year: 2026, month: 9 }), goal({ kind: 'month', year: 2026, month: 10 })],
    };
    const snap = snapshotForRange(src, range);
    expect(snap.habitDays.map((d) => d.date).sort()).toEqual(['2026-09-01', '2026-09-30']);
    expect(snap.habitDays.find((d) => d.date === '2026-09-01')).toMatchObject({ amount: 8, target: 8, unit: 'bardak' });
    expect(snap.journal.map((e) => e.date)).toEqual(['2026-09-15']);
    expect(snap.ratings.map((r) => r.date)).toEqual(['2026-09-15']);
    expect(snap.agenda.map((a) => a.date)).toEqual(['2026-09-05']);
    expect(snap.goals).toHaveLength(1);
  });

  it('geçmiş alışkanlık hedefi bugünkü ayarlarla yeniden yorumlanmaz', () => {
    const changedHabit: Habit = {
      ...habit,
      revisions: [
        { from: '2026-01-01', target: 8, unit: 'bardak', schedule: { kind: 'daily' } },
        { from: '2026-09-15', target: 10, unit: 'bardak', schedule: { kind: 'daily' } },
      ],
    };
    const src = { habits: [changedHabit], logs: [log('2026-09-10', 8), log('2026-09-20', 10)], pomoSessions: [], journal: [], ratings: [], agenda: [], goals: [] };
    const snap = snapshotForRange(src, range);
    expect(snap.habitDays.find((d) => d.date === '2026-09-10')?.target).toBe(8); // eski hedef
    expect(snap.habitDays.find((d) => d.date === '2026-09-20')?.target).toBe(10); // yeni hedef
  });

  it('gece yarısını geçen bir Pomodoro seansı, aralığı kapsıyorsa dahil edilir', () => {
    const spanning = {
      id: 's1',
      plannedMs: 25 * 60_000,
      startedAt: new Date(2026, 8, 30, 23, 50).getTime(),
      endedAt: new Date(2026, 9, 1, 0, 15).getTime(),
      activeMs: 25 * 60_000,
      segments: [{ start: new Date(2026, 8, 30, 23, 50).getTime(), end: new Date(2026, 9, 1, 0, 15).getTime() }],
      status: 'completed' as const,
    };
    const src = { habits: [], logs: [], pomoSessions: [spanning], journal: [], ratings: [], agenda: [], goals: [] };
    expect(snapshotForRange(src, range).pomoSessions).toEqual([spanning]);
    expect(snapshotForRange(src, monthRange(2026, 7)).pomoSessions).toEqual([]); // ilgisiz ay
  });
});
