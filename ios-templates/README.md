# ios-templates/

Bu klasördeki dosyalar `ios/` klasörü henüz repoda yokken duruyor (Windows'ta
`npx cap add ios` çalıştırılamaz — yalnızca macOS'ta çalışır, bkz. kök
README'deki "iOS / TestFlight" bölümü).

`.github/workflows/ios-testflight.yml`, `ios/fastlane/` boşsa bu şablonları
oraya kopyalar (yalnızca ilk çalıştırmada — sonrasında `ios/fastlane/` altında
elle yaptığın değişiklikler korunur, üzerine yazılmaz):

- `Fastfile` → `ios/fastlane/Fastfile`
- `Appfile` → `ios/fastlane/Appfile`
- `Gemfile` → `ios/Gemfile`

Bunları elle kopyalamana/çalıştırmana gerek yok — GitHub Actions'taki iş akışı
bunu otomatik yapar.
