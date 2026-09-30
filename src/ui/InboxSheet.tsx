import { useState } from 'preact/hooks';
import type { DateKey } from '../core/dates';
import { formatFullDateTime } from '../core/dates';
import { activeInboxNotes, type InboxNote } from '../core/inbox';
import type { AgendaItem, Goal } from '../core/types';
import { AgendaEditor } from './AgendaEditor';
import { ConfirmDialog, Icon, Sheet } from './components';
import { GoalEditor } from './GoalEditor';
import { useAppState, useStore, useToday } from './hooks';

type ConvertMode = 'agenda' | 'goal' | 'journal' | null;

/**
 * Tür/tarih/kategori seçmeden bırakılan notların listesi + dönüştürme akışı.
 * Bir nota dokununca küçük bir aksiyon paneli açılır: düzenle, sil, ya da
 * üç türden birine dönüştür. İptal edilirse (ilgili editör `onSaved` ÇAĞIRMADAN
 * kapanırsa) not hiç değişmeden kalır.
 */
export function InboxSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { inboxNotes } = useAppState();
  const today = useToday();
  const notes = activeInboxNotes(inboxNotes);

  const [selected, setSelected] = useState<InboxNote | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [convertMode, setConvertMode] = useState<ConvertMode>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const closeConvert = () => {
    setConvertMode(null);
    setSelected(null);
  };

  const onAgendaSaved = (item: AgendaItem) => {
    if (selected) store.convertInboxNote(selected.id, { kind: 'agenda', id: item.id, targetUpdatedAtSnapshot: item.updatedAt });
    closeConvert();
  };
  const onGoalSaved = (goal: Goal) => {
    if (selected) store.convertInboxNote(selected.id, { kind: 'goal', id: goal.id, targetUpdatedAtSnapshot: goal.updatedAt });
    closeConvert();
  };
  const onJournalConverted = (entryId: string, updatedAt: number) => {
    if (selected) store.convertInboxNote(selected.id, { kind: 'journal', id: entryId, targetUpdatedAtSnapshot: updatedAt });
    closeConvert();
  };

  return (
    <>
      <Sheet title="Gelen Kutusu" onClose={onClose} closeLabel="Kapat">
        <div class="form">
          {notes.length === 0 ? (
            <p class="hint">Gelen kutusu boş.</p>
          ) : (
            <ul class="category-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <button class="setting link" onClick={() => setSelected(n)}>
                    <span class="grow">
                      <span class="strong-text">{n.text}</span>
                      <span class="muted small block">{formatFullDateTime(n.createdAt)}</span>
                    </span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {selected && convertMode === null && (
        <Sheet title="Not" onClose={() => setSelected(null)} closeLabel="Kapat">
          <div class="form">
            {editingText !== null ? (
              <>
                <label class="field">
                  <span class="label">Metin</span>
                  <textarea class="input journal-textarea" value={editingText} onInput={(e) => setEditingText(e.currentTarget.value)} />
                </label>
                <div class="row gap">
                  <button class="btn block" onClick={() => setEditingText(null)}>
                    Vazgeç
                  </button>
                  <button
                    class="btn primary block"
                    disabled={!editingText.trim()}
                    onClick={() => {
                      store.updateInboxNote(selected.id, editingText);
                      setEditingText(null);
                    }}
                  >
                    Kaydet
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{selected.text}</p>
                <div class="group">
                  <button class="setting link" onClick={() => setEditingText(selected.text)}>
                    <span class="grow">Düzenle</span>
                    <Icon name="pencil" size={18} />
                  </button>
                  <button class="setting link" onClick={() => setConvertMode('agenda')}>
                    <span class="grow">Yapılacak / Deadline'a dönüştür</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  <button class="setting link" onClick={() => setConvertMode('goal')}>
                    <span class="grow">Hedefe dönüştür</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  <button class="setting link" onClick={() => setConvertMode('journal')}>
                    <span class="grow">Günlüğe dönüştür</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </div>
                <button class="delete-link" onClick={() => setConfirmDelete(true)}>
                  Notu Sil
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}

      {selected && convertMode === 'agenda' && <AgendaEditor defaultDate={today} initialTitle={selected.text} onClose={closeConvert} onSaved={onAgendaSaved} />}
      {selected && convertMode === 'goal' && <GoalConvertEditor initialTitle={selected.text} onClose={closeConvert} onSaved={onGoalSaved} />}
      {selected && convertMode === 'journal' && <JournalConvertSheet note={selected} onClose={closeConvert} onConverted={onJournalConverted} />}

      {confirmDelete && selected && (
        <ConfirmDialog
          title="Not silinsin mi?"
          message="Bu not kalıcı olarak silinecek."
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteInboxNote(selected.id);
            setConfirmDelete(false);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}

/** Dönem bu fazda güncel aya sabitlenir — kullanıcı isterse sonradan Hedefler ekranından değiştirir. */
function GoalConvertEditor({ initialTitle, onClose, onSaved }: { initialTitle: string; onClose: () => void; onSaved: (goal: Goal) => void }) {
  const now = new Date();
  return <GoalEditor period={{ kind: 'month', year: now.getFullYear(), month: now.getMonth() + 1 }} initialTitle={initialTitle} onClose={onClose} onSaved={onSaved} />;
}

function JournalConvertSheet({ note, onClose, onConverted }: { note: InboxNote; onClose: () => void; onConverted: (entryId: string, updatedAt: number) => void }) {
  const store = useStore();
  const today = useToday();
  const [date, setDate] = useState<DateKey>(today);
  return (
    <Sheet
      title="Günlüğe Dönüştür"
      onClose={onClose}
      action={{
        label: 'Ekle',
        onClick: () => {
          const entry = store.addJournalEntry(date, note.text, 'typed');
          onConverted(entry.id, entry.updatedAt);
        },
      }}
    >
      <div class="form">
        <p class="hint">{note.text}</p>
        <label class="field">
          <span class="label">Tarih</span>
          <input class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
      </div>
    </Sheet>
  );
}
