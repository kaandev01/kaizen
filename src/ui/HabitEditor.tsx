import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { dayShort } from '../core/dates';
import { currentRevision } from '../core/plan';
import { isValidTime } from '../core/reminders';
import type { Habit, Schedule } from '../core/types';
import { MAX_TARGET, validateHabitInput, type HabitInput } from '../core/validation';
import { ConfirmDialog, Icon, Segmented, Sheet, Switch } from './components';
import { useStore } from './hooks';
import { DEFAULT_HABIT_ICON } from './icons';
import { cancelHabitNotifications, isIOS, isStandalone, notificationState, requestNotificationPermission, type PermState } from './platform';

export const COLORS = ['#5a4bcf', '#2e9d63', '#b7832f', '#8f7ae8', '#d9534f', '#1f8fb5', '#d6409f', '#64748b'];
const UNITS = ['kez', 'bardak', 'sayfa', 'dk'];
/** Gün daireleri: Pazartesi..Pazar baş harfleri. */
const DAY_INITIAL = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

export function scheduleSummary(s: Schedule): string {
  if (s.kind === 'daily' || s.days.length === 7) return 'Her gün';
  return s.days.map(dayShort).join(' · ');
}

export function HabitEditor({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const store = useStore();
  const rev = habit ? currentRevision(habit) : undefined;

  const [name, setName] = useState(habit?.name ?? '');
  // Sembol seçimi arayüzden kaldırıldı (sadeleştirme); alan veri modelinde
  // kalır ve mevcut kayıtların değeri korunur, yalnızca gösterilmez/değiştirilmez.
  const icon = habit?.icon ?? DEFAULT_HABIT_ICON;
  const [color, setColor] = useState(habit?.color ?? COLORS[0]);
  const [target, setTarget] = useState(String(rev?.target ?? 1));
  const initialUnit = rev?.unit ?? 'kez';
  const [unitChoice, setUnitChoice] = useState(UNITS.includes(initialUnit) ? initialUnit : 'özel');
  const [customUnit, setCustomUnit] = useState(UNITS.includes(initialUnit) ? '' : initialUnit);
  const [scheduleKind, setScheduleKind] = useState<'daily' | 'weekdays'>(rev?.schedule.kind ?? 'daily');
  const [days, setDays] = useState<number[]>(rev?.schedule.kind === 'weekdays' ? rev.schedule.days : [1, 2, 3, 4, 5]);
  const [remindersOn, setRemindersOn] = useState((habit?.reminders.length ?? 0) > 0);
  const [times, setTimes] = useState<string[]>(habit?.reminders ?? []);
  const [perm, setPerm] = useState<PermState>(notificationState());
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const unit = unitChoice === 'özel' ? customUnit : unitChoice;
  const targetNum = /^\d+$/.test(target.trim()) ? parseInt(target, 10) : NaN;

  const input = (): HabitInput => ({
    name,
    icon,
    color,
    target: targetNum,
    unit,
    schedule: scheduleKind === 'daily' ? { kind: 'daily' } : { kind: 'weekdays', days },
    reminders: remindersOn ? times.filter(isValidTime) : [],
  });

  const save = () => {
    const err = validateHabitInput(input());
    if (err) return setError(err);
    try {
      if (habit) {
        store.updateHabit(habit.id, input());
        void cancelHabitNotifications(habit.id); // eski bildirimler yeni plana göre yeniden hesaplanır
      } else store.addHabit(input());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
  };

  const stepTarget = (d: number) => setTarget(String(Math.min(MAX_TARGET, Math.max(1, (Number.isNaN(targetNum) ? 1 : targetNum) + d))));
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));

  // İzin, kullanıcı hatırlatmayı etkinleştirirken istenir.
  const toggleReminders = async (on: boolean) => {
    setRemindersOn(on);
    if (!on) return;
    if (times.length === 0) setTimes(['09:00']);
    if (notificationState() === 'default') setPerm(await requestNotificationPermission());
  };
  const addTime = () =>
    setTimes((t) => {
      const last = t[t.length - 1];
      const next = last && isValidTime(last) ? `${String(Math.min(23, parseInt(last, 10) + 2)).padStart(2, '0')}:${last.slice(3)}` : '09:00';
      return [...t, next];
    });

  return (
    <>
      <Sheet title={habit ? 'Alışkanlığı Düzenle' : 'Yeni Alışkanlık'} onClose={onClose} tall action={{ label: 'Kaydet', onClick: save }}>
        <div class="form">
          <label class="field">
            <span class="label">Alışkanlık Adı</span>
            <span class="input-wrap">
              <input class="input" value={name} maxLength={40} placeholder="Örn. Su iç" onInput={(e) => setName(e.currentTarget.value)} />
              {name && (
                <button class="input-clear" aria-label="Adı temizle" onClick={() => setName('')}>
                  <Icon name="xCircle" size={20} />
                </button>
              )}
            </span>
          </label>

          <div class="panel">
            <span class="label" id="color-l">Tema Tonu</span>
            <div class="color-row" role="radiogroup" aria-labelledby="color-l">
              {COLORS.map((c, idx) => (
                <button key={c} role="radio" aria-checked={color === c} aria-label={`Renk ${idx + 1}`} class={`dot-btn ${color === c ? 'on' : ''}`} style={{ '--c': c } as JSX.CSSProperties} onClick={() => setColor(c)}>
                  <span class="dot-fill" />
                </button>
              ))}
            </div>
          </div>

          <div class="panel">
            <span class="label">Hedef Miktar ve Birim</span>
            <div class="target-row">
              <button class="round-btn" aria-label="Hedefi azalt" disabled={targetNum <= 1} onClick={() => stepTarget(-1)}>
                <Icon name="minus" size={20} />
              </button>
              <div class="target-val">
                <input
                  class="target-input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label="Günlük hedef"
                  value={target}
                  onFocus={(e) => e.currentTarget.select()}
                  onInput={(e) => setTarget(e.currentTarget.value)}
                />
                <span class="target-unit">{unit || 'birim'}</span>
              </div>
              <button class="round-btn" aria-label="Hedefi artır" onClick={() => stepTarget(1)}>
                <Icon name="plus" size={20} />
              </button>
            </div>
            <div class="chips" role="radiogroup" aria-label="Birim">
              {[...UNITS, 'özel'].map((u) => (
                <button key={u} role="radio" aria-checked={unitChoice === u} class={`chip ${unitChoice === u ? 'on' : ''}`} onClick={() => setUnitChoice(u)}>
                  {u === 'özel' ? 'Özel' : u}
                </button>
              ))}
            </div>
            {unitChoice === 'özel' && <input class="input" aria-label="Özel birim" placeholder="Örn. km, ml" maxLength={16} value={customUnit} onInput={(e) => setCustomUnit(e.currentTarget.value)} />}
          </div>

          <div class="panel">
            <span class="label">Tekrar Sıklığı</span>
            <Segmented
              label="Tekrar sıklığı"
              value={scheduleKind}
              onChange={setScheduleKind}
              options={[
                { value: 'daily', label: 'Her Gün' },
                { value: 'weekdays', label: 'Seçili Günler' },
              ]}
            />
            {scheduleKind === 'weekdays' && (
              <div class="days" role="group" aria-label="Haftanın günleri">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button key={d} aria-pressed={days.includes(d)} aria-label={dayShort(d)} class={`day ${days.includes(d) ? 'on' : ''}`} onClick={() => toggleDay(d)}>
                    {DAY_INITIAL[d - 1]}
                  </button>
                ))}
              </div>
            )}
            {habit && <p class="hint">Hedef ve tekrar değişiklikleri bugünden itibaren geçerli olur; geçmiş günler eski düzenle korunur.</p>}
          </div>

          <div class="panel">
            <div class="row between">
              <span class="label">Hatırlatıcı</span>
              <Switch label="Hatırlatıcı" checked={remindersOn} onChange={toggleReminders} />
            </div>
            {remindersOn && (
              <>
                <div class="times">
                  {times.map((t, i) => (
                    <span class="time-pill" key={i}>
                      <Icon name="clock" size={16} />
                      <input type="time" aria-label={`Hatırlatma saati ${i + 1}`} value={t} onInput={(e) => setTimes((cur) => cur.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
                      <button aria-label={`${t} hatırlatmasını kaldır`} onClick={() => setTimes((cur) => cur.filter((_, j) => j !== i))}>
                        <Icon name="x" size={16} />
                      </button>
                    </span>
                  ))}
                  <button class="add-time" onClick={addTime}>
                    <Icon name="plus" size={16} /> Saat Ekle
                  </button>
                </div>
                <PermissionNote perm={perm} />
              </>
            )}
          </div>

          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}

          {habit && (
            <button class="delete-link" onClick={() => setConfirmDelete(true)}>
              Alışkanlığı Sil
            </button>
          )}
        </div>
      </Sheet>

      {confirmDelete && habit && (
        <ConfirmDialog
          title={`“${habit.name}” silinsin mi?`}
          message={
            <>
              Bu alışkanlığa ait <b>tüm günlük kayıtlar ve seri kalıcı olarak silinir</b>. Bekleyen hatırlatmaları iptal edilir. Bu işlem geri alınamaz.
            </>
          }
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteHabit(habit.id);
            void cancelHabitNotifications(habit.id);
            onClose();
          }}
        />
      )}
    </>
  );
}

export function PermissionNote({ perm }: { perm: PermState }) {
  if (perm === 'granted') return <p class="hint">Bildirim izni verildi.</p>;
  if (perm === 'denied')
    return (
      <p class="hint warn">
        Bildirim izni kapalı; uygulama yine de kullanılabilir. {isIOS() ? 'iPhone’da Ayarlar → Bildirimler → Kaizen bölümünden izni açabilirsin.' : 'Tarayıcı site ayarlarından izni açabilirsin.'}
      </p>
    );
  if (perm === 'unsupported')
    return (
      <p class="hint warn">
        {isIOS() && !isStandalone() ? 'iPhone’da bildirim için uygulamayı Paylaş → “Ana Ekrana Ekle” ile ekleyip oradan açmalısın.' : 'Bu tarayıcı bildirimleri desteklemiyor.'}
      </p>
    );
  return <p class="hint">Hatırlatıcıyı açtığında bildirim izni istenir.</p>;
}
