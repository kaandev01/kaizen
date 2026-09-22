import { describe, expect, it } from 'vitest';
import { agendaForDay, agendaRemindersBetween, isOverdue, sortAgenda, upcomingAgenda } from '../src/core/agenda';
import type { AgendaItem } from '../src/core/types';
import { FakeClock, makeStore } from './helpers';

const base: Omit<AgendaItem, 'id' | 'title' | 'date' | 'time'> = {
  kind: 'todo',
  description: '',
  reminder: null,
  done: false,
  createdAt: 0,
  updatedAt: 0,
};
const item = (over: Partial<AgendaItem>): AgendaItem => ({ id: 'x', title: 'x', date: '2026-09-21', time: null, ...base, ...over });

describe('isOverdue', () => {
  it('saatli kayıt saatini geçince gecikmiş sayılır', () => {
    const now = new Date(2026, 8, 21, 10, 30);
    expect(isOverdue(item({ date: '2026-09-21', time: '10:00' }), now)).toBe(true);
    expect(isOverdue(item({ date: '2026-09-21', time: '11:00' }), now)).toBe(false);
  });

  it('tüm günlük kayıt kendi günü bitmeden gecikmiş sayılmaz', () => {
    const now = new Date(2026, 8, 21, 23, 59);
    expect(isOverdue(item({ date: '2026-09-21', time: null }), now)).toBe(false);
    const tomorrow = new Date(2026, 8, 22, 0, 1);
    expect(isOverdue(item({ date: '2026-09-21', time: null }), tomorrow)).toBe(true);
  });

  it('tamamlanan kayıt hiçbir zaman gecikmiş sayılmaz', () => {
    const now = new Date(2026, 8, 25, 10, 0);
    expect(isOverdue(item({ date: '2026-09-21', time: '09:00', done: true }), now)).toBe(false);
  });
});

describe('sıralama ve listeleme', () => {
  it('sortAgenda tarih+saate göre sıralar; tüm günlükler günün başında sayılır', () => {
    const items = [item({ id: 'a', date: '2026-09-22', time: '08:00' }), item({ id: 'b', date: '2026-09-21', time: '18:00' }), item({ id: 'c', date: '2026-09-21', time: null })];
    expect(sortAgenda(items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('agendaForDay yalnızca o güne ait kayıtları döndürür', () => {
    const items = [item({ id: 'a', date: '2026-09-21' }), item({ id: 'b', date: '2026-09-22' })];
    expect(agendaForDay(items, '2026-09-21').map((i) => i.id)).toEqual(['a']);
  });

  it('upcomingAgenda: tamamlanmışlar hariç, bugünden itibaren (gecikmişler dahil)', () => {
    const now = new Date(2026, 8, 21, 12, 0);
    const items = [
      item({ id: 'past-done', date: '2026-09-18', done: true }),
      item({ id: 'past-overdue', date: '2026-09-18', time: '09:00' }),
      item({ id: 'today', date: '2026-09-21' }),
      item({ id: 'future', date: '2026-09-25' }),
    ];
    expect(upcomingAgenda(items, now).map((i) => i.id)).toEqual(['past-overdue', 'today', 'future']);
  });
});

describe('agendaRemindersBetween', () => {
  it('yalnızca hatırlatması olan, tamamlanmamış kayıtlar için ve (from, to] aralığında', () => {
    const items = [
      item({ id: 'a', date: '2026-09-21', reminder: '09:00' }),
      item({ id: 'b', date: '2026-09-21', reminder: null }),
      item({ id: 'c', date: '2026-09-21', reminder: '09:00', done: true }),
    ];
    const at = new Date(2026, 8, 21, 9, 0).getTime();
    expect(agendaRemindersBetween(items, at - 1000, at)).toEqual([{ id: 'a|2026-09-21|09:00', itemId: 'a', title: 'x', at }]);
    expect(agendaRemindersBetween(items, at, at + 1000)).toEqual([]);
  });
});

describe('hatırlatma zamanlaması: düzenleme/silme sonrası güncellenir', () => {
  it('saat değiştirilince eski saatte artık hatırlatma yok, yeni saatte var; silinince hiç yok', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    const created = store.addAgendaItem({ title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '10:00', description: '', reminder: '09:00' });
    const at = (h: string) => new Date(2026, 8, 25, Number(h.split(':')[0]), Number(h.split(':')[1])).getTime();

    let occ = agendaRemindersBetween(store.getState().agenda, 0, at('09:00'));
    expect(occ).toHaveLength(1);

    store.updateAgendaItem(created.id, { title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '10:00', description: '', reminder: '08:30' });
    occ = agendaRemindersBetween(store.getState().agenda, 0, at('09:00'));
    expect(occ).toHaveLength(1);
    expect(occ[0].at).toBe(at('08:30')); // eski 09:00 değil, yeni 08:30

    store.deleteAgendaItem(created.id);
    occ = agendaRemindersBetween(store.getState().agenda, 0, at('23:59'));
    expect(occ).toHaveLength(0);
  });

  it('tamamlanan kaydın hatırlatması durur', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21, 9, 0));
    const created = store.addAgendaItem({ title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '10:00', description: '', reminder: '09:00' });
    store.setAgendaDone(created.id, true);
    const occ = agendaRemindersBetween(store.getState().agenda, 0, new Date(2026, 8, 25, 23, 59).getTime());
    expect(occ).toHaveLength(0);
  });
});

describe('Store: ajanda CRUD ve kalıcılık', () => {
  it('ekleme/düzenleme/silme kalıcıdır; düzenleme yeni hatırlatma anahtarı üretir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store, storage } = await makeStore(clock);
    const created = store.addAgendaItem({ title: 'Matematik sınavı', kind: 'exam', date: '2026-09-25', time: '10:00', description: '', reminder: '09:00' });
    await store.flush();
    expect((await storage.load()).agenda).toHaveLength(1);

    store.updateAgendaItem(created.id, { title: 'Matematik sınavı', kind: 'exam', date: '2026-09-25', time: '10:00', description: 'Amfi A', reminder: '08:30' });
    const updated = store.getState().agenda[0];
    expect(updated.description).toBe('Amfi A');
    expect(updated.reminder).toBe('08:30');

    store.setAgendaDone(created.id, true);
    expect(store.getState().agenda[0].done).toBe(true);

    store.deleteAgendaItem(created.id);
    await store.flush();
    expect(store.getState().agenda).toHaveLength(0);
    expect((await storage.load()).agenda).toHaveLength(0);
  });

  it('geçersiz girdi (boş başlık) reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(() => store.addAgendaItem({ title: '  ', kind: 'todo', date: '2026-09-21', time: null, description: '', reminder: null })).toThrow();
  });
});
