/**
 * Hızlı yakalama: tür/tarih/kategori seçmeden anında bir not bırakıp
 * SONRADAN yapılacak/deadline, günlük notu ya da hedefe dönüştürme. Elle
 * silme diğer tüm koleksiyonlarla aynı desendedir (yerelde hard delete,
 * sunucuda tombstone — bkz. `Store.deleteInboxNote`). Dönüşüm SİLMEZ —
 * kaynak not `convertedTo` ile işaretlenir, böylece güvenle geri alınabilir.
 */
export interface InboxNoteConversion {
  kind: 'agenda' | 'journal' | 'goal';
  /** Oluşturulan hedef kaydın id'si. */
  id: string;
  /** Dönüşüm anındaki hedef kaydın `updatedAt`'i — sonradan değişip değişmediğini
   * anlamak için (`undoConvertInboxNote`, sessizce silmek yerine açık onay ister). */
  targetUpdatedAtSnapshot: number;
}

export interface InboxNote {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  /** null = henüz işlenmedi (aktif gelen kutusunda görünür). */
  convertedTo: InboxNoteConversion | null;
}

/** Aktif gelen kutusu: henüz dönüştürülmemiş notlar, en yeni önce. */
export function activeInboxNotes(notes: InboxNote[]): InboxNote[] {
  return notes.filter((n) => !n.convertedTo).sort((a, b) => b.createdAt - a.createdAt);
}
