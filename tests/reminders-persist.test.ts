import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { buildIcs } from '../src/core/ics';
import { PENDING_NOTIFICATION_LIMIT, remindersBetween, upcomingReminders } from '../src/core/reminders';
import { IndexedDbStorage } from '../src/storage/storage';
import { FakeClock, habitInput, makeStore } from './helpers';

const fmt = (o: { date: string; time: string }[]) => o.map((x) => `${x.date} ${x.time}`);

describe('hatırlatma zamanlaması', () => {
  it('yalnızca planlı günlerde ve gelecekteki saatlerde', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0); // Pzt
    const { store } = await makeStore(clock);
    store.addHabit(habitInput({ reminders: ['20:00', '08:00'], schedule: { kind: 'weekdays', days: [1, 3] } }));
    const st = store.getState();
    const got = upcomingReminders(st.habits, st.logs, clock.now(), { horizonDays: 7 });
    expect(fmt(got)).toEqual([
      '2026-09-21 20:00', // bugün 08:00 geçti
      '2026-09-23 08:00',
      '2026-09-23 20:00',
      '2026-09-28 08:00',
      '2026-09-28 20:00',
    ]);
  });

  it('bugün hedefi tamamlanınca bugünün kalan hatırlatmaları iptal, sonraki günler korunur', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ target: 2, reminders: ['12:00', '20:00'] }));
    const list = () => {
      const st = store.getState();
      return fmt(upcomingReminders(st.habits, st.logs, clock.now(), { horizonDays: 1 }));
    };
    expect(list()).toEqual(['2026-09-21 12:00', '2026-09-21 20:00', '2026-09-22 12:00', '2026-09-22 20:00']);
    store.setAmount(h.id, '2026-09-21', 1);
    expect(list()).toHaveLength(4); // henüz tamamlanmadı
    store.setAmount(h.id, '2026-09-21', 2);
    expect(list()).toEqual(['2026-09-22 12:00', '2026-09-22 20:00']);
    store.setAmount(h.id, '2026-09-21', 1); // geri alındı → yeniden planlanır
    expect(list()).toHaveLength(4);
  });

  it('düzenleme ve silme sonrası zamanlama güncellenir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    const h = store.addHabit(habitInput({ reminders: ['20:00'] }));
    const list = () => {
      const st = store.getState();
      return fmt(upcomingReminders(st.habits, st.logs, clock.now(), { horizonDays: 1 }));
    };
    expect(list()).toEqual(['2026-09-21 20:00', '2026-09-22 20:00']);
    store.updateHabit(h.id, habitInput({ reminders: ['18:30', '21:00', '18:30'], schedule: { kind: 'weekdays', days: [2] } }));
    expect(list()).toEqual(['2026-09-22 18:30', '2026-09-22 21:00']); // Salı'ya taşındı, yinelenen saat tekilleşti
    store.deleteHabit(h.id);
    expect(list()).toEqual([]);
  });

  it('platform sınırını aşmaz ve en yakın hatırlatmaları tutar', async () => {
    const clock = new FakeClock(2026, 9, 21, 0, 0);
    const { store } = await makeStore(clock);
    store.addHabit(habitInput({ reminders: ['08:00', '12:00', '16:00', '20:00'] }));
    const st = store.getState();
    const got = upcomingReminders(st.habits, st.logs, clock.now(), { horizonDays: 60 });
    expect(got).toHaveLength(PENDING_NOTIFICATION_LIMIT);
    expect(got[0].date).toBe('2026-09-21');
    expect(got.every((x, i) => i === 0 || got[i - 1].at <= x.at)).toBe(true);
  });

  it('remindersBetween: yalnızca (from, to] aralığı', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    store.addHabit(habitInput({ reminders: ['09:00'] }));
    const st = store.getState();
    const at = new Date(2026, 8, 21, 9, 0).getTime();
    expect(remindersBetween(st.habits, st.logs, clock.now(), at - 1000, at)).toHaveLength(1);
    expect(remindersBetween(st.habits, st.logs, clock.now(), at, at + 1000)).toHaveLength(0);
  });
});

describe('takvim (.ics) dışa aktarımı', () => {
  it('tekrar kuralı, uyarı ve sabit UID içerir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    store.addHabit(habitInput({ name: 'Kitap, oku; hızlı', icon: '📖', target: 20, unit: 'sayfa', reminders: ['07:30'], schedule: { kind: 'weekdays', days: [1, 3, 5] } }));
    store.addHabit(habitInput({ name: 'Su iç', reminders: ['10:00', '15:00'] }));
    store.addHabit(habitInput({ name: 'Hatırlatmasız' }));
    const ics = buildIcs(store.getState().habits, clock.now());
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics).toContain('DTSTART:20260921T073000');
    expect(ics).toContain('Kitap\\, oku\\; hızlı');
    expect(ics).not.toContain('Hatırlatmasız');
    expect(ics.includes('\r\n')).toBe(true);
    const uids = ics.match(/UID:.+/g)!;
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe('kalıcılık (IndexedDB) — yeniden başlatmada veri korunur', () => {
  it('alışkanlıklar, kayıtlar, ayarlar ve Pomodoro durumu yeni oturumda geri gelir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const name = 'kaizen-test-' + Math.random();

    const s1 = await IndexedDbStorage.open(name);
    const a = await makeStore(clock, s1);
    const h = a.store.addHabit(habitInput({ name: 'Su iç', target: 8, reminders: ['10:00'] }));
    a.store.setAmount(h.id, '2026-09-21', 3);
    a.store.setAmount(h.id, '2026-09-20', 8);
    a.store.updateSettings({ theme: 'dark', haptics: false });
    a.store.pomoStart();
    await a.store.flush();
    s1.close(); // uygulama kapandı

    const s2 = await IndexedDbStorage.open(name);
    const b = await makeStore(clock, s2);
    const st = b.store.getState();
    expect(st.habits).toHaveLength(1);
    expect(st.habits[0]).toMatchObject({ name: 'Su iç', reminders: ['10:00'] });
    expect(st.habits[0].revisions[0]).toMatchObject({ target: 8, unit: 'bardak' });
    expect(Object.values(st.logs).map((l) => [l.date, l.amount]).sort()).toEqual([
      ['2026-09-20', 8],
      ['2026-09-21', 3],
    ]);
    expect(st.settings).toMatchObject({ theme: 'dark', haptics: false });
    expect(st.pomodoro.status).toBe('running');

    // Silme, IndexedDB'de kayıtları da siler.
    b.store.deleteHabit(h.id);
    await b.store.flush();
    s2.close();
    const s3 = await IndexedDbStorage.open(name);
    const snap = await s3.load();
    expect(snap.habits).toHaveLength(0);
    expect(snap.logs).toHaveLength(0);
    s3.close();
  });
});
