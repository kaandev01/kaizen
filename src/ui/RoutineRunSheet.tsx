import { showUnit } from '../core/format';
import { currentRevision, planFor } from '../core/plan';
import { amountOf } from '../core/progress';
import { routineSummary } from '../core/routines';
import { Sheet } from './components';
import { useAppState, useStore } from './hooks';
import { haptic } from './platform';

/**
 * Rutini çalıştırırken açık kalan, tek adımı gösteren sade ekran. `Store`'un
 * mutasyonları senkron olduğundan (bir tıklama tamamen bitmeden ikincisi
 * işlenmez) çift dokunmaya karşı ayrı bir kilide gerek yok — art arda iki
 * tıklama her zaman SIRADAKİ adıma denk gelir, aynı adımı iki kez uygulamaz.
 */
export function RoutineRunSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { routines, routineRun, habits, logs, settings } = useAppState();

  if (!routineRun) return null;
  const routine = routines.find((r) => r.id === routineRun.routineId);

  const finish = () => {
    store.finishRoutine();
    onClose();
  };

  if (!routine) {
    return (
      <Sheet title="Rutin" onClose={finish} closeLabel="Kapat">
        <p class="hint">Bu rutin artık mevcut değil.</p>
      </Sheet>
    );
  }

  const done = routineRun.currentIndex >= routineRun.stepOrder.length;
  if (done) {
    const summary = routineSummary(routineRun);
    return (
      <Sheet title={routine.name} onClose={finish} closeLabel="Kapat">
        <div class="form">
          <p class="success-text">
            {summary.total} adımdan {summary.completed}'i tamamlandı.
          </p>
          <button class="btn primary block" onClick={finish}>
            Kapat
          </button>
        </div>
      </Sheet>
    );
  }

  const skip = () => {
    store.skipRoutineStep();
    haptic('tap', settings.haptics);
  };
  const undo = () => {
    store.undoLastRoutineStep();
    haptic('tap', settings.haptics);
  };

  const stepId = routineRun.stepOrder[routineRun.currentIndex];
  const step = routine.steps.find((s) => s.id === stepId);
  const habit = step ? habits.find((h) => h.id === step.habitId) : undefined;

  // Çalışma sırasında adım/alışkanlık silinmişse (rutin/habit düzenlemesi başka bir
  // cihazdan senkronlanmış olabilir) otomatik atlamayız — kullanıcı açıkça "Atla"ya basar.
  if (!step || !habit) {
    return (
      <Sheet title={routine.name} onClose={finish} closeLabel="Kapat">
        <div class="form">
          <p class="hint">Bu adımın alışkanlığı silinmiş. Devam etmek için atla.</p>
          <button class="btn block" onClick={skip}>
            Atla
          </button>
          <button class="text-btn strong" onClick={finish}>
            Rutini bitir
          </button>
        </div>
      </Sheet>
    );
  }

  const complete = () => {
    const result = store.completeRoutineStep();
    haptic(result && result.applied > 0 ? 'success' : 'tap', settings.haptics);
  };

  const prev = amountOf(logs, habit.id, routineRun.date);
  const plan = planFor(habit, routineRun.date);
  const alreadyDone = !!plan && prev >= plan.target;
  const unit = currentRevision(habit).unit;

  return (
    <Sheet title={routine.name} onClose={finish} closeLabel="Kapat">
      <div class="form">
        <p class="muted">
          {routineRun.currentIndex + 1}/{routineRun.stepOrder.length}
        </p>
        <p class="strong-text">{habit.name}</p>
        {alreadyDone ? (
          <p class="hint success">Zaten tamamlandı.</p>
        ) : (
          <p class="hint">
            +{step.amount}
            {showUnit(unit) ? ` ${unit}` : ''}
          </p>
        )}

        <div class="row gap">
          <button class="btn block" onClick={skip}>
            Atla
          </button>
          <button class="btn primary block" onClick={complete}>
            Tamamla
          </button>
        </div>

        <div class="row between">
          {routineRun.currentIndex > 0 ? (
            <button class="text-btn" onClick={undo}>
              Geri al
            </button>
          ) : (
            <span />
          )}
          <button class="text-btn strong" onClick={finish}>
            Rutini bitir
          </button>
        </div>
      </div>
    </Sheet>
  );
}
