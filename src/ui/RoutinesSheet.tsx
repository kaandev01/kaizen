import { useState } from 'preact/hooks';
import type { Routine } from '../core/routines';
import { Icon, Sheet } from './components';
import { RoutineEditor } from './RoutineEditor';
import { RoutineRunSheet } from './RoutineRunSheet';
import { useAppState, useStore, useToday } from './hooks';

/** `GoalsSheet`'in liste + "+ Ekle" desenini izler. */
export function RoutinesSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { routines, routineRun } = useAppState();
  const today = useToday();
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [running, setRunning] = useState(false);

  const sorted = [...routines].sort((a, b) => a.order - b.order);
  const isActiveToday = (r: Routine) => routineRun?.routineId === r.id && routineRun.date === today;

  const start = (r: Routine) => {
    if (!isActiveToday(r)) store.startRoutine(r.id);
    setRunning(true);
  };

  return (
    <>
      <Sheet title="Rutinler" onClose={onClose} closeLabel="Kapat">
        <div class="form">
          {sorted.length === 0 ? (
            <p class="hint">Henüz rutin yok. Alışkanlıklarını sıralı bir kontrol listesine dönüştür.</p>
          ) : (
            <div class="group">
              {sorted.map((r) => (
                <div key={r.id} class="row gap">
                  <button class="setting link grow" onClick={() => start(r)}>
                    <span class="grow">
                      <span class="strong-text">{r.name}</span>
                      <span class="muted small block">
                        {r.steps.length} adım{isActiveToday(r) ? ' · devam ediyor' : ''}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                  <button class="round-btn sm" aria-label={`"${r.name}" rutinini düzenle`} onClick={() => setEditing(r)}>
                    <Icon name="pencil" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button class="btn primary block" onClick={() => setEditing('new')}>
            + Rutin ekle
          </button>
        </div>
      </Sheet>

      {editing === 'new' && <RoutineEditor onClose={() => setEditing(null)} />}
      {editing && editing !== 'new' && <RoutineEditor routine={editing} onClose={() => setEditing(null)} />}
      {running && <RoutineRunSheet onClose={() => setRunning(false)} />}
    </>
  );
}
