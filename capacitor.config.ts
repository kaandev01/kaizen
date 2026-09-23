import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Bu dosya `ios/` klasörü henüz yokken de repoda durabilir — `npx cap add ios`
 * çalıştığında (yalnızca macOS'ta mümkün, bkz. .github/workflows/ios-testflight.yml)
 * burayı okuyarak native projeyi bu ayarlarla üretir.
 *
 * `appId` App Store Connect'e kaydetmeden önce değiştirilebilir; ilk kez orada
 * bir uygulama oluşturulunca sabitlenir. `webDir: 'dist'` — mevcut `npm run
 * build` çıktısı aynen kullanılır, Capacitor için ayrı bir derleme adımı yok.
 */
const config: CapacitorConfig = {
  appId: 'com.kaandev.kaizen',
  appName: 'Kaizen',
  webDir: 'dist',
};

export default config;
