import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { flushCurrentStore } from './ui/hooks';
import { Root } from './ui/Root';
import './styles.css';

try {
  const root = document.getElementById('app')!;
  // Sekme kapanırken/arka plana giderken bekleyen yazmaların bitmesine izin ver.
  // Store, oturum durumuna göre Root.tsx içinde değişebildiğinden (her hesap kendi
  // veritabanında) sabit bir referans yerine her zaman GÜNCEL store'a bakan
  // `flushCurrentStore()` kullanılır.
  window.addEventListener('pagehide', () => void flushCurrentStore());
  render(<Root />, root);
} catch (e) {
  console.error(e);
  document.getElementById('app')!.innerHTML = '<p style="padding:24px;font-family:system-ui">Kaizen başlatılamadı. Sayfayı yenilemeyi dene.</p>';
}

registerSW({ immediate: true });
