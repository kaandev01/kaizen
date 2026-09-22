import { useMemo, useState } from 'preact/hooks';
import { dayShort, toDateKey, type DateKey } from '../core/dates';
import { isOverdue } from '../core/agenda';
import { monthGrid } from '../core/periods';
import { DayDetailSheet } from './DayDetailSheet';
import { GoalsSheet } from './GoalsSheet';
import { Icon } from './components';
import { useAppState } from './hooks';
import { goToSettings } from './nav';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function CalendarScreen() {
  const { agenda } = useAppState();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [selected, setSelected] = useState<DateKey | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);

  const today = toDateKey(now);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const dayFlags = useMemo(() => {
    const map = new Map<DateKey, 'overdue' | 'has'>();
    for (const item of agenda) {
      if (map.get(item.date) === 'overdue') continue;
      map.set(item.date, isOverdue(item, now) ? 'overdue' : 'has');
    }
    return map;
  }, [agenda]);

  const step = (dir: 1 | -1) => {
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
    <section aria-labelledby="calendar-h">
      <header class="screen-head">
        <div>
          <p class="eyebrow">Takvim</p>
          <h1 id="calendar-h">
            {MONTHS[month - 1]} {year}
          </h1>
        </div>
        <div class="row gap">
          <button class="round-btn" aria-label="Hedefler" onClick={() => setGoalsOpen(true)}>
            <Icon name="target" size={20} />
          </button>
          <button class="round-btn" aria-label="Ayarlar" onClick={goToSettings}>
            <Icon name="sliders" size={20} />
          </button>
        </div>
      </header>

      <div class="month-nav">
        <button class="round-btn sm" aria-label="Önceki ay" onClick={() => step(-1)}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <button
          class="text-btn"
          onClick={() => {
            setYear(now.getFullYear());
            setMonth(now.getMonth() + 1);
          }}
        >
          Bugün
        </button>
        <button class="round-btn sm" aria-label="Sonraki ay" onClick={() => step(1)}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div class="cal-weekdays" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <span key={d}>{dayShort(d)}</span>
        ))}
      </div>

      <div class="cal-grid" role="grid" aria-label={`${MONTHS[month - 1]} ${year}`}>
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === `${year}-${String(month).padStart(2, '0')}`;
          const flag = dayFlags.get(date);
          return (
            <button
              key={date}
              class={`cal-cell ${inMonth ? '' : 'muted-cell'} ${date === today ? 'is-today' : ''}`}
              onClick={() => setSelected(date)}
              aria-label={date}
            >
              <span>{Number(date.slice(8, 10))}</span>
              {flag && <span class={`cal-dot ${flag === 'overdue' ? 'overdue' : ''}`} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {selected && <DayDetailSheet date={selected} onClose={() => setSelected(null)} />}
      {goalsOpen && <GoalsSheet initial={{ kind: 'month', year, month }} onClose={() => setGoalsOpen(false)} />}
    </section>
  );
}
