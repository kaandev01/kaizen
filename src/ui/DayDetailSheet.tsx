import { useState } from 'preact/hooks';
import { formatClockTime, formatLongDate, type DateKey } from '../core/dates';
import { formatDuration } from '../core/format';
import { habitsForDay } from '../core/progress';
import { agendaForDay, isOverdue } from '../core/agenda';
import { focusStatsForDay, sessionsTouchingDay } from '../core/pomoStats';
import type { AgendaItem } from '../core/types';
import { AgendaEditor } from './AgendaEditor';
import { Icon, Sheet } from './components';
import { useAppState, useStore } from './hooks';
import { HabitIcon } from './icons';
import { JournalPanel } from './JournalPanel';

const KIND_LABEL: Record<AgendaItem['kind'], string> = { deadline: 'Teslim', exam: 'Sınav', todo: 'Yapılacak', other: 'Diğer' };

export function DayDetailSheet({ date, onClose }: { date: DateKey; onClose: () => void }) {
  const state = useAppState();
  const [editingAgenda, setEditingAgenda] = useState<AgendaItem | 'new' | null>(null);

  const dayHabits = habitsForDay(state.habits, state.logs, date);
  const dayAgenda = agendaForDay(state.agenda, date);
  const focusStats = focusStatsForDay(state.pomoSessions, date);
  const daySessions = sessionsTouchingDay(state.pomoSessions, date);

  return (
    <>
      <Sheet title={formatLongDate(date)} onClose={onClose} closeLabel="Kapat" tall>
        <div class="form">
          <div class="panel">
            <JournalPanel date={date} />
          </div>

          <div class="field">
            <div class="row between">
              <span class="label">Ajanda</span>
              <button class="text-btn strong" onClick={() => setEditingAgenda('new')}>
                + Ekle
              </button>
            </div>
            {dayAgenda.length === 0 ? (
              <p class="hint">Bu güne kayıtlı deadline/etkinlik yok.</p>
            ) : (
              <ul class="agenda-list">
                {dayAgenda.map((item) => (
                  <AgendaRow key={item.id} item={item} onOpen={() => setEditingAgenda(item)} />
                ))}
              </ul>
            )}
          </div>

          {dayHabits.length > 0 && (
            <div class="field">
              <span class="label">Alışkanlıklar</span>
              <ul class="mini-habits">
                {dayHabits.map((h) => (
                  <li key={h.habit.id} class={`mini-habit ${h.done ? 'done' : ''}`} style={{ '--c': h.habit.color }}>
                    <span class="habit-icon sm" aria-hidden="true">
                      <HabitIcon icon={h.habit.icon} size={16} />
                    </span>
                    <span class="grow">{h.habit.name}</span>
                    <span class="muted small">
                      {h.amount}/{h.target} {h.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div class="field">
            <span class="label">Odaklanma</span>
            {focusStats.completedCount === 0 && focusStats.activeMs === 0 ? (
              <p class="hint">Bu gün için Pomodoro kaydı yok.</p>
            ) : (
              <>
                <p class="focus-summary">
                  <b>{focusStats.completedCount} Pomodoro</b> · {formatDuration(focusStats.activeMs)}
                </p>
                <ul class="mini-sessions">
                  {daySessions.map((s) => (
                    <li key={s.id} class="mini-session">
                      <span>
                        {formatClockTime(s.startedAt)}–{formatClockTime(s.endedAt)}
                      </span>
                      <span class={`badge ${s.status === 'completed' ? 'granted' : ''}`}>{s.status === 'completed' ? 'Tamamlandı' : 'Erken bitirildi'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </Sheet>

      {editingAgenda === 'new' && <AgendaEditor defaultDate={date} onClose={() => setEditingAgenda(null)} />}
      {editingAgenda && editingAgenda !== 'new' && <AgendaEditor item={editingAgenda} defaultDate={date} onClose={() => setEditingAgenda(null)} />}
    </>
  );
}

function AgendaRow({ item, onOpen }: { item: AgendaItem; onOpen: () => void }) {
  const store = useStore();
  const overdue = isOverdue(item, new Date());
  return (
    <li class={`agenda-row ${item.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <button class="agenda-check" aria-label={item.done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'} onClick={() => store.setAgendaDone(item.id, !item.done)}>
        {item.done && <Icon name="check" size={16} />}
      </button>
      <button class="agenda-main" onClick={onOpen}>
        <span class="agenda-title">{item.title}</span>
        <span class="muted small">
          {KIND_LABEL[item.kind]} · {item.time ?? 'Tüm gün'}
          {overdue && !item.done ? ' · Gecikmiş' : ''}
        </span>
      </button>
    </li>
  );
}
