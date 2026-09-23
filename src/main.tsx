import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { systemClock } from './core/dates';
import { openBestStorage } from './storage/storage';
import { Store } from './storage/store';
import { App } from './ui/App';
import { setStore } from './ui/hooks';
import { initNativeBridge, isNativePlatform } from './ui/native';
import './styles.css';

async function boot() {
  initNativeBridge(); // native (Capacitor) sarmalayıcıda kancaları kurar; web'de no-op
  const root = document.getElementById('app')!;
  try {
    const { storage, fallbackReason } = await openBestStorage();
    if (fallbackReason) console.warn('Bellek deposuna geçildi:', fallbackReason);
    const store = new Store(storage, systemClock);
    await store.init();
    // Tarayıcıdan "veriyi otomatik temizleme" istemek (destekleniyorsa).
    void navigator.storage?.persist?.();
    setStore(store);
    // Sekme kapanırken/arka plana giderken bekleyen yazmaların bitmesine izin ver.
    window.addEventListener('pagehide', () => void store.flush());
    render(<App />, root);
  } catch (e) {
    console.error(e);
    root.innerHTML = '<p style="padding:24px;font-family:system-ui">Kaizen başlatılamadı. Sayfayı yenilemeyi dene.</p>';
  }
}

void boot();
// Service worker yalnızca web/PWA'da anlamlı — native (Capacitor) sarmalayıcıda
// web varlıkları zaten uygulamayla birlikte paketlenir, ayrı bir SW'ye gerek yok.
if (!isNativePlatform()) registerSW({ immediate: true });
