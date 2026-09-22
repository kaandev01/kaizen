import { describe, expect, it } from 'vitest';
import { formatGoalPeriod, goalTouchesRange, samePeriod, sortGoals } from '../src/core/goals';
import { monthRange, yearRange } from '../src/core/periods';
import type { Goal } from '../src/core/types';
import { FakeClock, makeStore } from './helpers';

const goal = (over: Partial<Goal>): Goal => ({
  id: 'x',
  title: 'x',
  description: '',
  period: { kind: 'month', year: 2026, month: 9 },
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('goals.ts yardımcıları', () => {
  it('formatGoalPeriod', () => {
    expect(formatGoalPeriod({ kind: 'month', year: 2026, month: 9 })).toBe('Eylül 2026');
    expect(formatGoalPeriod({ kind: 'year', year: 2026 })).toBe('2026');
  });

  it('samePeriod', () => {
    expect(samePeriod({ kind: 'month', year: 2026, month: 9 }, { kind: 'month', year: 2026, month: 9 })).toBe(true);
    expect(samePeriod({ kind: 'month', year: 2026, month: 9 }, { kind: 'month', year: 2026, month: 10 })).toBe(false);
    expect(samePeriod({ kind: 'year', year: 2026 }, { kind: 'month', year: 2026, month: 9 })).toBe(false);
  });

  it('goalTouchesRange: aylık hedef, o ayı kapsayan herhangi bir aralıkla kesişir', () => {
    const g = goal({ period: { kind: 'month', year: 2026, month: 9 } });
    expect(goalTouchesRange(g, monthRange(2026, 9))).toBe(true);
    expect(goalTouchesRange(g, yearRange(2026))).toBe(true); // yıllık sorgu, içindeki aylık hedefi de kapsar
    expect(goalTouchesRange(g, monthRange(2026, 10))).toBe(false);
  });

  it('sortGoals: devam eden > tamamlanan > vazgeçilen, sonra en yeni önce', () => {
    const a = goal({ id: 'a', status: 'done', createdAt: 1 });
    const b = goal({ id: 'b', status: 'active', createdAt: 1 });
    const c = goal({ id: 'c', status: 'abandoned', createdAt: 1 });
    const d = goal({ id: 'd', status: 'active', createdAt: 2 });
    expect(sortGoals([a, b, c, d]).map((g) => g.id)).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('Store: hedef CRUD, kalıcılık ve dönem geçişleri', () => {
  it('ekleme/düzenleme/durum/silme', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const { store, storage } = await makeStore(clock);
    const g = store.addGoal({ title: 'Haftada 3 gün spor', description: '' }, { kind: 'month', year: 2026, month: 9 });
    await store.flush();
    expect((await storage.load()).goals).toHaveLength(1);
    expect(g.status).toBe('active');

    store.updateGoal(g.id, { title: 'Haftada 4 gün spor', description: 'Güncellendi' }, g.period);
    expect(store.getState().goals[0].title).toBe('Haftada 4 gün spor');

    store.setGoalStatus(g.id, 'done');
    expect(store.getState().goals[0].status).toBe('done');

    store.deleteGoal(g.id);
    await store.flush();
    expect(store.getState().goals).toHaveLength(0);
    expect((await storage.load()).goals).toHaveLength(0);
  });

  it('geçersiz başlık reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(() => store.addGoal({ title: '', description: '' }, { kind: 'year', year: 2026 })).toThrow();
  });

  it('geçmiş dönem hedefleri, dönem bittiğinde (ay/yıl değişince) silinmez', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const storage = (await makeStore(clock)).storage;
    const a = await makeStore(clock, storage);
    a.store.addGoal({ title: 'Eylül hedefi', description: '' }, { kind: 'month', year: 2026, month: 9 });
    a.store.addGoal({ title: '2026 hedefi', description: '' }, { kind: 'year', year: 2026 });
    await a.store.flush();

    // Yıl değişti, uygulama tekrar açıldı.
    const b = await makeStore(new FakeClock(2027, 1, 5), storage);
    expect(b.store.getState().goals).toHaveLength(2);
    expect(b.store.getState().goals.map((g) => g.title).sort()).toEqual(['2026 hedefi', 'Eylül hedefi']);
  });
});
