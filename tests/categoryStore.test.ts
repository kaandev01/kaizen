import { describe, expect, it } from 'vitest';
import { GENERAL_CATEGORY_ID } from '../src/core/categories';
import { FakeClock, habitInput, makeStore } from './helpers';

const MIN = 60_000;

describe('Kategoriler (Store)', () => {
  it('yeni açılan bir mağazada "Genel" kategorisi zaten vardır', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    expect(store.getState().categories.map((c) => c.id)).toContain(GENERAL_CATEGORY_ID);
  });

  it('addCategory alt kategori oluşturabilir; "Genel" yeniden adlandırılamaz/silinemez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const kitap = store.addCategory({ name: 'Kitap', parentId: null, color: '#111' });
    const alt = store.addCategory({ name: 'Atomic Habits', parentId: kitap.id, color: '#222' });
    expect(alt.parentId).toBe(kitap.id);
    expect(() => store.updateCategory(GENERAL_CATEGORY_ID, { name: 'Değişti', color: '#000' })).toThrow();
    expect(() => store.deleteCategory(GENERAL_CATEGORY_ID)).toThrow();
  });

  it('alt kategorisi olan bir kategori silinemez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const kitap = store.addCategory({ name: 'Kitap', parentId: null, color: '#111' });
    store.addCategory({ name: 'Atomic Habits', parentId: kitap.id, color: '#222' });
    expect(() => store.deleteCategory(kitap.id)).toThrow();
  });

  it('bir kategori silinince: bağlı habit unlink edilir, o kategorideki seanslar Genel\'e taşınır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    const habit = store.addHabit(habitInput({ name: 'Yazılım' }));
    store.updateHabit(habit.id, { ...habitInput({ name: 'Yazılım' }), linkedCategoryId: net.id });
    store.pomoSetCategory(net.id);
    store.pomoStart();
    clock.advanceMs(25 * MIN);
    store.pomoSettle();
    expect(store.getState().pomoSessions[0].categoryId).toBe(net.id);

    store.deleteCategory(net.id);

    expect(store.getState().habits.find((h) => h.id === habit.id)?.linkedCategoryId).toBeNull();
    expect(store.getState().pomoSessions[0].categoryId).toBe(GENERAL_CATEGORY_ID);
    expect(store.getState().categories.some((c) => c.id === net.id)).toBe(false);
  });

  it('pomoSetCategory seçili kategoriyi değiştirir; tamamlanan seans onu taşır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
    expect(store.getState().pomodoro.categoryId).toBe(GENERAL_CATEGORY_ID);
    store.pomoSetCategory(net.id);
    expect(store.getState().pomodoro.categoryId).toBe(net.id);
    store.pomoStart();
    clock.advanceMs(25 * MIN);
    store.pomoSettle();
    expect(store.getState().pomoSessions[0]).toMatchObject({ categoryId: net.id });
  });

  describe('autoTickHabitsForCategory', () => {
    it('doğrudan bağlı kategoride tamamlanan seans, bağlı habit\'i +1 tikler', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
      const habit = store.addHabit(habitInput({ name: 'Yazılım', target: 3 }));
      store.updateHabit(habit.id, { ...habitInput({ name: 'Yazılım', target: 3 }), linkedCategoryId: net.id });

      const ticked = store.autoTickHabitsForCategory(net.id);
      expect(ticked.map((h) => h.id)).toEqual([habit.id]);
      const today = '2026-09-29';
      expect(store.getState().logs[`${habit.id}|${today}`]?.amount).toBe(1);
    });

    it('alt kategoride tamamlanan seans, üst kategoriye bağlı habit\'i de tetikler (rollup)', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const kitap = store.addCategory({ name: 'Kitap', parentId: null, color: '#111' });
      const alt = store.addCategory({ name: 'Atomic Habits', parentId: kitap.id, color: '#222' });
      const habit = store.addHabit(habitInput({ name: 'Oku', target: 1 }));
      store.updateHabit(habit.id, { ...habitInput({ name: 'Oku', target: 1 }), linkedCategoryId: kitap.id });

      const ticked = store.autoTickHabitsForCategory(alt.id); // ALT kategoride tamamlandı
      expect(ticked.map((h) => h.id)).toEqual([habit.id]); // ama üst kategoriye bağlı habit yine de tetiklendi
    });

    it('bağlı habit yoksa boş dizi döner, hiçbir şey tiklenmez', async () => {
      const { store } = await makeStore(new FakeClock(2026, 9, 29));
      const net = store.addCategory({ name: '.NET', parentId: null, color: '#333' });
      expect(store.autoTickHabitsForCategory(net.id)).toEqual([]);
    });
  });
});
