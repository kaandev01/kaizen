/**
 * Sekmeler arası basit gezinme. Store singleton'ı (`hooks.ts`) ile aynı
 * desen: App.tsx kendi `setTab`'ini burada kaydeder, alt ekranlar (Bugün,
 * Odaklan, Takvim) prop geçirmeden "Ayarlar" ikonundan geçiş yapabilir.
 */
export type Tab = 'today' | 'focus' | 'calendar' | 'settings';

let navigate: ((tab: Tab) => void) | null = null;
/** Takvim'e geçerken hangi alt görünümün (ızgara/liste) açılacağı — bir sonraki mount'ta tüketilir. */
let pendingCalendarView: 'calendar' | 'list' | null = null;
/** Bir bildirime/canlı uyarıya dokununca ilgili kayıt doğrudan açılsın diye. */
let pendingAgendaTarget: { date: string; itemId: string } | null = null;

export function setNavigate(fn: (tab: Tab) => void) {
  navigate = fn;
}

export function goToSettings() {
  navigate?.('settings');
}

/** Ana ekranın "Yaklaşan" bölümündeki "Tümü" düğmesi: Takvim'i doğrudan Liste görünümünde açar. */
export function goToAgendaList() {
  pendingCalendarView = 'list';
  navigate?.('calendar');
}

/** Canlı hatırlatma bandındaki "Aç": Takvim'i o günde, ilgili kaydı açık olarak gösterir. */
export function goToAgendaItem(date: string, itemId: string) {
  pendingCalendarView = 'calendar';
  pendingAgendaTarget = { date, itemId };
  navigate?.('calendar');
}

/** CalendarScreen mount olurken bir kez okur; yoksa null döner (varsayılan: Takvim görünümü). */
export function consumePendingCalendarView(): 'calendar' | 'list' | null {
  const v = pendingCalendarView;
  pendingCalendarView = null;
  return v;
}

export function consumePendingAgendaTarget(): { date: string; itemId: string } | null {
  const v = pendingAgendaTarget;
  pendingAgendaTarget = null;
  return v;
}
