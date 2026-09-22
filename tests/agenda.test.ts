import { describe, expect, it } from 'vitest';
import {
  agendaForDay,
  agendaRemindersBetween,
  formatUrgencyPhrase,
  groupAgenda,
  homeUpcoming,
  isOverdue,
  normalizeAgendaItem,
  reminderPreview,
  reminderTriggerAt,
  sortAgenda,
  upcomingAgenda,
  urgencyOf,
} from '../src/core/agenda';
import { normalizeAgendaReminders, validateAgendaInput, type AgendaInput } from '../src/core/validation';
import type { AgendaItem, AgendaReminder } from '../src/core/types';
import { FakeClock, makeStore } from './helpers';
import { MemoryStorage } from '../src/storage/storage';

const base: Omit<AgendaItem, 'id' | 'title' | 'date' | 'time'> = {
  kind: 'todo',
  description: '',
  importance: 'normal',
  reminders: [],
  reminderAnchorTime: null,
  done: false,
  completedAt: null,
  createdAt: 0,
  updatedAt: 0,
};
const item = (over: Partial<AgendaItem>): AgendaItem => ({ id: 'x', title: 'x', date: '2026-09-21', time: null, ...base, ...over });
const agendaInput = (over: Partial<AgendaInput> = {}): AgendaInput => ({
  title: 'x',
  kind: 'todo',
  date: '2026-09-21',
  time: null,
  description: '',
  importance: 'normal',
  reminders: [],
  reminderAnchorTime: null,
  ...over,
});

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

  it('geçmiş tarihli tamamlanmamış kayıt kaydedilebilir ve gecikmiş gösterilir', () => {
    const now = new Date(2026, 8, 25);
    const past = item({ date: '2026-09-10', time: null });
    expect(isOverdue(past, now)).toBe(true);
    expect(formatUrgencyPhrase(past, now)).toBe('15 gün gecikti');
  });
});

describe('urgencyOf — importance ile karıştırılmaz', () => {
  it('önem (importance) ne olursa olsun aciliyet yalnızca zamana göre hesaplanır', () => {
    const now = new Date(2026, 8, 21, 9, 0);
    const criticalButFar = item({ date: '2026-09-30', importance: 'critical' });
    const normalButOverdue = item({ date: '2026-09-01', time: '08:00', importance: 'normal' });
    expect(urgencyOf(criticalButFar, now)).toBe('later'); // kritik olması onu aciliyet açısından yakın yapmaz
    expect(urgencyOf(normalButOverdue, now)).toBe('overdue'); // normal olması gecikmesini gizlemez
  });
  it('bugün / yakında / sonra sınıflandırması', () => {
    const now = new Date(2026, 8, 21);
    expect(urgencyOf(item({ date: '2026-09-21' }), now)).toBe('today');
    expect(urgencyOf(item({ date: '2026-09-23' }), now)).toBe('soon');
    expect(urgencyOf(item({ date: '2026-09-30' }), now)).toBe('later');
  });
});

describe('formatUrgencyPhrase', () => {
  it('örnek ifadeler', () => {
    const now = new Date(2026, 8, 21, 9, 0);
    expect(formatUrgencyPhrase(item({ date: '2026-09-21', time: '18:00' }), now)).toBe('Bugün 18.00');
    expect(formatUrgencyPhrase(item({ date: '2026-09-22' }), now)).toBe('Yarın');
    expect(formatUrgencyPhrase(item({ date: '2026-09-24' }), now)).toBe('3 gün kaldı');
    expect(formatUrgencyPhrase(item({ date: '2026-09-19' }), now)).toBe('2 gün gecikti');
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

  it('upcomingAgenda: tamamlanmışlar hariç, bugünden itibaren (gecikmişler dahil, önce)', () => {
    const now = new Date(2026, 8, 21, 12, 0);
    const items = [
      item({ id: 'past-done', date: '2026-09-18', done: true }),
      item({ id: 'past-overdue', date: '2026-09-18', time: '09:00' }),
      item({ id: 'today', date: '2026-09-21' }),
      item({ id: 'future', date: '2026-09-25' }),
    ];
    expect(upcomingAgenda(items, now).map((i) => i.id)).toEqual(['past-overdue', 'today', 'future']);
  });

  it('homeUpcoming en fazla `limit` kayıt döndürür', () => {
    const now = new Date(2026, 8, 21);
    const items = Array.from({ length: 5 }, (_, i) => item({ id: `${i}`, date: `2026-09-${22 + i}` }));
    expect(homeUpcoming(items, now, 3)).toHaveLength(3);
    expect(homeUpcoming(items, now, 3).map((i) => i.id)).toEqual(['0', '1', '2']);
  });

  it('groupAgenda: Geciken / Bugün / Yaklaşan / Tamamlanan', () => {
    const now = new Date(2026, 8, 21, 12, 0);
    const items = [
      item({ id: 'overdue1', date: '2026-09-18', time: '09:00' }),
      item({ id: 'today1', date: '2026-09-21' }),
      item({ id: 'future1', date: '2026-09-25' }),
      item({ id: 'done1', date: '2026-09-10', done: true, completedAt: 5 }),
      item({ id: 'done2', date: '2026-09-11', done: true, completedAt: 10 }),
    ];
    const g = groupAgenda(items, now);
    expect(g.overdue.map((i) => i.id)).toEqual(['overdue1']);
    expect(g.today.map((i) => i.id)).toEqual(['today1']);
    expect(g.upcoming.map((i) => i.id)).toEqual(['future1']);
    expect(g.completed.map((i) => i.id)).toEqual(['done2', 'done1']); // en son tamamlanan önce
  });
});

describe('reminderTriggerAt — hatırlatma anı hesabı', () => {
  it('saatli kayıtta offset kaydın kendi saatine göre hesaplanır', () => {
    const i = item({ date: '2026-09-25', time: '10:00' });
    expect(reminderTriggerAt(i, { id: 'r', kind: 'exact' })).toBe(new Date(2026, 8, 25, 10, 0).getTime());
    expect(reminderTriggerAt(i, { id: 'r', kind: '1h' })).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    expect(reminderTriggerAt(i, { id: 'r', kind: '1d' })).toBe(new Date(2026, 8, 24, 10, 0).getTime());
    expect(reminderTriggerAt(i, { id: 'r', kind: '1w' })).toBe(new Date(2026, 8, 18, 10, 0).getTime());
  });

  it('tüm günlük kayıtta, kullanıcı açıkça bir "hatırlatma saati" seçmeden offset hatırlatma HİÇ hesaplanmaz (gece yarısı varsayılmaz)', () => {
    const i = item({ date: '2026-09-25', time: null, reminderAnchorTime: null });
    expect(reminderTriggerAt(i, { id: 'r', kind: 'exact' })).toBeNull();
    expect(reminderTriggerAt(i, { id: 'r', kind: '1d' })).toBeNull();
  });

  it('tüm günlük kayıtta kullanıcı saat seçince o saate göre hesaplanır', () => {
    const i = item({ date: '2026-09-25', time: null, reminderAnchorTime: '09:00' });
    expect(reminderTriggerAt(i, { id: 'r', kind: 'exact' })).toBe(new Date(2026, 8, 25, 9, 0).getTime());
    expect(reminderTriggerAt(i, { id: 'r', kind: '1d' })).toBe(new Date(2026, 8, 24, 9, 0).getTime());
  });

  it('özel (custom) hatırlatma kaydın kendi tarih/saatinden tamamen bağımsızdır', () => {
    const i = item({ date: '2026-09-25', time: '10:00' });
    const r: AgendaReminder = { id: 'r', kind: 'custom', customDate: '2026-09-01', customTime: '14:30' };
    expect(reminderTriggerAt(i, r)).toBe(new Date(2026, 8, 1, 14, 30).getTime());
    expect(reminderTriggerAt(i, { id: 'r', kind: 'custom' })).toBeNull(); // tarih/saat girilmemiş
  });

  it('reminderPreview geçmişte kalan hatırlatmaları işaretler', () => {
    const now = new Date(2026, 8, 20);
    const i = item({ date: '2026-09-25', time: '10:00', reminders: [{ id: 'a', kind: '1w' }, { id: 'b', kind: 'exact' }] });
    const preview = reminderPreview(i, now);
    expect(preview.find((p) => p.reminder.id === 'a')?.past).toBe(true); // 18 Eylül'de tetiklenecekti, geçti
    expect(preview.find((p) => p.reminder.id === 'b')?.past).toBe(false);
  });
});

describe('agendaRemindersBetween — çoklu hatırlatma, düzenleme/silme sonrası güncellenir', () => {
  it('bir kaydın birden fazla hatırlatması ayrı ayrı tetiklenir', () => {
    const i = item({ id: 'x', date: '2026-09-25', time: '10:00', reminders: [{ id: 'r1', kind: '1d' }, { id: 'r2', kind: 'exact' }] });
    const occ = agendaRemindersBetween([i], 0, new Date(2026, 8, 26).getTime());
    expect(occ.map((o) => o.reminderId)).toEqual(['r1', 'r2']);
  });

  it('saat değiştirilince eski saatte artık hatırlatma yok, yeni saatte var; silinince hiç yok', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store } = await makeStore(clock);
    const { item: created } = store.addAgendaItem(agendaInput({ title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '10:00', reminders: [{ id: 'r', kind: 'exact' }] }));
    const at = (h: string) => new Date(2026, 8, 25, Number(h.split(':')[0]), Number(h.split(':')[1])).getTime();

    let occ = agendaRemindersBetween(store.getState().agenda, 0, at('10:00'));
    expect(occ).toHaveLength(1);

    store.updateAgendaItem(created.id, agendaInput({ title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '08:30', reminders: [{ id: 'r', kind: 'exact' }] }));
    occ = agendaRemindersBetween(store.getState().agenda, 0, at('10:00'));
    expect(occ).toHaveLength(1);
    expect(occ[0].at).toBe(at('08:30')); // eski 10:00 değil, yeni 08:30

    store.deleteAgendaItem(created.id);
    occ = agendaRemindersBetween(store.getState().agenda, 0, at('23:59'));
    expect(occ).toHaveLength(0);
  });

  it('tamamlanan kaydın hatırlatması durur; geri alınırsa gelecekteki hatırlatmalar tekrar geçerli olur', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21, 9, 0));
    const { item: created } = store.addAgendaItem(agendaInput({ title: 'Sınav', kind: 'exam', date: '2026-09-25', time: '10:00', reminders: [{ id: 'r', kind: 'exact' }] }));
    store.setAgendaDone(created.id, true);
    let occ = agendaRemindersBetween(store.getState().agenda, 0, new Date(2026, 8, 25, 23, 59).getTime());
    expect(occ).toHaveLength(0);

    store.setAgendaDone(created.id, false); // geri al
    occ = agendaRemindersBetween(store.getState().agenda, 0, new Date(2026, 8, 25, 23, 59).getTime());
    expect(occ).toHaveLength(1);
  });
});

describe('normalizeAgendaReminders — aynı türde tekrar eklenmez', () => {
  it('aynı offset türü bir kez kalır; farklı özel tarih/saatler ayrı kalır', () => {
    const rs: AgendaReminder[] = [
      { id: '1', kind: '1d' },
      { id: '2', kind: '1d' },
      { id: '3', kind: 'custom', customDate: '2026-09-01', customTime: '09:00' },
      { id: '4', kind: 'custom', customDate: '2026-09-02', customTime: '09:00' },
    ];
    const out = normalizeAgendaReminders(rs);
    expect(out.map((r) => r.id)).toEqual(['1', '3', '4']);
  });
});

describe('validateAgendaInput', () => {
  it('tüm günlük kayıtta offset hatırlatma varsa saat zorunludur', () => {
    const withoutAnchor = agendaInput({ time: null, reminderAnchorTime: null, reminders: [{ id: 'r', kind: '1d' }] });
    expect(validateAgendaInput(withoutAnchor)).not.toBeNull();
    const withAnchor = agendaInput({ time: null, reminderAnchorTime: '09:00', reminders: [{ id: 'r', kind: '1d' }] });
    expect(validateAgendaInput(withAnchor)).toBeNull();
  });
  it('özel hatırlatmada tarih/saat eksikse reddedilir', () => {
    expect(validateAgendaInput(agendaInput({ reminders: [{ id: 'r', kind: 'custom' }] }))).not.toBeNull();
    expect(validateAgendaInput(agendaInput({ reminders: [{ id: 'r', kind: 'custom', customDate: '2026-09-01', customTime: '09:00' }] }))).toBeNull();
  });
});

describe('normalizeAgendaItem — eski/eksik kayıtlara güvenli varsayılan', () => {
  it('v1 tekil `reminder` alanını çoklu listeye çevirir', () => {
    const legacy = { ...item({}), importance: undefined, reminders: undefined, reminderAnchorTime: undefined, completedAt: undefined } as unknown as AgendaItem;
    (legacy as unknown as { reminder: string }).reminder = '09:00';
    const n = normalizeAgendaItem(legacy);
    expect(n.importance).toBe('normal');
    expect(n.reminders).toHaveLength(1);
    expect(n.reminders[0].kind).toBe('exact');
    expect(n.reminderAnchorTime).toBeNull();
  });
  it('done=true ama completedAt eksikse updatedAt kullanılır', () => {
    const n = normalizeAgendaItem({ ...item({ done: true, updatedAt: 42 }), completedAt: undefined } as unknown as AgendaItem);
    expect(n.completedAt).toBe(42);
  });
});

describe('Store: ajanda CRUD, kalıcılık ve hata durumunda geri alma', () => {
  it('ekleme/düzenleme/silme kalıcıdır', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store, storage } = await makeStore(clock);
    const { item: created, saved } = store.addAgendaItem(agendaInput({ title: 'Matematik sınavı', kind: 'exam', date: '2026-09-25', time: '10:00', importance: 'critical' }));
    expect(await saved).toBe(true);
    expect((await storage.load()).agenda).toHaveLength(1);

    const { item: updated } = store.updateAgendaItem(created.id, agendaInput({ title: 'Matematik sınavı', kind: 'exam', date: '2026-09-25', time: '10:00', description: 'Amfi A' }));
    expect(updated.description).toBe('Amfi A');

    store.setAgendaDone(created.id, true);
    expect(store.getState().agenda[0].done).toBe(true);
    expect(store.getState().agenda[0].completedAt).not.toBeNull();
    store.setAgendaDone(created.id, false);
    expect(store.getState().agenda[0].completedAt).toBeNull();

    store.deleteAgendaItem(created.id);
    await store.flush();
    expect(store.getState().agenda).toHaveLength(0);
    expect((await storage.load()).agenda).toHaveLength(0);
  });

  it('geçersiz girdi (boş başlık) reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(() => store.addAgendaItem(agendaInput({ title: '  ' }))).toThrow();
  });

  it('çift dokunma: aynı `addAgendaItem` çağrısı yalnızca bir kez yapılırsa tek kayıt oluşur (UI katmanındaki koruma bu varsayıma dayanır)', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    store.addAgendaItem(agendaInput({ title: 'Tek kayıt' }));
    expect(store.getState().agenda.filter((a) => a.title === 'Tek kayıt')).toHaveLength(1);
  });

  it('kalıcı yazma başarısız olursa iyimser eklenen kayıt otomatik geri alınır (arayüz gerçeği yanlış göstermesin)', async () => {
    const storage = new MemoryStorage();
    const originalPut = storage.putAgendaItem.bind(storage);
    let fail = false;
    storage.putAgendaItem = (a) => (fail ? Promise.reject(new Error('disk dolu')) : originalPut(a));
    const { store } = await makeStore(new FakeClock(2026, 9, 21), storage);

    fail = true;
    const { item: created, saved } = store.addAgendaItem(agendaInput({ title: 'Başarısız yazma' }));
    expect(store.getState().agenda.some((a) => a.id === created.id)).toBe(true); // anında (iyimser) görünür
    expect(await saved).toBe(false);
    expect(store.getState().agenda.some((a) => a.id === created.id)).toBe(false); // sonra geri alınır
    expect(store.getState().persistError).not.toBeNull(); // hata kullanıcıdan gizlenmez
  });

  it('düzenleme başarısız olursa önceki hâline geri döner', async () => {
    const storage = new MemoryStorage();
    const { store } = await makeStore(new FakeClock(2026, 9, 21), storage);
    const { item: created } = store.addAgendaItem(agendaInput({ title: 'Orijinal' }));
    await store.flush();

    const originalPut = storage.putAgendaItem.bind(storage);
    storage.putAgendaItem = () => Promise.reject(new Error('yazılamadı'));
    const { saved } = store.updateAgendaItem(created.id, agendaInput({ title: 'Değişti' }));
    expect(store.getState().agenda[0].title).toBe('Değişti'); // anında
    expect(await saved).toBe(false);
    expect(store.getState().agenda[0].title).toBe('Orijinal'); // geri alındı
    storage.putAgendaItem = originalPut;
  });

  it('normalizeAgendaItem uygulama açılışında da uygulanır (eski kayıt bozmadan çalışır)', async () => {
    const storage = new MemoryStorage();
    await storage.putAgendaItem({
      id: 'eski',
      title: 'Eski format',
      kind: 'todo',
      date: '2026-09-21',
      time: null,
      description: '',
      done: false,
      createdAt: 0,
      updatedAt: 0,
    } as unknown as AgendaItem);
    const { store } = await makeStore(new FakeClock(2026, 9, 21), storage);
    expect(store.getState().agenda[0]).toMatchObject({ importance: 'normal', reminders: [], reminderAnchorTime: null, completedAt: null });
  });
});
