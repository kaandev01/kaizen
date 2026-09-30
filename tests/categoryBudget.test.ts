import { describe, expect, it } from 'vitest';
import { budgetRevisionFor } from '../src/core/categories';
import { weekRange } from '../src/core/periods';
import { FakeClock, makeStore } from './helpers';

const HOUR = 3_600_000;

describe('setCategoryBudget (Store) — haftalık zaman bütçesi', () => {
  it('aynı hafta içinde tekrar düzenleme yeni bir revizyon EKLEMEZ, son revizyonu günceller', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0); // Salı, hafta Pazartesi'si 2026-09-28
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });

    store.setCategoryBudget(net.id, 3 * HOUR);
    clock.set(2026, 10, 1, 10, 0); // aynı hafta içinde Perşembe
    store.setCategoryBudget(net.id, 5 * HOUR);

    const budget = store.getState().categoryBudgets.find((b) => b.categoryId === net.id);
    expect(budget?.revisions).toHaveLength(1); // ikinci düzenleme aynı revizyonu güncelledi
    expect(budget?.revisions[0]).toEqual({ from: '2026-09-28', targetMs: 5 * HOUR });
  });

  it('yeni haftada düzenleme yeni revizyon ekler; ESKİ haftanın revizyonu değişmez', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });

    store.setCategoryBudget(net.id, 3 * HOUR); // bu hafta (from 2026-09-28)
    clock.set(2026, 10, 6, 9, 0); // sonraki hafta Salı (Pazartesi'si 2026-10-05)
    store.setCategoryBudget(net.id, 8 * HOUR);

    const budget = store.getState().categoryBudgets.find((b) => b.categoryId === net.id)!;
    expect(budget.revisions).toEqual([
      { from: '2026-09-28', targetMs: 3 * HOUR },
      { from: '2026-10-05', targetMs: 8 * HOUR },
    ]);
    // Geçmiş haftanın hedefi hâlâ 3 saat olarak okunabilir (revizyon listesinden silinmedi).
    expect(budgetRevisionFor(budget, '2026-09-28')?.targetMs).toBe(3 * HOUR);
  });

  it('hiç düzenlenmeyen gelecek bir hafta, ekstra revizyon olmadan son hedefi otomatik miras alır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    store.setCategoryBudget(net.id, 4 * HOUR);

    const budget = store.getState().categoryBudgets.find((b) => b.categoryId === net.id)!;
    expect(budget.revisions).toHaveLength(1); // hiç yeni revizyon eklenmedi
    const farFutureWeek = weekRange('2027-03-15').start;
    expect(budgetRevisionFor(budget, farFutureWeek)?.targetMs).toBe(4 * HOUR); // yine de miras alınır
  });

  it('targetMs: null ile kaldırma geçmiş revizyonları SİLMEZ, yalnızca bu haftadan itibaren hedefi kaldırır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    store.setCategoryBudget(net.id, 3 * HOUR);
    clock.set(2026, 10, 6, 9, 0); // sonraki hafta
    store.setCategoryBudget(net.id, null); // kaldır

    const budget = store.getState().categoryBudgets.find((b) => b.categoryId === net.id)!;
    expect(budget.revisions).toHaveLength(2);
    expect(budgetRevisionFor(budget, '2026-09-28')?.targetMs).toBe(3 * HOUR); // geçmiş hafta korunur
    expect(budgetRevisionFor(budget, '2026-10-05')?.targetMs).toBeNull(); // bu haftadan itibaren yok
  });

  it('kategori silinince ona ait bütçe kaydı da kaldırılır', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    store.setCategoryBudget(net.id, 2 * HOUR);
    expect(store.getState().categoryBudgets).toHaveLength(1);

    store.deleteCategory(net.id);
    expect(store.getState().categoryBudgets).toHaveLength(0);
  });

  it('geçersiz hedef (0 veya negatif) reddedilir; bilinmeyen kategori reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    expect(() => store.setCategoryBudget(net.id, 0)).toThrow();
    expect(() => store.setCategoryBudget(net.id, -1)).toThrow();
    expect(() => store.setCategoryBudget('yok-boyle-bir-kategori', HOUR)).toThrow();
  });

  it('kalıcıdır: yeniden yüklemeden sonra bütçe hâlâ okunabilir', async () => {
    const clock = new FakeClock(2026, 9, 29);
    const { store, storage } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    store.setCategoryBudget(net.id, 6 * HOUR);
    await store.flush();
    expect((await storage.load()).categoryBudgets).toHaveLength(1);
  });
});
