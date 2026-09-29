import { describe, expect, it } from 'vitest';
import { FakeClock, habitInput, makeStore } from './helpers';

describe('Rutinler (Store)', () => {
  it('addRoutine/updateRoutine/deleteRoutine CRUD', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const h = store.addHabit(habitInput({ name: 'Yatak topla', target: 1 }));
    const routine = store.addRoutine({ name: 'Sabah rutinim', steps: [{ habitId: h.id, amount: 1 }] });
    expect(store.getState().routines).toHaveLength(1);

    const updated = store.updateRoutine(routine.id, { name: 'Yeni ad', steps: [{ habitId: h.id, amount: 2 }] });
    expect(updated.name).toBe('Yeni ad');
    expect(updated.steps[0].amount).toBe(2);

    store.deleteRoutine(routine.id);
    expect(store.getState().routines).toHaveLength(0);
  });

  it('aynı alışkanlık aynı rutine iki kez eklenemez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const h = store.addHabit(habitInput({ name: 'Su iç' }));
    expect(() =>
      store.addRoutine({
        name: 'Rutin',
        steps: [
          { habitId: h.id, amount: 1 },
          { habitId: h.id, amount: 2 },
        ],
      }),
    ).toThrow();
  });

  it('boş isim veya adımsız rutin reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const h = store.addHabit(habitInput({ name: 'Su iç' }));
    expect(() => store.addRoutine({ name: '  ', steps: [{ habitId: h.id, amount: 1 }] })).toThrow();
    expect(() => store.addRoutine({ name: 'Rutin', steps: [] })).toThrow();
  });

  describe('startRoutine', () => {
    it('bugün planlı olmayan adımları dışarıda bırakır', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0); // Salı (isoWeekday 2)
      const { store } = await makeStore(clock);
      const daily = store.addHabit(habitInput({ name: 'Günlük', target: 1, schedule: { kind: 'daily' } }));
      const mondayOnly = store.addHabit(habitInput({ name: 'Pazartesi', target: 1, schedule: { kind: 'weekdays', days: [1] } }));
      const routine = store.addRoutine({
        name: 'Rutin',
        steps: [
          { habitId: daily.id, amount: 1 },
          { habitId: mondayOnly.id, amount: 1 },
        ],
      });
      const run = store.startRoutine(routine.id);
      expect(run.stepOrder).toHaveLength(1); // yalnızca 'daily' bugün planlı
      expect(store.getState().routineRun?.runId).toBe(run.runId);
    });
  });

  describe('completeRoutineStep / skipRoutineStep / undoLastRoutineStep', () => {
    it('adımı tamamlar: doğru delta uygular, sıradaki adıma geçer', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
      const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 3 }] });
      store.startRoutine(routine.id);

      const result = store.completeRoutineStep();
      expect(result).toEqual({ habit: expect.objectContaining({ id: h.id }), applied: 3 });
      expect(store.getState().logs[`${h.id}|2026-09-29`]?.amount).toBe(3);
      expect(store.getState().routineRun?.currentIndex).toBe(1);
    });

    it('hedefe kalan miktar adım miktarından azsa yalnızca kalanı ekler ("zaten tamamlandı" ise 0)', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h = store.addHabit(habitInput({ name: 'Su iç', target: 5 }));
      store.setAmount(h.id, '2026-09-29', 4); // hedefe 1 kaldı
      const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 3 }] }); // adım 3 istiyor
      store.startRoutine(routine.id);

      const result = store.completeRoutineStep();
      expect(result?.applied).toBe(1); // yalnızca kalan 1 eklendi, hedef aşılmadı
      expect(store.getState().logs[`${h.id}|2026-09-29`]?.amount).toBe(5);

      // Hedef zaten doluyken başka bir rutin/adım aynı habit'i tekrar hedeflerse "zaten tamamlandı" (0) olmalı.
      const routine2 = store.addRoutine({ name: 'Rutin2', steps: [{ habitId: h.id, amount: 2 }] });
      store.startRoutine(routine2.id);
      const result2 = store.completeRoutineStep();
      expect(result2?.applied).toBe(0);
    });

    it('skipRoutineStep ilerleme miktarını DEĞİŞTİRMEZ, yalnızca sıradaki adıma geçer', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
      const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 3 }] });
      store.startRoutine(routine.id);

      store.skipRoutineStep();
      expect(store.getState().logs[`${h.id}|2026-09-29`]).toBeUndefined(); // hiç dokunulmadı
      expect(store.getState().routineRun?.currentIndex).toBe(1);
    });

    it('undoLastRoutineStep YALNIZCA kendi katkısını geri alır — araya giren manuel artışa dokunmaz', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h = store.addHabit(habitInput({ name: 'Su iç', target: 20 }));
      const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 3 }] });
      store.startRoutine(routine.id);
      store.completeRoutineStep(); // +3 (rutin katkısı)
      expect(store.getState().logs[`${h.id}|2026-09-29`]?.amount).toBe(3);

      store.setAmount(h.id, '2026-09-29', 3 + 5); // araya giren MANUEL bir artış: +5 (ör. elle dokunma)
      expect(store.getState().logs[`${h.id}|2026-09-29`]?.amount).toBe(8);

      store.undoLastRoutineStep(); // yalnızca rutinin +3'ünü geri almalı
      expect(store.getState().logs[`${h.id}|2026-09-29`]?.amount).toBe(5); // 8 - 3 = 5, manuel +5 korunmuş
      expect(store.getState().routineRun?.currentIndex).toBe(0);
    });

    it('undoLastRoutineStep bir atlamanın (skip) ardından çağrılırsa yalnızca adımı geri alır (delta yoktur)', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
      const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 3 }] });
      store.startRoutine(routine.id);
      store.skipRoutineStep();
      expect(store.getState().routineRun?.currentIndex).toBe(1);

      store.undoLastRoutineStep();
      expect(store.getState().routineRun?.currentIndex).toBe(0);
      expect(store.getState().logs[`${h.id}|2026-09-29`]).toBeUndefined();
    });

    it('finishRoutine özet döner ve routineRun\'ı sıfırlar', async () => {
      const clock = new FakeClock(2026, 9, 29, 9, 0);
      const { store } = await makeStore(clock);
      const h1 = store.addHabit(habitInput({ name: 'A', target: 5 }));
      const h2 = store.addHabit(habitInput({ name: 'B', target: 5 }));
      const routine = store.addRoutine({
        name: 'Rutin',
        steps: [
          { habitId: h1.id, amount: 1 },
          { habitId: h2.id, amount: 1 },
        ],
      });
      store.startRoutine(routine.id);
      store.completeRoutineStep();
      store.skipRoutineStep();
      const summary = store.finishRoutine();
      expect(summary).toEqual({ total: 2, completed: 1 });
      expect(store.getState().routineRun).toBeNull();
    });
  });

  it('gün değişince eski routineRun sessizce bugüne taşınmaz — yeni startRoutine eskisinin yerini alır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
    const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 1 }] });
    const firstRun = store.startRoutine(routine.id);
    expect(firstRun.date).toBe('2026-09-29');

    clock.set(2026, 9, 30, 9, 0); // gün değişti
    expect(store.getState().routineRun?.date).toBe('2026-09-29'); // Store gün değişimini KENDİLİĞİNDEN yansıtmaz

    const secondRun = store.startRoutine(routine.id); // kullanıcı bugün için yeniden başlatır
    expect(secondRun.date).toBe('2026-09-30');
    expect(store.getState().routineRun?.runId).toBe(secondRun.runId);
  });

  it('rutin silinirken o an çalışıyorsa aktif çalıştırma da sıfırlanır', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
    const routine = store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 1 }] });
    store.startRoutine(routine.id);
    expect(store.getState().routineRun).not.toBeNull();

    store.deleteRoutine(routine.id);
    expect(store.getState().routineRun).toBeNull();
  });

  it('kalıcıdır: yeniden yüklemeden sonra rutin hâlâ okunabilir', async () => {
    const { store, storage } = await makeStore(new FakeClock(2026, 9, 29));
    const h = store.addHabit(habitInput({ name: 'Kitap oku', target: 10 }));
    store.addRoutine({ name: 'Rutin', steps: [{ habitId: h.id, amount: 1 }] });
    await store.flush();
    expect((await storage.load()).routines).toHaveLength(1);
  });
});
