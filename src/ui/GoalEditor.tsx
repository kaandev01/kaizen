import { useState } from 'preact/hooks';
import { formatGoalPeriod } from '../core/goals';
import type { Goal, GoalPeriod, GoalStatus } from '../core/types';
import { validateGoalInput, type GoalInput } from '../core/validation';
import { ConfirmDialog, Segmented, Sheet } from './components';
import { useStore } from './hooks';

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'active', label: 'Devam Ediyor' },
  { value: 'done', label: 'Tamamlandı' },
  { value: 'abandoned', label: 'Vazgeçildi' },
];

export function GoalEditor({ goal, period, onClose }: { goal?: Goal; period: GoalPeriod; onClose: () => void }) {
  const store = useStore();
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'active');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effectivePeriod = goal?.period ?? period;

  const save = () => {
    const input: GoalInput = { title, description };
    const err = validateGoalInput(input);
    if (err) return setError(err);
    try {
      if (goal) {
        store.updateGoal(goal.id, input, effectivePeriod);
        if (goal.status !== status) store.setGoalStatus(goal.id, status);
      } else {
        store.addGoal(input, effectivePeriod);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
  };

  return (
    <>
      <Sheet title={goal ? 'Hedefi Düzenle' : 'Yeni Hedef'} onClose={onClose} action={{ label: 'Kaydet', onClick: save }}>
        <div class="form">
          <p class="hint">Dönem: {formatGoalPeriod(effectivePeriod)}</p>
          <label class="field">
            <span class="label">Başlık</span>
            <input class="input" value={title} maxLength={80} placeholder="Örn. Haftada 3 gün spor" onInput={(e) => setTitle(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span class="label">Açıklama (isteğe bağlı)</span>
            <textarea class="input journal-textarea" maxLength={1000} value={description} onInput={(e) => setDescription(e.currentTarget.value)} />
          </label>
          {goal && (
            <div class="field">
              <span class="label">Durum</span>
              <Segmented class="wide" label="Durum" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </div>
          )}
          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          {goal && (
            <button class="delete-link" onClick={() => setConfirmDelete(true)}>
              Hedefi Sil
            </button>
          )}
        </div>
      </Sheet>
      {confirmDelete && goal && (
        <ConfirmDialog
          title={`“${goal.title}” silinsin mi?`}
          message="Bu hedef kalıcı olarak silinecek."
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.deleteGoal(goal.id);
            onClose();
          }}
        />
      )}
    </>
  );
}
