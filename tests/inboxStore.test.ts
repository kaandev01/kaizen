import { describe, expect, it } from 'vitest';
import { activeInboxNotes } from '../src/core/inbox';
import { FakeClock, makeStore } from './helpers';

describe('Gelen kutusu (Store)', () => {
  it('boş metin reddedilir', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    expect(() => store.addInboxNote('   ')).toThrow();
  });

  it('ekleme/düzenleme/silme kalıcıdır', async () => {
    const clock = new FakeClock(2026, 9, 29, 9, 0);
    const { store, storage } = await makeStore(clock);
    const { item: created, saved } = store.addInboxNote('Kitap al');
    expect(await saved).toBe(true);
    expect(store.getState().inboxNotes).toHaveLength(1);
    expect((await storage.load()).inboxNotes).toHaveLength(1);

    store.updateInboxNote(created.id, 'Kitap ve defter al');
    expect(store.getState().inboxNotes[0].text).toBe('Kitap ve defter al');

    store.deleteInboxNote(created.id);
    await store.flush();
    expect(store.getState().inboxNotes).toHaveLength(0);
    expect((await storage.load()).inboxNotes).toHaveLength(0);
  });

  it('convertInboxNote sonrası not aktif listeden çıkar ama satır silinmez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const { item: note } = store.addInboxNote('Diş randevusu al');
    store.convertInboxNote(note.id, { kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });

    expect(store.getState().inboxNotes).toHaveLength(1); // satır hâlâ var
    expect(activeInboxNotes(store.getState().inboxNotes)).toHaveLength(0); // ama aktif listede değil
    expect(store.getState().inboxNotes[0].convertedTo).toEqual({ kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });
  });

  it('convertInboxNote İKİNCİ kez çağrılırsa (tekrar deneme) NO-OP\'tur — ikinci bir hedef kayıt oluşturmaz', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const { item: note } = store.addInboxNote('Diş randevusu al');
    store.convertInboxNote(note.id, { kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });
    // Retry simülasyonu: aynı çağrı farklı bir hedef id'yle bile tekrarlansa ilk dönüşüm korunur.
    store.convertInboxNote(note.id, { kind: 'agenda', id: 'agenda-2', targetUpdatedAtSnapshot: 200 });

    expect(store.getState().inboxNotes[0].convertedTo).toEqual({ kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });
  });

  it('undoConvertInboxNote notu geri getirir ve hangi hedefin silineceğini doğru döner', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const { item: note } = store.addInboxNote('Diş randevusu al');
    store.convertInboxNote(note.id, { kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });

    const undone = store.undoConvertInboxNote(note.id);
    expect(undone).toEqual({ kind: 'agenda', id: 'agenda-1', targetUpdatedAtSnapshot: 100 });
    expect(store.getState().inboxNotes[0].convertedTo).toBeNull();
    expect(activeInboxNotes(store.getState().inboxNotes)).toHaveLength(1); // tekrar aktif listede
  });

  it('dönüştürülmemiş bir notta undoConvertInboxNote null döner, hiçbir şeyi değiştirmez', async () => {
    const { store } = await makeStore(new FakeClock(2026, 9, 29));
    const { item: note } = store.addInboxNote('Kitap al');
    expect(store.undoConvertInboxNote(note.id)).toBeNull();
    expect(store.getState().inboxNotes[0].convertedTo).toBeNull();
  });

  it('kalıcı yazma başarısız olursa iyimser eklenen not otomatik geri alınır', async () => {
    const { MemoryStorage } = await import('../src/storage/storage');
    const storage = new MemoryStorage();
    const originalPut = storage.putInboxNote.bind(storage);
    let fail = false;
    storage.putInboxNote = (n) => (fail ? Promise.reject(new Error('disk dolu')) : originalPut(n));
    const { store } = await makeStore(new FakeClock(2026, 9, 29), storage);

    fail = true;
    const { item: created, saved } = store.addInboxNote('Bir şey');
    expect(store.getState().inboxNotes.some((n) => n.id === created.id)).toBe(true); // anında (iyimser) görünür
    expect(await saved).toBe(false);
    expect(store.getState().inboxNotes.some((n) => n.id === created.id)).toBe(false); // sonra geri alınır
  });
});
