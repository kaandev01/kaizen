/**
 * Capacitor (native iOS sarmalayıcı) köprüsü. Web'de/PWA'da (native olmayan
 * ortamda) her şey no-op'tur — mevcut davranış hiç değişmez; yalnızca
 * `ios/` üretilip gerçek bir native derleme çalıştığında devreye girer.
 */
import { Capacitor } from '@capacitor/core';
import { App, type URLOpenListenerEvent } from '@capacitor/app';

export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

export type DeepLinkHandler = (url: string) => void;

let deepLinkHandler: DeepLinkHandler | null = null;

/**
 * Native uygulama bir derin bağlantıyla (`kaizen://...` — ör. e-posta
 * doğrulama/şifre sıfırlama dönüş bağlantısı) açıldığında çağrılacak
 * işleyiciyi kaydeder. Şu an hiçbir modül bunu kullanmıyor; bulut senkron/giriş
 * özelliği (`feature/cloud-sync-auth`) birleşince o taraf burada
 * `supabase.auth.exchangeCodeForSession(url)` çağıracak şekilde bağlanacak —
 * iki dalı birbirine bağımlı kılmamak için kanca şimdiden hazır bırakılıyor.
 */
export function setDeepLinkHandler(handler: DeepLinkHandler | null): void {
  deepLinkHandler = handler;
}

/** main.tsx açılışta bir kez çağırır. Web'de anında döner (dinleyici eklenmez). */
export function initNativeBridge(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    deepLinkHandler?.(event.url);
  });
}
