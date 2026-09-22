import { useState } from 'preact/hooks';
import type { DateKey } from '../core/dates';
import { isValidTime } from '../core/reminders';
import type { AgendaItem, AgendaKind } from '../core/types';
import { validateAgendaInput, type AgendaInput } from '../core/validation';
import { ConfirmDialog, Icon, Segmented, Sheet, Switch } from './components';
import { useStore } from './hooks';
import { cancelAgendaNotifications } from './platform';

const KIND_OPTIONS: { value: AgendaKind; label: string }[] = [
  { value: 'deadline', label: 'Teslim' },
  { value: 'exam', label: 'Sınav' },
  { value: 'todo', label: 'Yapılacak' },
  { value: 'other', label: 'Diğer' },
];

export function AgendaEditor({ item, defaultDate, onClose }: { item?: AgendaItem; defaultDate: DateKey; onClose: () => void }) {
  const store = useStore();
  const [title, setTitle] = useState(item?.title ?? '');
  const [kind, setKind] = useState<AgendaKind>(item?.kind ?? 'todo');
  const [date, setDate] = useState<DateKey>(item?.date ?? defaultDate);
  const [allDay, setAllDay] = useState(item ? item.time === null : true);
  const [time, setTime] = useState(item?.time ?? '09:00');
  const [description, setDescription] = useState(item?.description ?? '');
  const [reminderOn, setReminderOn] = useState(!!item?.reminder);
  const [reminder, setReminder] = useState(item?.reminder ?? '09:00');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const input = (): AgendaInput => ({
    title,
    kind,
    date,
    time: allDay ? null : time,
    description,
    reminder: reminderOn && isValidTime(reminder) ? reminder : null,
  });

  const save = () => {
    const err = validateAgendaInput(input());
    if (err) return setError(err);
    try {
      if (item) {
        store.updateAgendaItem(item.id, input());
        void cancelAgendaNotifications(item.id); // eski bildirim iptal; yeni plan bir sonraki turda hesaplanır
      } else {
        store.addAgendaItem(input());
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
  };

  return (
    <>
      <Sheet title={item ? 'Kaydı Düzenle' : 'Yeni Kayıt'} onClose={onClose} action={{ label: 'Kaydet', onClick: save }}>
        <div class="form">
          <label class="field">
            <span class="label">Başlık</span>
            <input class="input" value={title} maxLength={80} placeholder="Örn. Matematik sınavı" onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>

          <div class="field">
            <span class="label" id="kind-l">Tür</span>
            <Segmented class="wide" label="Tür" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          </div>

          <div class="field">
            <span class="label">Tarih</span>
            <input class="input" type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          </div>

          <div class="panel">
            <div class="row between">
              <span class="label">Tüm gün</span>
              <Switch label="Tüm gün" checked={allDay} onChange={setAllDay} />
            </div>
            {!allDay && (
              <label class="row gap">
                <span class="muted">Saat</span>
                <input class="input time-input" type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} />
              </label>
            )}
          </div>

          <label class="field">
            <span class="label">Açıklama (isteğe bağlı)</span>
            <textarea class="input journal-textarea" maxLength={1000} value={description} onInput={(e) => setDescription(e.currentTarget.value)} />
          </label>

          <div class="panel">
            <div class="row between">
              <span class="label">Hatırlatıcı</span>
              <Switch label="Hatırlatıcı" checked={reminderOn} onChange={setReminderOn} />
            </div>
            {reminderOn && (
              <label class="row gap">
                <span class="muted">Saat</span>
                <input class="input time-input" type="time" value={reminder} onInput={(e) => setReminder(e.currentTarget.value)} />
              </label>
            )}
          </div>

          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}

          {item && (
            <>
              <button class="setting" onClick={() => store.setAgendaDone(item.id, !item.done)}>
                <span class="grow">{item.done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'}</span>
                <Icon name="check" size={18} />
              </button>
              <button class="delete-link" onClick={() => setConfirmDelete(true)}>
                Kaydı Sil
              </button>
            </>
          )}
        </div>
      </Sheet>

      {confirmDelete && item && (
        <ConfirmDialog
          title={`“${item.title}” silinsin mi?`}
          message="Bu kayıt kalıcı olarak silinecek ve bekleyen hatırlatması iptal edilecek."
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteAgendaItem(item.id);
            void cancelAgendaNotifications(item.id);
            onClose();
          }}
        />
      )}
    </>
  );
}
