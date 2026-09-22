import { useRef, useState } from 'preact/hooks';
import { REMINDER_OFFSET_LABEL, reminderPreview } from '../core/agenda';
import type { DateKey } from '../core/dates';
import type { AgendaImportance, AgendaItem, AgendaKind, AgendaReminder, ReminderOffsetKind } from '../core/types';
import { validateAgendaInput, type AgendaInput } from '../core/validation';
import { ConfirmDialog, Icon, Segmented, Sheet, Switch } from './components';
import { useStore } from './hooks';
import { cancelAgendaNotifications, notificationState, requestNotificationPermission, type PermState } from './platform';
import { PermissionNote } from './HabitEditor';

const KIND_OPTIONS: { value: AgendaKind; label: string }[] = [
  { value: 'deadline', label: 'Teslim' },
  { value: 'exam', label: 'Sınav' },
  { value: 'todo', label: 'Yapılacak' },
  { value: 'other', label: 'Diğer' },
];
const IMPORTANCE_OPTIONS: { value: AgendaImportance; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Önemli' },
  { value: 'critical', label: 'Kritik' },
];
const TOGGLE_KINDS: Exclude<ReminderOffsetKind, 'custom'>[] = ['1w', '1d', '1h', 'exact'];

export function AgendaEditor({ item, defaultDate, onClose, onSaved }: { item?: AgendaItem; defaultDate: DateKey; onClose: () => void; onSaved?: (item: AgendaItem) => void }) {
  const store = useStore();
  const [title, setTitle] = useState(item?.title ?? '');
  const [kind, setKind] = useState<AgendaKind>(item?.kind ?? 'todo');
  const [date, setDate] = useState<DateKey>(item?.date ?? defaultDate);
  const [allDay, setAllDay] = useState(item ? item.time === null : true);
  const [time, setTime] = useState(item?.time ?? '09:00');
  const [importance, setImportance] = useState<AgendaImportance>(item?.importance ?? 'normal');
  const [description, setDescription] = useState(item?.description ?? '');
  // Boş başlar (gizlice bir saat varsayılmaz) — kullanıcı offset tabanlı bir
  // hatırlatma eklediğinde saati AÇIKÇA seçmesi gerekir (bkz. validateAgendaInput).
  const [reminderAnchorTime, setReminderAnchorTime] = useState(item?.reminderAnchorTime ?? '');
  const [reminders, setReminders] = useState<AgendaReminder[]>(item?.reminders ?? []);
  const [customDate, setCustomDate] = useState(item?.date ?? defaultDate);
  const [customTime, setCustomTime] = useState('09:00');
  const [perm, setPerm] = useState<PermState>(notificationState());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // React/Preact state güncellemeleri eşzamanlı DEĞİLDİR: aynı JS turunda arka arkaya
  // gelen iki tıklama, `saving` state'i henüz yeniden render edilmeden ikisi de eski
  // (false) değeri görebilir. Bu yüzden gerçek koruma bu senkron ref ile yapılır;
  // `saving` state'i yalnızca düğmenin görünümü (metin/disabled) içindir.
  const savingRef = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasKind = (k: ReminderOffsetKind) => reminders.some((r) => r.kind === k);
  const customReminder = reminders.find((r) => r.kind === 'custom');

  const input = (): AgendaInput => ({
    title,
    kind,
    date,
    time: allDay ? null : time,
    description,
    importance,
    reminders,
    reminderAnchorTime: allDay && reminderAnchorTime ? reminderAnchorTime : null,
  });

  // İzin, kullanıcı ilk hatırlatmayı eklerken istenir.
  const toggleOffset = async (k: Exclude<ReminderOffsetKind, 'custom'>) => {
    if (hasKind(k)) {
      setReminders((r) => r.filter((x) => x.kind !== k));
      return;
    }
    if (notificationState() === 'default') setPerm(await requestNotificationPermission());
    setReminders((r) => [...r, { id: store_genId(), kind: k }]);
  };
  const toggleCustom = async () => {
    if (customReminder) {
      setReminders((r) => r.filter((x) => x.id !== customReminder.id));
      return;
    }
    if (notificationState() === 'default') setPerm(await requestNotificationPermission());
    setReminders((r) => [...r, { id: store_genId(), kind: 'custom', customDate, customTime }]);
  };
  // Özel hatırlatmanın tarih/saati değişince ilgili kaydı güncel tut.
  const updateCustom = (nextDate: string, nextTime: string) => {
    setCustomDate(nextDate);
    setCustomTime(nextTime);
    setReminders((r) => r.map((x) => (x.kind === 'custom' ? { ...x, customDate: nextDate, customTime: nextTime } : x)));
  };

  const save = async () => {
    if (savingRef.current) return; // çift dokunma aynı kaydı iki kez oluşturmasın (senkron koruma)
    const err = validateAgendaInput(input());
    if (err) return setError(err);
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const { item: result, saved } = item ? store.updateAgendaItem(item.id, input()) : store.addAgendaItem(input());
      const ok = await saved;
      if (!ok) {
        setError('Kaydedilemedi: cihaza yazılamadı. Girdiklerin korunuyor, tekrar deneyebilirsin.');
        savingRef.current = false;
        setSaving(false);
        return; // panel KAPANMAZ, form verisi KORUNUR
      }
      if (item) void cancelAgendaNotifications(item.id); // eski hatırlatmalar iptal, yeni plan bir sonraki turda hesaplanır
      onSaved?.(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
      savingRef.current = false;
      setSaving(false);
    }
  };

  const draft: Pick<AgendaItem, 'date' | 'time' | 'reminderAnchorTime' | 'reminders'> = {
    date,
    time: allDay ? null : time,
    reminderAnchorTime: allDay && reminderAnchorTime ? reminderAnchorTime : null,
    reminders,
  };
  const preview = reminderPreview(draft as AgendaItem, new Date());
  const anyPast = preview.some((p) => p.past);
  const needsAnchor = allDay && reminders.some((r) => r.kind !== 'custom') && !reminderAnchorTime;

  return (
    <>
      <Sheet title={item ? 'Kaydı Düzenle' : 'Yeni Kayıt'} onClose={onClose} action={{ label: saving ? 'Kaydediliyor…' : 'Kaydet', onClick: save, disabled: saving }}>
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

          <div class="field">
            <span class="label" id="imp-l">Önem</span>
            <Segmented class="wide" label="Önem" value={importance} onChange={setImportance} options={IMPORTANCE_OPTIONS} />
            <p class="hint">Önem senin belirlediğin öncelik; kalan süre (aciliyet) ayrıca ve otomatik hesaplanır.</p>
          </div>

          <label class="field">
            <span class="label">Not (isteğe bağlı)</span>
            <textarea class="input journal-textarea" maxLength={1000} value={description} onInput={(e) => setDescription(e.currentTarget.value)} />
          </label>

          <div class="panel">
            <span class="label">Hatırlatmalar</span>
            <div class="chips">
              {TOGGLE_KINDS.map((k) => (
                <button key={k} class={`chip ${hasKind(k) ? 'on' : ''}`} onClick={() => toggleOffset(k)}>
                  {REMINDER_OFFSET_LABEL[k]}
                </button>
              ))}
              <button class={`chip ${customReminder ? 'on' : ''}`} onClick={toggleCustom}>
                {REMINDER_OFFSET_LABEL.custom}
              </button>
            </div>
            {customReminder && (
              <div class="row gap">
                <input class="input" type="date" value={customDate} onInput={(e) => updateCustom(e.currentTarget.value, customTime)} />
                <input class="input time-input" type="time" value={customTime} onInput={(e) => updateCustom(customDate, e.currentTarget.value)} />
              </div>
            )}
            {allDay && reminders.some((r) => r.kind !== 'custom') && (
              <label class="row gap">
                <span class="muted">Hatırlatma saati</span>
                <input class="input time-input" type="time" value={reminderAnchorTime} onInput={(e) => setReminderAnchorTime(e.currentTarget.value)} />
              </label>
            )}
            {needsAnchor && <p class="error">Tüm günlük kayıtta hatırlatma için bir saat seç — gece yarısı varsayılmaz.</p>}
            {anyPast && <p class="hint warn">Bazı hatırlatmalar geçmişte kalıyor; bunlar planlanmayacak.</p>}
            {reminders.length > 0 && <PermissionNote perm={perm} />}
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
          message="Bu kayıt kalıcı olarak silinecek ve bekleyen hatırlatmaları iptal edilecek."
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

// Bileşen dışı, bağımsız kimlik üretici — formda seçilen hatırlatmalara geçici id vermek için.
let counter = 0;
function store_genId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID ? c.randomUUID() : `tmp-${Date.now()}-${counter++}`;
}

