import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, createDayWatcher, daysBetween, isoWeekday, toDateKey } from '../src/core/dates';
import { habitsForDay, summarize, amountOf } from '../src/core/progress';
import { currentStreak } from '../src/core/streak';
import { planFor } from '../src/core/plan';
import { FakeClock, habitInput, makeStore } from './helpers';

// 2026-09-21 bir Pazartesi.
const TODAY = '2026-09-21';

describe('tarih yardımcıları', () => {
  it('gün anahtarı ve gün ekleme (ay/yıl/artık yıl sınırları)', () => {
    expect(toDateKey(new Date(2026, 8, 21, 23, 59))).toBe('2026-09-21');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // DST haftası
  });
  it('ISO hafta günü: Pazartesi=1, Pazar=7', () => {
    expect(isoWeekday('2026-09-21')).toBe(1);
    expect(isoWeekday('2026-09-27')).toBe(7);
  });
});

describe('0/2 → 1/2 → 2/2 ve geri alma', () => {
  it('miktar artar, hedefte tamamlanır, geri alınınca tamamlanma kalkar', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    const h = store.addHabit(habitInput({ target: 2 }));
    const rows = () => habitsForDay(store.getState().habits, store.getState().logs, TODAY);

    expect(rows()[0]).toMatchObject({ amount: 0, done: false, ratio: 0 });
    const p1 = store.setAmount(h.id, TODAY, 1);
    expect(p1).toBe(0);
    expect(rows()[0]).toMatchObject({ amount: 1, done: false, ratio: 0.5 });
    const p2 = store.setAmount(h.id, TODAY, 2);
    expect(rows()[0]).toMatchObject({ amount: 2, done: true, ratio: 1 });

    store.setAmount(h.id, TODAY, p2); // geri al 2 → 1
    expect(rows()[0]).toMatchObject({ amount: 1, done: false });
    store.setAmount(h.id, TODAY, p1); // geri al 1 → 0
    expect(rows()[0].amount).toBe(0);
    expect(store.getState().logs).toEqual({}); // 0 kaydı tutulmaz
  });

  it('miktar negatif olamaz; hedefin üstü kaydedilir ama ilerleme %100 ile sınırlı', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    const h = store.addHabit(habitInput({ target: 8 }));
    store.setAmount(h.id, TODAY, -5);
    expect(amountOf(store.getState().logs, h.id, TODAY)).toBe(0);
    store.setAmount(h.id, TODAY, 12);
    const row = habitsForDay(store.getState().habits, store.getState().logs, TODAY)[0];
    expect(row.amount).toBe(12);
    expect(row.ratio).toBe(1);
    expect(row.done).toBe(true);
  });
});

describe('günlük halka', () => {
  it('her alışkanlık eşit ağırlıkta, katkı min(mevcut/hedef, 1)', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    const a = store.addHabit(habitInput({ name: 'A', target: 2 }));
    const b = store.addHabit(habitInput({ name: 'B', target: 8 }));
    const c = store.addHabit(habitInput({ name: 'C', target: 10 }));
    const d = store.addHabit(habitInput({ name: 'D', target: 20 }));
    store.setAmount(a.id, TODAY, 1); // 0.5
    store.setAmount(b.id, TODAY, 8); // 1
    store.setAmount(c.id, TODAY, 3); // 0.3
    store.setAmount(d.id, TODAY, 25); // 1 (sınırlı)
    const s = summarize(habitsForDay(store.getState().habits, store.getState().logs, TODAY));
    expect(s.planned).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.ratio).toBeCloseTo((0.5 + 1 + 0.3 + 1) / 4, 10);
  });

  it('planlı alışkanlık yoksa oran null (%100 gösterilmez)', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(summarize([]).ratio).toBeNull();
    store.addHabit(habitInput({ schedule: { kind: 'weekdays', days: [2, 4] } })); // Sal/Per; bugün Pzt
    const rows = habitsForDay(store.getState().habits, store.getState().logs, TODAY);
    expect(rows).toHaveLength(0);
    expect(summarize(rows)).toEqual({ planned: 0, completed: 0, ratio: null });
  });
});

/** Seri testleri için kayıt seti kurar. */
async function withHabit(days: Record<string, number>, over = {}, createdAt = '2026-09-01') {
  const [y, m, d] = createdAt.split('-').map(Number);
  const clock = new FakeClock(y, m, d);
  const { store } = await makeStore(clock);
  const h = store.addHabit(habitInput({ target: 2, ...over }));
  for (const [date, amt] of Object.entries(days)) store.setAmount(h.id, date, amt);
  return { store, h, streak: (today: string) => {
    const st = store.getState();
    return currentStreak(st.habits.find((x) => x.id === h.id)!, (dt) => amountOf(st.logs, h.id, dt), today);
  } };
}

describe('gün serisi (streak)', () => {
  it('bugün henüz tamamlanmadıysa dünkü seri korunur; tamamlanınca +1; geri alınınca yeniden hesaplanır', async () => {
    const { store, h, streak } = await withHabit({ '2026-09-18': 2, '2026-09-19': 2, '2026-09-20': 2 });
    expect(streak(TODAY)).toBe(3);
    store.setAmount(h.id, TODAY, 2);
    expect(streak(TODAY)).toBe(4);
    store.setAmount(h.id, TODAY, 1);
    expect(streak(TODAY)).toBe(3);
  });

  it('planlı geçmiş günü tamamlanmadan biten seri bozulur', async () => {
    const { streak } = await withHabit({ '2026-09-18': 2, '2026-09-19': 1 /* eksik */, '2026-09-20': 2 });
    expect(streak(TODAY)).toBe(1);
  });

  it('gün bitince (ertesi gün) tamamlanmayan dün seriyi sıfırlar', async () => {
    const { streak } = await withHabit({ '2026-09-19': 2, '2026-09-20': 2 });
    expect(streak('2026-09-21')).toBe(2);
    expect(streak('2026-09-22')).toBe(0); // 21'i yapmadı, 22'de bakınca 21 geçmişte eksik
  });

  it('planlanmamış günler seriyi ne bozar ne artırır (Pzt/Çar/Cum)', async () => {
    // 2026-09-14 Pzt, 16 Çar, 18 Cum, bugün 21 Pzt.
    const over = { schedule: { kind: 'weekdays', days: [1, 3, 5] } };
    const ok = await withHabit({ '2026-09-14': 2, '2026-09-16': 2, '2026-09-18': 2 }, over);
    expect(ok.streak(TODAY)).toBe(3);
    expect(ok.streak('2026-09-20')).toBe(3); // Pazar plansız: artmaz/bozulmaz
    const broken = await withHabit({ '2026-09-14': 2, '2026-09-18': 2 /* Çar eksik */ }, over);
    expect(broken.streak(TODAY)).toBe(1);
  });

  it('alışkanlık oluşturulmadan önceki günler seriyi bozmaz', async () => {
    const { streak } = await withHabit({ '2026-09-20': 2 }, {}, '2026-09-20');
    expect(streak(TODAY)).toBe(1);
  });
});

describe('düzenlemeler geçmişi yeniden yorumlamaz', () => {
  it('hedef artırılınca geçmiş günler eski hedefle değerlendirilir', async () => {
    const clock = new FakeClock(2026, 9, 10);
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ target: 2 }));
    store.setAmount(h.id, '2026-09-10', 2);
    store.setAmount(h.id, '2026-09-11', 2);
    clock.set(2026, 9, 12);
    store.updateHabit(h.id, habitInput({ target: 5 }));
    store.setAmount(h.id, '2026-09-12', 5);

    const habit = store.getState().habits[0];
    expect(planFor(habit, '2026-09-11')?.target).toBe(2);
    expect(planFor(habit, '2026-09-12')?.target).toBe(5);
    const rows = habitsForDay(store.getState().habits, store.getState().logs, '2026-09-11');
    expect(rows[0]).toMatchObject({ target: 2, done: true, ratio: 1 });
    expect(currentStreak(habit, (d) => amountOf(store.getState().logs, h.id, d), '2026-09-12')).toBe(3);
  });

  it('tekrar düzeni değişince geçmiş planlı/plansız günler aynı kalır', async () => {
    const clock = new FakeClock(2026, 9, 14); // Pzt
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ schedule: { kind: 'daily' } }));
    clock.set(2026, 9, 21); // bir hafta sonra sadece Pzt'ye çevir
    store.updateHabit(h.id, habitInput({ schedule: { kind: 'weekdays', days: [1] } }));
    const habit = store.getState().habits[0];
    expect(planFor(habit, '2026-09-16')).not.toBeNull(); // eski günlük düzen: Çar planlıydı
    expect(planFor(habit, '2026-09-23')).toBeNull(); // yeni düzen: Çar plansız
    expect(planFor(habit, '2026-09-28')).not.toBeNull(); // yeni düzen: Pzt planlı
  });

  it('aynı gün içindeki tekrar düzenlemeler tek sürümde birleşir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    const h = store.addHabit(habitInput({ target: 2 }));
    store.updateHabit(h.id, habitInput({ target: 3 }));
    store.updateHabit(h.id, habitInput({ target: 4 }));
    expect(store.getState().habits[0].revisions).toHaveLength(1);
    expect(store.getState().habits[0].revisions[0].target).toBe(4);
  });
});

describe('gece yarısı ve ertesi gün açılış', () => {
  afterEach(() => vi.useRealTimers());

  it('Bugün listesi yeni güne göre yenilenir, eski kayıtlar silinmez', async () => {
    const clock = new FakeClock(2026, 9, 21, 23, 59);
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ target: 2 }));
    store.setAmount(h.id, TODAY, 2);

    clock.set(2026, 9, 22, 0, 1);
    const today2 = toDateKey(clock.now());
    expect(today2).toBe('2026-09-22');
    const rows = habitsForDay(store.getState().habits, store.getState().logs, today2);
    expect(rows[0].amount).toBe(0); // yeni gün sıfırdan
    expect(amountOf(store.getState().logs, h.id, TODAY)).toBe(2); // dün duruyor
  });

  it('uygulama açıkken gece yarısı geçince gün izleyici tetiklenir', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 23, 59, 30));
    const seen: string[] = [];
    const w = createDayWatcher({ now: () => new Date() }, (d) => seen.push(d));
    vi.advanceTimersByTime(29_000);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(2_000); // 00:00:01
    expect(seen).toEqual(['2026-09-22']);
    w.stop();
  });

  it('cihaz uyuyup ertesi gün açılırsa (zamanlayıcı kaçsa da) check() yeni günü yakalar', () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // setTimeout'lar hiç çalışmasın
    vi.setSystemTime(new Date(2026, 8, 21, 22, 0));
    const seen: string[] = [];
    const w = createDayWatcher({ now: () => new Date() }, (d) => seen.push(d));
    vi.setSystemTime(new Date(2026, 8, 22, 7, 30)); // ertesi sabah uygulama tekrar açıldı
    w.check(); // visibilitychange/focus/pageshow bunu çağırır
    expect(seen).toEqual(['2026-09-22']);
    w.stop();
  });
});

describe('alışkanlık silme', () => {
  it('alışkanlık ve tüm kayıtları silinir, diğerleri kalır', async () => {
    const { store, storage } = await makeStore(new FakeClock(2026, 9, 21));
    const a = store.addHabit(habitInput({ name: 'A' }));
    const b = store.addHabit(habitInput({ name: 'B' }));
    store.setAmount(a.id, TODAY, 1);
    store.setAmount(a.id, '2026-09-20', 2);
    store.setAmount(b.id, TODAY, 1);
    store.deleteHabit(a.id);
    await store.flush();
    expect(store.getState().habits.map((h) => h.name)).toEqual(['B']);
    expect(Object.keys(store.getState().logs)).toEqual([`${b.id}|${TODAY}`]);
    const snap = await storage.load();
    expect(snap.habits.map((h) => h.id)).toEqual([b.id]);
    expect(snap.logs.map((l) => l.habitId)).toEqual([b.id]);
  });
});

describe('doğrulama', () => {
  it('geçersiz girdileri reddeder', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(() => store.addHabit(habitInput({ name: '  ' }))).toThrow();
    expect(() => store.addHabit(habitInput({ target: 0 }))).toThrow();
    expect(() => store.addHabit(habitInput({ target: 2.5 }))).toThrow();
    expect(() => store.addHabit(habitInput({ unit: '' }))).toThrow();
    expect(() => store.addHabit(habitInput({ schedule: { kind: 'weekdays', days: [] } }))).toThrow();
    expect(store.getState().habits).toHaveLength(0);
  });
});
