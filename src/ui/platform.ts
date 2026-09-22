/**
 * Tarayıcı/iOS'a özgü yetenekler. Hepsi özellik denetimiyle korunur; bir
 * yetenek yoksa sessizce atlanır. Native (Capacitor) sürüme geçilirse yalnızca
 * bu dosya ve `notifications` bölümü değiştirilir.
 */

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Ana ekrandan (bağımsız pencere olarak) mı açıldı? */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// ---- titreşim --------------------------------------------------------------
let switchLabel: HTMLLabelElement | null = null;

function iosTick() {
  // iOS 17.4+ Safari: `switch` özellikli onay kutusuna dokunmak hafif titreşim verir.
  // Belgelenmiş bir API değildir; çalışmazsa sessizce etkisiz kalır.
  try {
    if (!switchLabel) {
      switchLabel = document.createElement('label');
      switchLabel.setAttribute('aria-hidden', 'true');
      switchLabel.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      switchLabel.appendChild(input);
      document.body.appendChild(switchLabel);
    }
    switchLabel.click();
  } catch {
    /* yoksay */
  }
}

export function haptic(kind: 'tap' | 'success', enabled: boolean) {
  if (!enabled) return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(kind === 'success' ? [18, 50, 30] : 8);
    return;
  }
  iosTick();
  if (kind === 'success') setTimeout(iosTick, 90);
}

// ---- ses (Pomodoro bitişi, uygulama açıkken) -------------------------------
let audioCtx: AudioContext | null = null;

/** Kullanıcı dokunuşu içinde çağrılmalı (iOS ses kilidini açar). */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audioCtx ??= new AC();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* yoksay */
  }
}

export function beep() {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [0, 0.28, 0.56].forEach((d, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.frequency.value = i === 2 ? 1046 : 784;
      gain.gain.setValueAtTime(0.0001, t0 + d);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.22);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t0 + d);
      osc.stop(t0 + d + 0.25);
    });
  } catch {
    /* yoksay */
  }
}

// ---- ekranı açık tut -------------------------------------------------------
type WakeLockSentinelLike = { release(): Promise<void> };
let wakeLock: WakeLockSentinelLike | null = null;

export async function setWakeLock(on: boolean) {
  try {
    if (!on) {
      await wakeLock?.release();
      wakeLock = null;
      return;
    }
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } };
    if (wakeLock || !nav.wakeLock || document.visibilityState !== 'visible') return;
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

// ---- bildirimler -----------------------------------------------------------
export type PermState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationState(): PermState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as PermState;
}

/** Kullanıcı dokunuşu içinde çağrılmalı. */
export async function requestNotificationPermission(): Promise<PermState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return (await Notification.requestPermission()) as PermState;
  } catch {
    return notificationState();
  }
}

async function registration() {
  try {
    return (await navigator.serviceWorker?.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export async function showNotification(title: string, body: string, tag: string) {
  if (notificationState() !== 'granted') return;
  const reg = await registration();
  if (reg) await reg.showNotification(title, { body, tag, icon: './icon-192.png' });
  else new Notification(title, { body, tag });
}

/** Gösterilmiş/bekleyen bildirimleri etikete göre kapatır. */
export async function cancelNotifications(match: (tag: string) => boolean) {
  const reg = await registration();
  if (!reg) return;
  try {
    const list = await reg.getNotifications({ includeTriggered: true } as GetNotificationOptions);
    list.filter((n) => match(n.tag)).forEach((n) => n.close());
  } catch {
    /* yoksay */
  }
}

/**
 * Pomodoro bitişi için zamanlanmış bildirim (Notification Triggers).
 * iOS Safari/PWA bu API'yi DESTEKLEMEZ; yalnızca destekleyen tarayıcılarda çalışır.
 * Dönüş: gerçekten zamanlandı mı.
 */
export async function schedulePomodoroEnd(endsAt: number, title: string, body: string): Promise<boolean> {
  await cancelPomodoroEnd();
  const TT = (globalThis as unknown as { TimestampTrigger?: new (t: number) => unknown }).TimestampTrigger;
  if (!TT || notificationState() !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  try {
    await reg.showNotification(title, { body, tag: 'pomodoro-end', showTrigger: new TT(endsAt) } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

export const cancelPomodoroEnd = () => cancelNotifications((t) => t === 'pomodoro-end');
export const cancelHabitNotifications = (habitId: string) => cancelNotifications((t) => t.startsWith(`habit:${habitId}`));
export const cancelAgendaNotifications = (itemId: string) => cancelNotifications((t) => t.startsWith(`agenda:${itemId}`));
