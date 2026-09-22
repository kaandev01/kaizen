/**
 * Sekmeler arası basit gezinme. Store singleton'ı (`hooks.ts`) ile aynı
 * desen: App.tsx kendi `setTab`'ini burada kaydeder, alt ekranlar (Bugün,
 * Odaklan, Takvim) prop geçirmeden "Ayarlar" ikonundan geçiş yapabilir.
 */
export type Tab = 'today' | 'focus' | 'calendar' | 'settings';

let navigate: ((tab: Tab) => void) | null = null;

export function setNavigate(fn: (tab: Tab) => void) {
  navigate = fn;
}

export function goToSettings() {
  navigate?.('settings');
}
