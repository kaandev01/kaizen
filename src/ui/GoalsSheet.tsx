import { useState } from 'preact/hooks';
import { formatGoalPeriod, samePeriod, sortGoals } from '../core/goals';
import type { Goal, GoalPeriod, GoalPeriodKind } from '../core/types';
import { Icon, Segmented, Sheet } from './components';
import { GoalEditor } from './GoalEditor';
import { useAppState } from './hooks';

const STATUS_LABEL: Record<Goal['status'], string> = { active: 'Devam Ediyor', done: 'Tamamlandı', abandoned: 'Vazgeçildi' };

export function GoalsSheet({ initial, onClose }: { initial: GoalPeriod; onClose: () => void }) {
  const { goals } = useAppState();
  const [kind, setKind] = useState<GoalPeriodKind>(initial.kind);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month ?? new Date().getMonth() + 1);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);

  const period: GoalPeriod = kind === 'month' ? { kind, year, month } : { kind, year };
  const shown = sortGoals(goals.filter((g) => samePeriod(g.period, period)));

  const step = (dir: 1 | -1) => {
    if (kind === 'year') return setYear((y) => y + dir);
    let m = month + dir;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    } else if (m < 1) {
      m = 12;
      y--;
    }
    setMonth(m);
    setYear(y);
  };

  return (
    <>
      <Sheet title="Hedefler" onClose={onClose} closeLabel="Kapat">
        <div class="form">
          <Segmented<GoalPeriodKind>
            class="wide"
            label="Dönem türü"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'month', label: 'Aylık' },
              { value: 'year', label: 'Yıllık' },
            ]}
          />
          <div class="period-nav">
            <button class="round-btn sm" aria-label="Önceki dönem" onClick={() => step(-1)}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <span class="strong-text">{formatGoalPeriod(period)}</span>
            <button class="round-btn sm" aria-label="Sonraki dönem" onClick={() => step(1)}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>

          {shown.length === 0 ? (
            <p class="hint">Bu dönem için henüz hedef yok.</p>
          ) : (
            <div class="group">
              {shown.map((g) => (
                <button key={g.id} class="setting link" onClick={() => setEditing(g)}>
                  <span class="grow">
                    <span class="strong-text">{g.title}</span>
                    <span class="muted small block">{STATUS_LABEL[g.status]}</span>
                  </span>
                  <Icon name="pencil" size={18} />
                </button>
              ))}
            </div>
          )}

          <button class="btn primary block" onClick={() => setEditing('new')}>
            + Hedef Ekle
          </button>
        </div>
      </Sheet>

      {editing === 'new' && <GoalEditor period={period} onClose={() => setEditing(null)} />}
      {editing && editing !== 'new' && <GoalEditor goal={editing} period={period} onClose={() => setEditing(null)} />}
    </>
  );
}
