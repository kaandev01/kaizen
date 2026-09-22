import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addDays, dayLong, formatLongDate, isoWeekday, type DateKey } from '../core/dates';
import { homeUpcoming } from '../core/agenda';
import { planFor } from '../core/plan';
import { amountOf, habitsForDay, summarize, type HabitDay } from '../core/progress';
import { currentStreak } from '../core/streak';
import type { AgendaItem } from '../core/types';
import { MAX_AMOUNT } from '../core/validation';
import { AgendaEditor } from './AgendaEditor';
import { AgendaRow } from './AgendaRow';
import { Icon, Ring, Sheet } from './components';
import { HabitEditor } from './HabitEditor';
import { useAppState, useStore, useToday } from './hooks';
import { HabitIcon } from './icons';
import { JournalPanel } from './JournalPanel';
import { goToAgendaList, goToSettings } from './nav';
import { cancelHabitNotifications, haptic } from './platform';

interface UndoToast {
  habitId: string;
  date: DateKey;
  prev: number;
  text: string;
}

export function TodayScreen() {
  const store = useStore();
  const state = useAppState();
  const today = useToday();
  const [editor, setEditor] = useState<{ habitId?: string } | null>(null);
  const [amountFor, setAmountFor] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const history = useRef<UndoToast[]>([]); // adım adım geri alma yığını
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>();

  const rows = useMemo(() => habitsForDay(state.habits, state.logs, today), [state.habits, state.logs, today]);
  const summary = summarize(rows);
  const allDone = summary.planned > 0 && summary.completed === summary.planned;
  const pct = Math.floor((summary.ratio ?? 0) * 100);
  const haptics = state.settings.haptics;

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(celebrateTimer.current);
    },
    [],
  );

  const showToast = (entry: UndoToast | null) => {
    setToast(entry);
    clearTimeout(toastTimer.current);
    if (entry) toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  /** Tüm miktar değişiklikleri buradan geçer: geri alma, kutlama ve bildirim iptali. */
  const change = (row: HabitDay, next: number) => {
    const clamped = Math.min(Math.max(next, 0), MAX_AMOUNT);
    const prev = store.setAmount(row.habit.id, today, clamped);
    if (prev === clamped) return;
    const reached = prev < row.target && clamped >= row.target;
    if (reached) {
      // Kutlama yalnızca hedefe ilk ulaşılan dokunuşta; sonraki dokunuşlarda tekrarlanmaz.
      haptic('success', haptics);
      setCelebrate(row.habit.id);
      clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrate(null), 1100);
      void cancelHabitNotifications(row.habit.id); // bugünün kalan hatırlatmaları
    } else if (clamped > prev) haptic('tap', haptics);

    const entry: UndoToast = { habitId: row.habit.id, date: today, prev, text: `${row.habit.name}: ${clamped}/${row.target} ${row.unit}` };
    history.current = [...history.current.slice(-19), entry];
    showToast(entry);
  };

  /** Her dokunuşu tek tek geri alır; yığında adım kaldıysa tekrar sunar. */
  const undo = () => {
    const last = history.current.pop();
    if (!last) return setToast(null);
    store.setAmount(last.habitId, last.date, last.prev);
    haptic('tap', haptics);
    const top = history.current[history.current.length - 1];
    showToast(top ? { ...top, text: `Geri alındı · önceki adım: ${top.text}` } : null);
  };

  const editing = editor?.habitId ? state.habits.find((h) => h.id === editor.habitId) : undefined;
  const amountRow = amountFor ? rows.find((r) => r.habit.id === amountFor) : undefined;

  return (
    <section aria-labelledby="today-h">
      <header class="screen-head">
        <div>
          <p class="eyebrow">{formatLongDate(today)}</p>
          <h1 id="today-h">Bugün</h1>
        </div>
        <div class="row gap">
          <button class="round-btn" aria-label="Ayarlar" onClick={goToSettings}>
            <Icon name="sliders" size={20} />
          </button>
          <button class="round-btn mic-btn" aria-label="Bugüne not ekle (sesle veya yazarak)" onClick={() => setJournalOpen(true)}>
            <Icon name="mic" size={20} />
          </button>
          <button class="sq-btn" aria-label="Yeni alışkanlık ekle" onClick={() => setEditor({})}>
            <Icon name="plus" />
          </button>
        </div>
      </header>

      {state.habits.length === 0 ? (
        <EmptyState
          icon="target"
          title="Henüz alışkanlık yok"
          text="Günlük rutinini takip etmek için ilk alışkanlığını ekle: su içmek, kitap okumak, diş fırçalamak…"
          action={
            <button class="btn primary" onClick={() => setEditor({})}>
              <Icon name="plus" size={18} /> İlk alışkanlığını ekle
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <NoPlanToday today={today} />
      ) : (
        <>
          <div class={`hero ${allDone ? 'all-done' : ''}`}>
            <Ring
              ratio={summary.ratio ?? 0}
              size={168}
              stroke={13}
              label="Günlük ilerleme"
              valueText={`Yüzde ${pct}, ${summary.completed} / ${summary.planned} alışkanlık tamamlandı`}
              class={allDone ? 'bump' : ''}
            >
              {allDone ? <Icon name="check" size={56} /> : <span class="ring-pct">{pct}%</span>}
            </Ring>
            <p class="hero-count">
              <b>
                {summary.completed}/{summary.planned}
              </b>{' '}
              alışkanlık tamamlandı
            </p>
            {allDone && <p class="success-text">Bugünün tüm hedefleri tamam. Harika iş!</p>}
          </div>

          <ul class="habits" aria-label="Bugünün alışkanlıkları">
            {rows.map((row) => (
              <HabitRow
                key={row.habit.id}
                row={row}
                today={today}
                celebrating={celebrate === row.habit.id}
                onInc={() => change(row, amountOf(store.getState().logs, row.habit.id, today) + 1)}
                onOpen={() => setAmountFor(row.habit.id)}
              />
            ))}
          </ul>
        </>
      )}

      <UpcomingCard />

      {toast && (
        <div class="toast" role="status">
          <span>{toast.text}</span>
          <button class="toast-btn" onClick={undo}>
            Geri al
          </button>
        </div>
      )}

      {amountRow && (
        <AmountSheet
          row={amountRow}
          onClose={() => setAmountFor(null)}
          onChange={(n) => change(amountRow, n)}
          onEdit={() => {
            setAmountFor(null);
            setEditor({ habitId: amountRow.habit.id });
          }}
        />
      )}
      {editor && <HabitEditor habit={editing} onClose={() => setEditor(null)} />}
      {journalOpen && (
        <Sheet title="Bugünün Günlüğü" onClose={() => setJournalOpen(false)} closeLabel="Kapat">
          <JournalPanel date={today} />
        </Sheet>
      )}
    </section>
  );
}

/**
 * Ana ekranın "Yaklaşan" bölümü: kullanıcı Takvim'e hiç girmese de en fazla
 * 3 tamamlanmamış deadline/etkinliği (gecikenler önce) burada görür. Kayıt
 * yoksa hiçbir şey (büyük boş durum kartı YOK) render edilmez.
 */
function UpcomingCard() {
  const store = useStore();
  const { agenda } = useAppState();
  const [openItem, setOpenItem] = useState<AgendaItem | null>(null);
  const now = new Date();
  const items = homeUpcoming(agenda, now, 3);
  if (items.length === 0) return null;
  return (
    <div class="field upcoming-card">
      <div class="row between">
        <span class="label">Yaklaşan</span>
        <button class="text-btn strong" onClick={goToAgendaList}>
          Tümü
        </button>
      </div>
      <ul class="agenda-list">
        {items.map((item) => (
          <AgendaRow key={item.id} item={item} now={now} onOpen={() => setOpenItem(item)} onToggleDone={() => store.setAgendaDone(item.id, !item.done)} showDate />
        ))}
      </ul>
      {openItem && <AgendaEditor item={openItem} defaultDate={openItem.date} onClose={() => setOpenItem(null)} />}
    </div>
  );
}

function HabitRow(props: { row: HabitDay; today: DateKey; celebrating: boolean; onInc: () => void; onOpen: () => void }) {
  const { row } = props;
  const state = useAppState();
  const streak = useMemo(
    () => currentStreak(row.habit, (d) => amountOf(state.logs, row.habit.id, d), props.today),
    [row.habit, state.logs, props.today],
  );
  return (
    <li class={`habit ${row.done ? 'done' : ''} ${props.celebrating ? 'celebrate' : ''}`} style={{ '--c': row.habit.color } as JSX.CSSProperties}>
      <button class="habit-main" onClick={props.onOpen} aria-label={`${row.habit.name}, ${row.amount}/${row.target} ${row.unit}, ${streak} gün serisi${row.done ? ', tamamlandı' : ''}. Miktarı düzenle`}>
        <span class="habit-icon" aria-hidden="true">
          <HabitIcon icon={row.habit.icon} size={22} />
        </span>
        <span class="habit-name">
          <span class="name-text">{row.habit.name}</span>
          <span class={`streak ${streak === 0 ? 'zero' : ''}`} aria-hidden="true">
            <Icon name="flame" size={14} />
            {streak}
          </span>
        </span>
        <span class="habit-count" aria-hidden="true">
          <b>
            {row.amount}/{row.target}
          </b>
          <small>{row.unit}</small>
        </span>
      </button>
      {row.done ? (
        // Tamamlandı: yanlışlıkla hedefin üstüne çıkmamak için düğme miktar sayfasını açar.
        <button class="round-btn done-btn" onClick={props.onOpen} aria-label={`${row.habit.name} tamamlandı; miktarı düzenle`}>
          <Icon name="check" size={22} />
        </button>
      ) : (
        <button class="round-btn add-btn" onClick={props.onInc} aria-label={`${row.habit.name}: bir artır`}>
          <Icon name="plus" size={22} />
        </button>
      )}
    </li>
  );
}

function AmountSheet(props: { row: HabitDay; onClose: () => void; onChange: (n: number) => void; onEdit: () => void }) {
  const { row } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (value: string) => {
    if (/^\d+$/.test(value.trim())) props.onChange(parseInt(value, 10));
    setDraft(null); // geçersiz girişte mevcut değere dön
  };
  return (
    <Sheet title={row.habit.name} onClose={props.onClose} closeLabel="Kapat">
      <div class="amount-panel" style={{ '--c': row.habit.color } as JSX.CSSProperties}>
        <div class="row center gap-lg">
          <button class="round-btn lg" aria-label="Bir azalt" disabled={row.amount <= 0} onClick={() => props.onChange(row.amount - 1)}>
            <Icon name="minus" size={26} />
          </button>
          <input
            class="amount-input"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`Miktar (${row.unit})`}
            value={draft ?? String(row.amount)}
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <button class="round-btn lg" aria-label="Bir artır" onClick={() => props.onChange(row.amount + 1)}>
            <Icon name="plus" size={26} />
          </button>
        </div>
        <p class="center-text muted">
          Hedef: {row.target} {row.unit}
          {row.amount > row.target ? ` · ${row.amount - row.target} fazla` : ''}
        </p>
        <div class="row gap">
          <button class="btn block" onClick={() => props.onChange(row.target)} disabled={row.amount === row.target}>
            Hedefe tamamla
          </button>
          <button class="btn block" onClick={() => props.onChange(0)} disabled={row.amount === 0}>
            Sıfırla
          </button>
        </div>
        <button class="btn block" onClick={props.onEdit}>
          <Icon name="pencil" size={18} /> Alışkanlığı düzenle
        </button>
      </div>
    </Sheet>
  );
}

function NoPlanToday({ today }: { today: DateKey }) {
  const { habits } = useAppState();
  let next: { label: string; names: string[] } | null = null;
  for (let i = 1; i <= 7 && !next; i++) {
    const d = addDays(today, i);
    const names = habits.filter((h) => planFor(h, d)).map((h) => h.name);
    if (names.length) next = { label: i === 1 ? 'Yarın' : dayLong(isoWeekday(d)), names };
  }
  return (
    <EmptyState
      icon="sun"
      title="Bugün plan yok"
      text={next ? `Bugün için planlanmış alışkanlık yok; dinlen. ${next.label}: ${next.names.join(', ')}.` : 'Bugün için planlanmış alışkanlık yok.'}
    />
  );
}

function EmptyState(props: { icon: string; title: string; text: string; action?: JSX.Element }) {
  return (
    <div class="empty">
      <div class="empty-icon" aria-hidden="true">
        <HabitIcon icon={props.icon} size={34} />
      </div>
      <h2>{props.title}</h2>
      <p class="muted">{props.text}</p>
      {props.action}
    </div>
  );
}
