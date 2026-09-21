import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { buildIcs } from '../core/ics';
import { currentRevision } from '../core/plan';
import { upcomingReminders } from '../core/reminders';
import type { ThemeSetting } from '../core/types';
import { Icon, Segmented, Sheet, Switch } from './components';
import { Durations } from './Durations';
import { HabitEditor, PermissionNote, scheduleSummary } from './HabitEditor';
import { useAppState, useStore } from './hooks';
import { HabitIcon } from './icons';
import { haptic, isIOS, isStandalone, notificationState, requestNotificationPermission, type PermState } from './platform';

const VERSION = '0.1.0';

function download(filename: string, mime: string, text: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function SettingsScreen() {
  const store = useStore();
  const state = useAppState();
  const { settings } = state;
  const [perm, setPerm] = useState<PermState>(notificationState());
  const [editId, setEditId] = useState<string | null>(null);
  const [durationsOpen, setDurationsOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const withReminders = state.habits.filter((h) => h.reminders.length > 0);
  const upcoming = upcomingReminders(state.habits, state.logs, new Date(), { horizonDays: 7 });

  const toggleNotifications = async (on: boolean) => {
    store.updateSettings({ notifications: on });
    // İzin, kullanıcı bildirimleri etkinleştirirken istenir.
    if (on && notificationState() === 'default') setPerm(await requestNotificationPermission());
  };

  const p = settings.pomodoro;

  return (
    <section aria-labelledby="settings-h">
      <header class="screen-head">
        <div>
          <p class="eyebrow">Kaizen</p>
          <h1 id="settings-h">Ayarlar</h1>
        </div>
      </header>

      {state.storageKind === 'memory' && (
        <div class="notice warn" role="alert">
          Bu tarayıcıda kalıcı depolama açılamadı; veriler uygulama kapanınca silinir. Özel gezinme modunu kapat.
        </div>
      )}

      <h2 class="group-title">Görünüm</h2>
      <div class="group">
        <div class="setting solo">
          <Segmented<ThemeSetting>
            class="wide"
            label="Tema"
            value={settings.theme}
            onChange={(theme) => store.updateSettings({ theme })}
            options={[
              { value: 'light', label: 'Açık', icon: 'sun' },
              { value: 'dark', label: 'Koyu', icon: 'moon' },
              { value: 'system', label: 'Sistem', icon: 'monitor' },
            ]}
          />
        </div>
      </div>

      <h2 class="group-title">Bildirimler &amp; İzinler</h2>
      <div class="group">
        <div class="setting">
          <span class="grow">Bildirimler</span>
          <Switch label="Bildirimler" checked={settings.notifications} onChange={toggleNotifications} />
        </div>
        <div class="setting">
          <span class="grow">
            Titreşim (Haptik)
            <span class="muted small block">iPhone’da iOS 17.4+ gerekir.</span>
          </span>
          <Switch
            label="Titreşim"
            checked={settings.haptics}
            onChange={(haptics) => {
              store.updateSettings({ haptics });
              haptic('success', haptics);
            }}
          />
        </div>
        <div class="setting col">
          <div class="row between">
            <span>Bildirim izni</span>
            <span class={`badge ${perm}`}>{{ granted: 'Açık', denied: 'Reddedildi', default: 'Sorulmadı', unsupported: 'Kullanılamıyor' }[perm]}</span>
          </div>
          <PermissionNote perm={perm} />
          {perm === 'default' && (
            <button class="btn" onClick={async () => setPerm(await requestNotificationPermission())}>
              <Icon name="bell" size={18} /> İzin iste
            </button>
          )}
        </div>
        <div class="setting col">
          <p class="hint">
            <b>Önemli:</b> iPhone’da ana ekran uygulamaları (PWA) uygulama kapalıyken zamanlanmış yerel bildirim gönderemez. Hatırlatmalar Kaizen açıkken çalışır. Kapalıyken de hatırlatma istiyorsan aşağıdaki
            dosyayı iPhone Takvim’ine aktar (uyarı olarak çalar).
          </p>
          <button
            class="btn"
            disabled={withReminders.length === 0}
            onClick={() => {
              download('kaizen-hatirlatmalar.ics', 'text/calendar', buildIcs(state.habits, new Date()));
              setMsg('Dosya indirildi. Açıp “Tümünü Ekle” de. Sildiğin/kaldırdığın saatleri Takvim’den elle silmelisin.');
            }}
          >
            Hatırlatmaları Takvim’e aktar (.ics)
          </button>
          <p class="muted small">
            {withReminders.length === 0 ? 'Henüz hatırlatma eklenmiş alışkanlık yok.' : `Kaizen açıkken sonraki 7 günde ${upcoming.length} hatırlatma çalışacak.`}
          </p>
        </div>
      </div>

      <h2 class="group-title">Odaklanma Yapılandırması</h2>
      <div class="group">
        <button class="setting link" onClick={() => setDurationsOpen(true)}>
          <span class="grow">Süre Ayarları</span>
          <span class="muted small">
            {p.focusMin} dk / {p.shortMin} dk
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
        <div class="setting">
          <span class="grow">
            Sessiz Mod
            <span class="muted small block">Süre bitince ses çalmaz.</span>
          </span>
          <Switch label="Sessiz Mod" checked={settings.silent} onChange={(silent) => store.updateSettings({ silent })} />
        </div>
      </div>

      <h2 class="group-title">Alışkanlıklarım</h2>
      <div class="group">
        {state.habits.length === 0 && <p class="muted small pad-in">Henüz alışkanlık yok. Bugün ekranından ekleyebilirsin.</p>}
        {state.habits.map((h) => {
          const rev = currentRevision(h);
          return (
            <button key={h.id} class="setting link" onClick={() => setEditId(h.id)} style={{ '--c': h.color } as JSX.CSSProperties}>
              <span class="habit-icon sm" aria-hidden="true">
                <HabitIcon icon={h.icon} size={18} />
              </span>
              <span class="grow">
                <span class="strong-text">{h.name}</span>
                <span class="muted small block">
                  {rev.target} {rev.unit} · {scheduleSummary(rev.schedule)}
                  {h.reminders.length ? ` · ${h.reminders.length} hatırlatma` : ''}
                </span>
              </span>
              <Icon name="pencil" size={18} />
            </button>
          );
        })}
      </div>

      <h2 class="group-title">Veri</h2>
      <div class="group">
        <div class="setting col">
          <p class="hint">Veriler yalnızca bu cihazda saklanır (hesap/sunucu yok). Uygulamayı silersen veya Safari verilerini temizlersen kaybolur; ara sıra yedek al.</p>
          <button
            class="btn"
            onClick={() => {
              const d = new Date();
              const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              download(`kaizen-yedek-${stamp}.json`, 'application/json', JSON.stringify(store.exportData(), null, 2));
              setMsg('Yedek dosyası indirildi.');
            }}
          >
            Verileri dışa aktar (.json)
          </button>
        </div>
      </div>

      {isIOS() && !isStandalone() && <div class="notice">Daha iyi deneyim için Safari’de Paylaş → “Ana Ekrana Ekle” ile ekleyip oradan aç.</div>}
      <p class="version">Kaizen v{VERSION}</p>

      {msg && (
        <div class="toast" role="status">
          <span>{msg}</span>
          <button class="toast-btn" onClick={() => setMsg(null)}>
            Tamam
          </button>
        </div>
      )}

      {durationsOpen && (
        <Sheet title="Süre Ayarları" onClose={() => setDurationsOpen(false)} closeLabel="Kapat">
          <Durations full />
        </Sheet>
      )}
      {editId && <HabitEditor habit={state.habits.find((h) => h.id === editId)} onClose={() => setEditId(null)} />}
    </section>
  );
}
