import { formatClockTime, formatLongDate, type DateKey } from '../core/dates';
import { formatDuration } from '../core/format';
import { habitsForDay } from '../core/progress';
import { focusStatsForDay, sessionsTouchingDay } from '../core/pomoStats';
import { Sheet } from './components';
import { useAppState } from './hooks';
import { HabitIcon } from './icons';
import { JournalPanel } from './JournalPanel';

/**
 * Bir günün rating/günlük/alışkanlık/Pomodoro özeti. Ajanda (deadline/etkinlik)
 * artık burada DEĞİL — Takvim ekranında seçili günün altında satır içi
 * gösteriliyor (bir modal açmadan hemen görünür olsun diye).
 */
export function DayDetailSheet({ date, onClose }: { date: DateKey; onClose: () => void }) {
  const state = useAppState();
  const dayHabits = habitsForDay(state.habits, state.logs, date);
  const focusStats = focusStatsForDay(state.pomoSessions, date);
  const daySessions = sessionsTouchingDay(state.pomoSessions, date);

  return (
    <Sheet title={formatLongDate(date)} onClose={onClose} closeLabel="Kapat" tall>
      <div class="form">
        <div class="panel">
          <JournalPanel date={date} />
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
  );
}
