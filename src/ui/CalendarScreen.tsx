import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { agendaForDay, isOverdue } from '../core/agenda';
import { dayShort, formatDayMonth, toDateKey, type DateKey } from '../core/dates';
import { monthGrid } from '../core/periods';
import type { AgendaItem } from '../core/types';
import { AgendaEditor } from './AgendaEditor';
import { AgendaListView } from './AgendaListView';
import { AgendaRow } from './AgendaRow';
import { DayDetailSheet } from './DayDetailSheet';
import { GoalsSheet } from './GoalsSheet';
import { Icon, Segmented } from './components';
import { useAppState, useStore } from './hooks';
import { consumePendingAgendaTarget, consumePendingCalendarView, goToSettings } from './nav';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
type ViewMode = 'calendar' | 'list';

export function CalendarScreen() {
  const store = useStore();
  const { agenda } = useAppState();
  const now = new Date();
  // useState'in lazy initializer'ı tam bir kez çalışır — consumePendingAgendaTarget yan etkili (modül
  // durumunu temizler) olduğundan burada useMemo değil bu güvenceyi kullanıyoruz.
  const [pendingTarget] = useState(consumePendingAgendaTarget);
  const [view, setView] = useState<ViewMode>(() => consumePendingCalendarView() ?? 'calendar');
  const [year, setYear] = useState(pendingTarget ? Number(pendingTarget.date.slice(0, 4)) : now.getFullYear());
  const [month, setMonth] = useState(pendingTarget ? Number(pendingTarget.date.slice(5, 7)) : now.getMonth() + 1); // 1-12
  const [selected, setSelected] = useState<DateKey>(pendingTarget?.date ?? toDateKey(now));
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<AgendaItem | 'new' | null>(
    pendingTarget ? (agenda.find((a) => a.id === pendingTarget.itemId) ?? null) : null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => clearTimeout(toastTimer.current),
    [],
  );
  const showToast = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const today = toDateKey(now);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const selectedItems = useMemo(() => agendaForDay(agenda, selected), [agenda, selected]);

  // Her gün hücresi için: o güne ait kayıtlardan en fazla 3 tanesinin gecikmiş/gecikmemiş durumu.
  const dayDots = useMemo(() => {
    const map = new Map<DateKey, boolean[]>();
    for (const item of agenda) {
      const arr = map.get(item.date) ?? [];
      if (arr.length < 3) arr.push(isOverdue(item, now));
      map.set(item.date, arr);
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

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelected(today);
  };

  const openNew = () => setEditingAgenda('new');
  const openItem = (item: AgendaItem) => {
    // Liste modundan açılan bir kayıt kendi gününü de "seçili" yapsın (Takvim'e dönünce tutarlı olsun).
    setSelected(item.date);
    setEditingAgenda(item);
  };

  return (
    <section aria-labelledby="calendar-h">
      <header class="screen-head">
        <div>
          <p class="eyebrow">Takvim</p>
          <h1 id="calendar-h">{view === 'calendar' ? `${MONTHS[month - 1]} ${year}` : 'Tüm Kayıtlar'}</h1>
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

      <Segmented<ViewMode>
        class="wide"
        label="Görünüm"
        value={view}
        onChange={setView}
        options={[
          { value: 'calendar', label: 'Takvim', icon: 'calendar' },
          { value: 'list', label: 'Liste', icon: 'checklist' },
        ]}
      />

      {view === 'list' ? (
        <AgendaListView onOpen={openItem} />
      ) : (
        <>
          <div class="month-nav">
            <button class="round-btn sm" aria-label="Önceki ay" onClick={() => step(-1)}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <button class="text-btn" onClick={goToday}>
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
              const dots = dayDots.get(date);
              return (
                <button
                  key={date}
                  class={`cal-cell ${inMonth ? '' : 'muted-cell'} ${date === today ? 'is-today' : ''} ${date === selected ? 'is-selected' : ''}`}
                  onClick={() => setSelected(date)}
                  aria-label={date}
                  aria-current={date === selected ? 'date' : undefined}
                >
                  <span>{Number(date.slice(8, 10))}</span>
                  {dots && (
                    <span class="cal-dots" aria-hidden="true">
                      {dots.map((overdue, i) => (
                        <span key={i} class={`cal-dot ${overdue ? 'overdue' : ''}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div class="selected-day">
            <div class="row between">
              <span class="strong-text">{selected === today ? 'Bugün' : formatDayMonth(selected)}</span>
              <div class="row gap-sm">
                <button class="text-btn" onClick={() => setDayDetailOpen(true)}>
                  Gün detayı
                </button>
                <button class="text-btn strong" onClick={openNew}>
                  + Ekle
                </button>
              </div>
            </div>
            {selectedItems.length === 0 ? (
              <p class="hint">Bu gün için kayıt yok.</p>
            ) : (
              <ul class="agenda-list">
                {selectedItems.map((item) => (
                  <AgendaRow key={item.id} item={item} now={now} onOpen={() => setEditingAgenda(item)} onToggleDone={() => store.setAgendaDone(item.id, !item.done)} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {dayDetailOpen && <DayDetailSheet date={selected} onClose={() => setDayDetailOpen(false)} />}
      {goalsOpen && <GoalsSheet initial={{ kind: 'month', year, month }} onClose={() => setGoalsOpen(false)} />}
      {editingAgenda === 'new' && (
        <AgendaEditor defaultDate={selected} onClose={() => setEditingAgenda(null)} onSaved={() => showToast('Eklendi')} />
      )}
      {editingAgenda && editingAgenda !== 'new' && (
        <AgendaEditor item={editingAgenda} defaultDate={selected} onClose={() => setEditingAgenda(null)} onSaved={() => showToast('Kaydedildi')} />
      )}

      {toast && (
        <div class="toast" role="status">
          <span>{toast}</span>
        </div>
      )}
    </section>
  );
}
