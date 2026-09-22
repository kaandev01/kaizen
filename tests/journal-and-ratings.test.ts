import { describe, expect, it } from 'vitest';
import { isValidRating, validateJournalText } from '../src/core/validation';
import { FakeClock, makeStore } from './helpers';

describe('günlük (journal)', () => {
  it('aynı güne birden fazla not eklenebilir; her biri ayrı düzenlenir/silinir', async () => {
    const clock = new FakeClock(2026, 9, 21, 9, 0);
    const { store, storage } = await makeStore(clock);
    const a = store.addJournalEntry('2026-09-21', 'Sabah koşu yaptım', 'typed');
    const b = store.addJournalEntry('2026-09-21', 'Akşam kitap okudum', 'speech');
    await store.flush();
    expect(store.getState().journal.filter((e) => e.date === '2026-09-21')).toHaveLength(2);
    expect((await storage.load()).journal).toHaveLength(2);

    store.updateJournalEntry(a.id, 'Sabah 5km koştum');
    expect(store.getState().journal.find((e) => e.id === a.id)?.text).toBe('Sabah 5km koştum');
    expect(store.getState().journal.find((e) => e.id === a.id)?.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);

    store.deleteJournalEntry(b.id);
    await store.flush();
    expect(store.getState().journal).toHaveLength(1);
    expect((await storage.load()).journal).toHaveLength(1);
  });

  it('başka bir güne eklenen not bu günü etkilemez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    store.addJournalEntry('2026-09-20', 'dün', 'typed');
    store.addJournalEntry('2026-09-21', 'bugün', 'typed');
    expect(store.getState().journal.filter((e) => e.date === '2026-09-21')).toHaveLength(1);
  });

  it('boş metin reddedilir; mevcut kayıtlar bozulmaz', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(validateJournalText('   ')).not.toBeNull();
    expect(() => store.addJournalEntry('2026-09-21', '   ', 'typed')).toThrow();
    expect(store.getState().journal).toHaveLength(0);
  });

  it('yeniden açılışta korunur', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const storage = (await makeStore(clock)).storage;
    const a = await makeStore(clock, storage);
    a.store.addJournalEntry('2026-09-21', 'test notu', 'typed');
    await a.store.flush();
    const b = await makeStore(clock, storage);
    expect(b.store.getState().journal).toHaveLength(1);
    expect(b.store.getState().journal[0].text).toBe('test notu');
  });
});

describe('gün puanı', () => {
  it('1..10 dışı puan reddedilir', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(11)).toBe(false);
    expect(isValidRating(5.5)).toBe(false);
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(10)).toBe(true);
  });

  it('girilmemiş gün için kayıt hiç oluşturulmaz (0 yazılmaz)', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(store.getState().ratings['2026-09-21']).toBeUndefined();
  });

  it('bir gün için tek puan; sonradan değiştirilebilir ve temizlenebilir', async () => {
    const clock = new FakeClock(2026, 9, 21);
    const { store, storage } = await makeStore(clock);
    store.setRating('2026-09-21', 7);
    expect(store.getState().ratings['2026-09-21'].score).toBe(7);
    store.setRating('2026-09-21', 9); // değiştir
    expect(store.getState().ratings['2026-09-21'].score).toBe(9);
    await store.flush();
    expect((await storage.load()).ratings).toEqual([{ date: '2026-09-21', score: 9, updatedAt: expect.any(Number) }]);

    store.setRating('2026-09-21', null); // temizle
    expect(store.getState().ratings['2026-09-21']).toBeUndefined();
    await store.flush();
    expect((await storage.load()).ratings).toHaveLength(0);
  });

  it('aynı günün birden fazla notu olsa da gün puanı ortaktır', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    store.addJournalEntry('2026-09-21', 'birinci not', 'typed');
    store.addJournalEntry('2026-09-21', 'ikinci not', 'typed');
    store.setRating('2026-09-21', 8);
    expect(store.getState().journal).toHaveLength(2);
    expect(Object.keys(store.getState().ratings)).toEqual(['2026-09-21']);
  });

  it('geçersiz puan atanmaya çalışılırsa hata verir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 21));
    expect(() => store.setRating('2026-09-21', 11)).toThrow();
  });
});
