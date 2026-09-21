import { Stepper, Switch } from './components';
import { useAppState, useStore } from './hooks';

/**
 * Pomodoro süre ayarları. Odaklan sekmesindeki açılır kartta (kısa) ve
 * Ayarlar'daki "Süre Ayarları" sayfasında (tam) kullanılır.
 */
export function Durations({ full = false }: { full?: boolean }) {
  const store = useStore();
  const { settings } = useAppState();
  const p = settings.pomodoro;
  const set = (patch: Partial<typeof p>) => store.updateSettings({ pomodoro: { ...p, ...patch } });
  return (
    <div class="durations">
      <div class="dur-row">
        <span>Odaklanma</span>
        <Stepper label="Odaklanma süresi" value={p.focusMin} min={1} max={180} step={5} suffix="dk" onChange={(focusMin) => set({ focusMin })} />
      </div>
      <div class="dur-row">
        <span>Kısa Mola</span>
        <Stepper label="Kısa mola süresi" value={p.shortMin} min={1} max={60} suffix="dk" onChange={(shortMin) => set({ shortMin })} />
      </div>
      <div class="dur-row">
        <span>Uzun Mola</span>
        <Stepper label="Uzun mola süresi" value={p.longMin} min={1} max={120} step={5} suffix="dk" onChange={(longMin) => set({ longMin })} />
      </div>
      {full && (
        <>
          <div class="dur-row">
            <span>
              Uzun mola aralığı
              <span class="muted small block">Her {p.longEvery} odak seansından sonra</span>
            </span>
            <Stepper label="Uzun mola aralığı" value={p.longEvery} min={2} max={12} onChange={(longEvery) => set({ longEvery })} />
          </div>
          <div class="dur-row">
            <span>
              Odakta ekranı açık tut
              <span class="muted small block">Sayaç çalışırken ekran kapanmaz.</span>
            </span>
            <Switch label="Odakta ekranı açık tut" checked={settings.keepAwake} onChange={(keepAwake) => store.updateSettings({ keepAwake })} />
          </div>
        </>
      )}
      <p class="hint">Değişiklik, bekleyen aşamaya hemen; çalışan aşamaya bir sonraki turda uygulanır.</p>
    </div>
  );
}
