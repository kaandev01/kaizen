import { useState } from 'preact/hooks';
import { categoryPath, categoryStatsForDay, GENERAL_CATEGORY_ID } from '../core/categories';
import { toDateKey } from '../core/dates';
import { formatDuration } from '../core/format';
import { remainingNow, type Phase } from '../core/pomodoro';
import { focusStatsForDay } from '../core/pomoStats';
import { CategoryPicker } from './CategoryPicker';
import { Icon, Ring, Segmented } from './components';
import { Durations } from './Durations';
import { useAppState, useNow, useStore } from './hooks';
import { goToSettings } from './nav';
import { haptic, isIOS, unlockAudio } from './platform';

const NEXT_HINT: Record<Phase, string> = { focus: 'Odaklanma için hazır', short: 'Kısa mola için hazır', long: 'Uzun mola için hazır' };

const fmt = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const spoken = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)} dakika ${total % 60} saniye`;
};

export function FocusScreen() {
  const store = useStore();
  const { pomodoro: p, settings, pomoSessions, categories } = useAppState();
  const [durationsOpen, setDurationsOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const running = p.status === 'running';
  const now = useNow(250, running);
  const remaining = remainingNow(p, running ? now : Date.now());
  const ratio = p.durationMs > 0 ? 1 - remaining / p.durationMs : 0;
  const dots = settings.pomodoro.longEvery;
  const filled = p.phase === 'long' ? dots : p.cycleCount % dots;

  const todayKey = toDateKey(new Date());
  const todayStats = focusStatsForDay(pomoSessions, todayKey);
  const categoryStats = categoryStatsForDay(pomoSessions, categories, todayKey);
  const categoryBreakdown = categories
    .map((c) => ({ name: c.name, ms: categoryStats.get(c.id) ?? 0 }))
    .filter((c) => c.ms > 0)
    .sort((a, b) => b.ms - a.ms);
  const selectedPath = categoryPath(categories, p.categoryId)
    .map((c) => c.name)
    .join(' ▸ ');

  const act = (fn: () => void) => () => {
    unlockAudio(); // iOS: ses, kullanıcı dokunuşuyla açılır
    haptic('tap', settings.haptics);
    fn();
  };

  const primary =
    p.status === 'running'
      ? { label: 'Duraklat', icon: 'pause' as const, run: () => store.pomoPause() }
      : p.status === 'paused'
        ? { label: 'Devam et', icon: 'play' as const, run: () => store.pomoStart() }
        : { label: 'Başlat', icon: 'play' as const, run: () => store.pomoStart() };

  return (
    <section aria-labelledby="focus-h">
      <header class="screen-head">
        <div>
          <p class="eyebrow">Pomodoro</p>
          <h1 id="focus-h">Odaklan</h1>
        </div>
        <button class="round-btn" aria-label="Ayarlar" onClick={goToSettings}>
          <Icon name="sliders" size={20} />
        </button>
      </header>

      <button class="setting link solo" disabled={p.status !== 'idle'} onClick={() => setCategoryPickerOpen(true)}>
        <span class="grow">
          Kategori
          <span class="muted small block">{selectedPath || 'Genel'}</span>
        </span>
        {p.status === 'idle' && <Icon name="chevronRight" size={18} />}
      </button>

      <Segmented<Phase>
        class="wide"
        label="Aşama"
        value={p.phase}
        disabled={running}
        onChange={(phase) => store.pomoSelectPhase(phase)}
        options={[
          { value: 'focus', label: 'Odaklanma' },
          { value: 'short', label: 'Kısa Mola' },
          { value: 'long', label: 'Uzun Mola' },
        ]}
      />

      {p.lastCompleted && (
        <div class="notice success" role="status">
          <span>
            {p.lastCompleted.phase === 'focus' ? 'Odak seansı tamamlandı! ' : 'Mola bitti. '}
            {NEXT_HINT[p.phase]}: hazır olunca başlat.
          </span>
          <button class="round-btn sm" aria-label="Kapat" onClick={() => store.pomoDismissCompletion()}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      <div class="timer-wrap">
        <Ring ratio={ratio} size={272} stroke={8} label={`${p.phase === 'focus' ? 'Odaklanma' : p.phase === 'short' ? 'Kısa mola' : 'Uzun mola'} süresi`} valueText={`${spoken(remaining)} kaldı`} class="timer">
          <span class="time" aria-hidden="true">
            {fmt(remaining)}
          </span>
          <span class="muted small">{p.status === 'running' ? 'devam ediyor' : p.status === 'paused' ? 'duraklatıldı' : 'hazır'}</span>
        </Ring>
      </div>

      <div class="dots" role="img" aria-label={`Döngü: ${filled} / ${dots} odak seansı`}>
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} class={`dot ${i < filled ? 'on' : ''}`} />
        ))}
      </div>

      <div class="controls">
        <button class="round-btn outline lg" onClick={act(() => store.pomoReset())} aria-label="Sıfırla" disabled={p.status === 'idle' && remaining === p.durationMs}>
          <Icon name="reset" size={22} />
        </button>
        <button class="round-btn primary xl" onClick={act(primary.run)} aria-label={primary.label}>
          <Icon name={primary.icon} size={32} />
        </button>
        <button class="round-btn outline lg" onClick={act(() => store.pomoSkipBreak())} aria-label="Molayı atla" disabled={p.phase === 'focus'}>
          <Icon name="skip" size={22} />
        </button>
      </div>
      <p class="control-caption">{primary.label}</p>

      <p class="today-line">
        Bugün <b>{todayStats.completedCount} Pomodoro</b> · <b>{formatDuration(todayStats.activeMs)}</b>
      </p>
      {categoryBreakdown.length > 0 && (
        <ul class="category-breakdown">
          {categoryBreakdown.map((c) => (
            <li key={c.name}>
              <span class="grow">{c.name}</span>
              <span class="muted small">{formatDuration(c.ms)}</span>
            </li>
          ))}
        </ul>
      )}

      <div class="collapsible">
        <button class="collapsible-head" aria-expanded={durationsOpen} onClick={() => setDurationsOpen((o) => !o)}>
          <span class="head-icon" aria-hidden="true">
            <Icon name="sliders" size={18} />
          </span>
          <span class="grow">Süre Ayarları</span>
          <span class={`chev ${durationsOpen ? 'open' : ''}`}>
            <Icon name="chevronDown" size={20} />
          </span>
        </button>
        {durationsOpen && <Durations />}
      </div>

      <p class="hint pad">
        Sıfırlanan veya yarım bırakılan seans sayılmaz.{' '}
        {isIOS() ? 'iPhone’da uygulama kapalıyken veya ekran kilitliyken sayaç bildirimi gönderemez; süre dolunca uygulamayı açtığında kalan süre doğru görünür.' : ''}
      </p>

      {categoryPickerOpen && <CategoryPicker selectedId={p.categoryId} onSelect={(id) => store.pomoSetCategory(id ?? GENERAL_CATEGORY_ID)} onClose={() => setCategoryPickerOpen(false)} />}
    </section>
  );
}
