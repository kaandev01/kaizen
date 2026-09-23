import { useEffect, useRef, useState } from 'preact/hooks';
import { agendaRemindersBetween } from '../core/agenda';
import { remindersBetween } from '../core/reminders';
import { CalendarScreen } from './CalendarScreen';
import { Icon } from './components';
import { FocusScreen } from './FocusScreen';
import { useAppState, useStore } from './hooks';
import { goToAgendaItem, setNavigate, type Tab } from './nav';
import { beep, cancelPomodoroEnd, haptic, schedulePomodoroEnd, setWakeLock, showNotification } from './platform';
import { SettingsScreen } from './SettingsScreen';
import { useSyncStatus } from './syncStatus';
import { TodayScreen } from './TodayScreen';

interface Notice {
  text: string;
  tab?: Tab;
  /** "Aç" bu kayda dokununca ilgili ajanda kaydını doğrudan açsın diye. */
  agendaTarget?: { date: string; itemId: string };
}

const TABS: { id: Tab; label: string; icon: 'today' | 'hourglass' | 'calendar' }[] = [
  { id: 'today', label: 'Bugün', icon: 'today' },
  { id: 'focus', label: 'Odaklan', icon: 'hourglass' },
  { id: 'calendar', label: 'Takvim', icon: 'calendar' },
];

export function App() {
  const store = useStore();
  const state = useAppState();
  const syncStatus = useSyncStatus();
  const [tab, setTab] = useState<Tab>('today');
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setNavigate(setTab), []);

  const say = (n: Notice) => {
    setNotice(n);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 9000);
  };

  // ---- tema ---------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  // ---- Pomodoro motoru: süre dolunca tamamla (görünürlük/uyanma dahil) ----
  const { status, endsAt, phase } = state.pomodoro;
  useEffect(() => {
    const settle = () => store.pomoSettle();
    settle();
    const id = status === 'running' ? setInterval(settle, 500) : undefined;
    document.addEventListener('visibilitychange', settle);
    window.addEventListener('focus', settle);
    window.addEventListener('pageshow', settle);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener('visibilitychange', settle);
      window.removeEventListener('focus', settle);
      window.removeEventListener('pageshow', settle);
    };
  }, [store, status]);

  // Bitişte ses/titreşim (yalnızca yeni bittiyse; yeniden açılışta tekrar çalmaz).
  const seenCompletion = useRef<string | null>(null);
  const completed = state.pomodoro.lastCompleted;
  useEffect(() => {
    if (!completed) return;
    const id = `${completed.runId}:${completed.at}`;
    if (seenCompletion.current === id) return;
    seenCompletion.current = id;
    const fresh = Date.now() - completed.at < 10_000;
    const title = completed.phase === 'focus' ? 'Odak seansı tamamlandı' : 'Mola bitti';
    if (fresh) {
      if (!state.settings.silent) beep();
      haptic('success', state.settings.haptics);
      if (document.visibilityState === 'hidden') void showNotification('Kaizen', title, 'pomodoro-done');
    }
    if (tab !== 'focus') say({ text: title + '.', tab: 'focus' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed?.runId, completed?.at]);

  // Aşama sonu için zamanlanmış bildirim (yalnızca destekleyen tarayıcılarda; iOS'ta yok).
  useEffect(() => {
    if (status === 'running' && endsAt) {
      void schedulePomodoroEnd(endsAt, 'Kaizen', phase === 'focus' ? 'Odak seansı bitti' : 'Mola bitti');
    } else void cancelPomodoroEnd();
  }, [status, endsAt, phase]);

  // Sayaç çalışırken ekranı açık tut.
  const keepAwake = status === 'running' && state.settings.keepAwake;
  useEffect(() => {
    if (!keepAwake) return void setWakeLock(false);
    void setWakeLock(true);
    const again = () => document.visibilityState === 'visible' && void setWakeLock(true);
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      void setWakeLock(false);
    };
  }, [keepAwake]);

  // ---- Alışkanlık + ajanda hatırlatmaları (uygulama açıkken) -----------------
  useEffect(() => {
    let last = Date.now();
    const fired = new Set<string>();
    const tick = () => {
      const now = Date.now();
      // Uzun uyku sonrası eski hatırlatmalar yığılmasın: en fazla son 2 dakika.
      const from = Math.max(last, now - 120_000);
      last = now;
      const { habits, logs, agenda, settings } = store.getState();
      if (!settings.notifications) return;
      for (const r of remindersBetween(habits, logs, new Date(now), from, now)) {
        if (fired.has(r.id)) continue;
        fired.add(r.id);
        const text = `${r.name} zamanı`;
        if (document.visibilityState === 'visible') say({ text, tab: 'today' });
        else void showNotification('Kaizen', text, `habit:${r.habitId}:${r.date}:${r.time}`);
      }
      for (const r of agendaRemindersBetween(agenda, from, now)) {
        if (fired.has(r.id)) continue;
        fired.add(r.id);
        const text = `${r.title} zamanı`;
        const item = store.getState().agenda.find((a) => a.id === r.itemId);
        const agendaTarget = item ? { date: item.date, itemId: item.id } : undefined;
        if (document.visibilityState === 'visible') say({ text, tab: 'calendar', agendaTarget });
        else void showNotification('Kaizen', text, `agenda:${r.itemId}:${r.at}`);
      }
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  return (
    <div class="app">
      {state.persistError && (
        <div class="notice warn top" role="alert">
          {state.persistError}
        </div>
      )}
      {/* Buluta gönderilemeyen bir kaydı asla "gönderilmiş" gibi göstermemek için:
          yalnızca kuyrukta bekleyen değişiklik VARKEN (error/offline) görünür,
          her şey senkronsa (idle) hiçbir şey göstermez — ana ekran sade kalır. */}
      {!state.persistError && (syncStatus === 'error' || syncStatus === 'offline') && (
        <div class="notice warn top" role="status">
          {syncStatus === 'offline' ? 'Çevrimdışısın — değişiklikler bağlanınca buluta gönderilecek.' : 'Bazı değişiklikler henüz buluta gönderilemedi, tekrar denenecek.'}
        </div>
      )}
      {notice && (
        <div class="notice banner" role="status">
          <span>{notice.text}</span>
          {notice.tab && notice.tab !== tab && (
            <button
              class="toast-btn"
              onClick={() => {
                if (notice.agendaTarget) goToAgendaItem(notice.agendaTarget.date, notice.agendaTarget.itemId);
                else setTab(notice.tab!);
                setNotice(null);
              }}
            >
              Aç
            </button>
          )}
          <button class="icon-btn" aria-label="Kapat" onClick={() => setNotice(null)}>
            <Icon name="x" size={18} />
          </button>
        </div>
      )}

      <main class="screen">
        {tab === 'today' && <TodayScreen />}
        {tab === 'focus' && <FocusScreen />}
        {tab === 'calendar' && <CalendarScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <nav class="tabbar" aria-label="Ana menü">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} class={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon name={icon} size={24} />
            <span>{label}</span>
            {id === 'focus' && status === 'running' && <span class="live-dot" aria-label="Sayaç çalışıyor" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
