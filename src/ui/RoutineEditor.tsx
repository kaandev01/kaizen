import { useState } from 'preact/hooks';
import { showUnit } from '../core/format';
import { currentRevision } from '../core/plan';
import type { Routine } from '../core/routines';
import { MAX_TARGET } from '../core/validation';
import { ConfirmDialog, Icon, Sheet, Stepper } from './components';
import { useAppState, useStore } from './hooks';

interface DraftStep {
  id?: string;
  habitId: string;
  amount: number;
}

/**
 * `HabitEditor.tsx`'in Sheet+form+`ConfirmDialog` iskeletini izler. Adımlar
 * yalnızca `habitId`+`amount` taşır — ad/birim her zaman o anki `Habit`'ten
 * okunur (bkz. `core/routines.ts`).
 */
export function RoutineEditor({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const store = useStore();
  const { habits } = useAppState();
  const [name, setName] = useState(routine?.name ?? '');
  const [steps, setSteps] = useState<DraftStep[]>(routine?.steps.map((s) => ({ id: s.id, habitId: s.habitId, amount: s.amount })) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pickingHabit, setPickingHabit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const findHabit = (habitId: string) => habits.find((h) => h.id === habitId);
  const habitLabel = (habitId: string) => findHabit(habitId)?.name ?? '⚠ Silinmiş alışkanlık';
  const habitUnit = (habitId: string) => {
    const h = findHabit(habitId);
    if (!h) return undefined;
    const unit = currentRevision(h).unit;
    return showUnit(unit) ? unit : undefined;
  };
  const availableHabits = habits.filter((h) => !steps.some((s) => s.habitId === h.id));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  };
  const addStep = (habitId: string) => {
    setSteps([...steps, { habitId, amount: 1 }]);
    setPickingHabit(false);
  };
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index));
  const setStepAmount = (index: number, amount: number) => setSteps(steps.map((s, i) => (i === index ? { ...s, amount } : s)));

  const save = () => {
    try {
      if (routine) store.updateRoutine(routine.id, { name, steps });
      else store.addRoutine({ name, steps });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
  };

  return (
    <>
      <Sheet title={routine ? 'Rutini Düzenle' : 'Yeni Rutin'} onClose={onClose} tall action={{ label: 'Kaydet', onClick: save }}>
        <div class="form">
          <label class="field">
            <span class="label">Rutin adı</span>
            <input class="input" value={name} maxLength={40} placeholder="Örn. Sabah rutinim" onInput={(e) => setName(e.currentTarget.value)} />
          </label>

          <div class="field">
            <span class="label">Adımlar</span>
            {steps.length === 0 ? (
              <p class="hint">Henüz adım yok.</p>
            ) : (
              <ul class="category-list">
                {steps.map((s, i) => (
                  <li key={s.id ?? s.habitId} class="panel">
                    <div class="row between">
                      <span class="strong-text">{habitLabel(s.habitId)}</span>
                      <div class="row gap">
                        <button class="round-btn sm" aria-label="Yukarı taşı" disabled={i === 0} onClick={() => move(i, -1)}>
                          ▲
                        </button>
                        <button class="round-btn sm" aria-label="Aşağı taşı" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                          ▼
                        </button>
                        <button class="round-btn sm" aria-label="Adımı kaldır" onClick={() => removeStep(i)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                    <Stepper value={s.amount} min={1} max={MAX_TARGET} onChange={(v) => setStepAmount(i, v)} label={`${habitLabel(s.habitId)} miktarı`} suffix={habitUnit(s.habitId)} />
                  </li>
                ))}
              </ul>
            )}

            {pickingHabit ? (
              <div class="panel">
                {availableHabits.length === 0 ? (
                  <p class="hint">Eklenebilecek başka alışkanlık yok.</p>
                ) : (
                  <ul class="category-list">
                    {availableHabits.map((h) => (
                      <li key={h.id}>
                        <button class="setting link" onClick={() => addStep(h.id)}>
                          <span class="grow">{h.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button class="btn block" onClick={() => setPickingHabit(false)}>
                  Vazgeç
                </button>
              </div>
            ) : (
              <button class="text-btn strong" onClick={() => setPickingHabit(true)}>
                + Adım ekle
              </button>
            )}
          </div>

          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          {routine && (
            <button class="delete-link" onClick={() => setConfirmDelete(true)}>
              Rutini Sil
            </button>
          )}
        </div>
      </Sheet>
      {confirmDelete && routine && (
        <ConfirmDialog
          title={`“${routine.name}” silinsin mi?`}
          message="Bu rutin kalıcı olarak silinecek."
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteRoutine(routine.id);
            onClose();
          }}
        />
      )}
    </>
  );
}
