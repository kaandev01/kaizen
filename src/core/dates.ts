/**
 * Tüm tarih işlemleri burada. Günler yerel takvim gününe göre "YYYY-MM-DD"
 * anahtarıyla temsil edilir; saat dilimi/DST kaymaları anahtar üzerinde
 * hesaplanmaz, Date'in yerel alanları kullanılır.
 */
export type DateKey = string;

/** Test edilebilirlik için "şimdi" her yerde bu arayüzden alınır. */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + n));
}

/** ISO gün numarası: Pazartesi=1 … Pazar=7. */
export function isoWeekday(key: DateKey): number {
  const g = parseDateKey(key).getDay();
  return g === 0 ? 7 : g;
}

/** İki anahtar arasındaki takvim günü farkı (b - a). DST'den etkilenmez. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** "HH:mm" + tarih anahtarı → yerel zaman damgası (ms). */
export function atLocalTime(key: DateKey, hhmm: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/** Bir sonraki yerel gece yarısı (ms). */
export function nextMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const dayShort = (iso: number) => DAY_SHORT[iso - 1];
const DAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const dayLong = (iso: number) => DAY_LONG[iso - 1];

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
/** "Pazartesi, 21 Eylül" — Intl'e bağlı kalmadan, her cihazda aynı çıktı. */
export function formatLongDate(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${dayLong(isoWeekday(key))}, ${d} ${MONTHS[m - 1]}`;
}

/**
 * Uygulama genelinde ortak kısa tarih biçimi: gün önce, ay sonra —
 * "23.09" (yıl gerekmiyorsa). Ajanda satırları gibi dar alanlarda kullanılır.
 */
export function formatShortDate(key: DateKey): string {
  const [, m, d] = key.split('-');
  return `${d}.${m}`;
}

/** Yıl belirtilmesi gerektiğinde: "23.09.2026". */
export function formatFullDate(key: DateKey): string {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

/** Ana ekranın üst başlığı: "22 Eylül Salı" — virgülsüz, hafta günü sonda. */
export function formatHomeDate(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${dayLong(isoWeekday(key))}`;
}

/** Hafta günü olmadan gün+ay: "23 Eylül" (ör. Takvim'de seçili gün başlığı). */
export function formatDayMonth(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Bir zaman damgasını yerel "HH:mm" olarak biçimlendirir (24 saat, günlük/ajanda saatleri için). */
export function formatClockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "23.09.2026 18:30" — Intl/yerel ayarlara bağlı kalmadan, ör. yedek dosyası zaman damgaları için. */
export function formatFullDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatFullDate(toDateKey(d))} ${formatClockTime(ms)}`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/**
 * Gün değişimini izler: her 30 sn, sayfa görünür/odaklı olunca ve gece
 * yarısında kontrol eder. Uyku/arka plandan dönüşte zamanlayıcılar donmuş
 * olabileceği için tek başına setTimeout'a güvenilmez.
 */
export function createDayWatcher(clock: Clock, onChange: (today: DateKey) => void) {
  let current = toDateKey(clock.now());
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const next = toDateKey(clock.now());
    if (next !== current) {
      current = next;
      onChange(next);
    }
    armMidnight();
  };
  const armMidnight = () => {
    if (midnightTimer) clearTimeout(midnightTimer);
    const ms = Math.max(nextMidnight(clock.now()) - clock.now().getTime() + 50, 50);
    midnightTimer = setTimeout(check, Math.min(ms, 2 ** 31 - 1));
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };

  armMidnight();
  const pollTimer = setInterval(check, 30_000);
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) {
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', onVisible);
  }
  return {
    today: () => current,
    check,
    stop() {
      if (midnightTimer) clearTimeout(midnightTimer);
      clearInterval(pollTimer);
      if (hasWindow) {
        window.removeEventListener('focus', check);
        window.removeEventListener('pageshow', check);
        document.removeEventListener('visibilitychange', onVisible);
      }
    },
  };
}
