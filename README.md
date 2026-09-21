# Kaizen

Kişisel alışkanlık takibi + bağımsız Pomodoro. iPhone'da ana ekrana eklenen çevrimdışı bir web uygulaması (PWA).
Hesap ve sunucu yok; tüm veri cihazdaki IndexedDB'de durur.

**Teknoloji:** Vite + TypeScript + Preact. Testler: Vitest. Mac/Xcode/Apple Developer üyeliği gerekmez.

## Komutlar

```bash
npm install          # ilk kurulum
npm run dev          # geliştirme sunucusu (http://localhost:5173, ağdaki cihazlardan da erişilir)
npm test             # birim/entegrasyon testleri (40 test)
npm run typecheck    # TypeScript denetimi
npm run build        # dist/ klasörüne üretim derlemesi (PWA + service worker dahil)
npm run icons        # uygulama simgelerini yeniden üretir (scripts/make-icons.mjs)
```

## iPhone'a kurulum

Bildirim/çevrimdışı çalışma için uygulamanın **HTTPS** bir adresten yayınlanması gerekir.

### Yol 1 — Kalıcı kurulum (önerilen): GitHub Pages
1. GitHub'da yeni bir depo aç, bu klasörü `main` dalına push'la.
2. Depo → **Settings → Pages → Source: GitHub Actions**. (`.github/workflows/deploy.yml` hazır; testleri çalıştırıp derler ve yayınlar. Ücretsiz hesapta Pages için depo *public* olmalı; verilerin yine yalnızca telefonunda kalır.)
3. Yayın adresini iPhone'da **Safari**'de aç (`https://<kullanici>.github.io/<depo>/`).
4. **Paylaş → Ana Ekrana Ekle → Ekle**. Kaizen'i her zaman ana ekran simgesinden aç.

Alternatif: `npm run build` sonrası `dist/` klasörünü Netlify Drop veya Cloudflare Pages'e yükle; adımlar 3-4 aynı.

### Yol 2 — Yalnızca hızlı deneme (aynı Wi-Fi)
`npm run dev` çalışırken iPhone Safari'de `http://<bilgisayarın-IP'si>:5173` aç. HTTP olduğu için service worker/bildirim/çevrimdışı **çalışmaz**; sadece arayüzü denemek içindir.

### Süre / üyelik kısıtları
- Apple Developer üyeliği gerekmez, **7 günlük sürenin dolması diye bir şey yoktur** (bu, Xcode ile ücretsiz Apple ID kurulumuna özgüdür).
- Web Push/ana ekran bildirim API'leri için iOS **16.4+** gerekir. Titreşim hilesi için iOS **17.4+**.
- iOS, uzun süre kullanılmayan **Safari sekmelerinin** verisini silebilir; **ana ekrana eklenen uygulama** bundan muaftır. Yine de ara sıra *Ayarlar → Verileri dışa aktar* ile yedek al. Uygulamayı ana ekrandan silersen veri de silinir.

## iOS'ta PWA kısıtları (dürüst özet)

| Özellik | Durum |
|---|---|
| Alışkanlık/Pomodoro verisinin kalıcılığı | Çalışır (IndexedDB, çevrimdışı) |
| Uygulama **açıkken** hatırlatma | Çalışır (üstte bant; arka plana geçince bildirim denenir) |
| Uygulama **kapalıyken/kilitliyken zamanlanmış yerel bildirim** | **Yok.** iOS'ta PWA yerel bildirim zamanlayamaz (Notification Triggers desteklenmez). Bu, sunucusuz PWA'nın temel sınırıdır. |
| Pomodoro bitişinde kilit ekranı bildirimi | **Yok** (aynı neden). Sayaç zaman damgasıyla hesaplanır: uygulamayı açtığında durum/kalan süre doğru görünür, bitmişse seans tam bir kez sayılır. |
| Pomodoro sırasında ekran kapanmaması | Wake Lock ile (ayarlanabilir); kilitlenirse JS durur ama sayaç doğru kalır |
| Kapalıyken hatırlatma için çözüm | *Ayarlar → Hatırlatmaları Takvim'e aktar (.ics)*: iPhone Takvim'ine tekrarlayan uyarılar ekler; **kapalıyken/kilitliyken çalışır**. Kaldırdığın saatleri Takvim'den elle silmelisin; "bugün tamamlandıysa iptal" özelliği yoktur. |
| Titreşim | `navigator.vibrate` iOS'ta yok; iOS 17.4+ Safari için `<input switch>` hilesi kullanılır (belgesiz, cihazda doğrulanmalı) |

**Gerçek arka plan bildirimi istersen** iki yol var: (a) küçük bir Web Push sunucusu (ör. Cloudflare Worker; hatırlatma saatleri sunucuya gider, "sunucusuz" ilkesi bozulur) veya (b) Mac + Xcode ile native/Capacitor sürümü. Zamanlama mantığı (`src/core/reminders.ts`) ve 64 bekleyen bildirim sınırı (`PENDING_NOTIFICATION_LIMIT`) platformdan bağımsız yazıldı, ikisine de taşınabilir.

## Nerelerde düzenlenir

| Ne | Nerede |
|---|---|
| Renkler, yarıçap, yazı tipi (Stitch tasarımı: lavanta zemin, mor ana renk; açık/koyu tokenlar) | `src/styles.css` → en üstteki `:root` tokenları |
| Bileşen görünümü | `src/styles.css` (bileşen bölümleri) |
| Ekranlar | `src/ui/TodayScreen.tsx`, `FocusScreen.tsx`, `SettingsScreen.tsx`, `HabitEditor.tsx` |
| Alışkanlık ikonları (çizgi ikon kümesi) | `src/ui/icons.tsx` (`HABIT_ICONS`; yeni ikon = tabloya bir giriş) |
| Alışkanlık renk paleti, birim seçenekleri | `src/ui/HabitEditor.tsx` (`COLORS`, `UNITS`) |
| Pomodoro varsayılan süreleri | `src/core/types.ts` → `DEFAULT_SETTINGS` |
| Streak / plan / halka kuralları | `src/core/streak.ts`, `plan.ts`, `progress.ts` |
| Pomodoro durum makinesi | `src/core/pomodoro.ts` |
| Tarih/saat (tek nokta, test edilebilir) | `src/core/dates.ts` (`Clock`) |
| Kalıcılık ve şema sürümü | `src/storage/storage.ts`, `store.ts` (`SCHEMA_VERSION`) |
| Uygulama adı/simgesi | `vite.config.ts` (manifest), `index.html`, `scripts/make-icons.mjs` |

## Tasarım notları (Stitch'ten sapmalar)
- Alt menüde ikonların altına **etiket** eklendi (erişilebilirlik).
- Profil avatarı yok (hesap yok). Tasarımdaki **"Otomatik Mola" eklenmedi**: şartname sonraki aşamanın kullanıcı başlatınca çalışmasını istiyor.
- Tasarımdaki *Sessiz Mod* (bitiş sesini kapatır) ve *Bildirimler* ana anahtarı (hatırlatmaları topluca kapatır) uygulandı.
- Tasarımda olmayan durumlar (boş liste, plansız gün, tümü tamam, izin reddi, silme onayı) aynı dille tamamlandı.

## Veri modeli notları
- `Habit.revisions`: hedef/birim/tekrar değişiklikleri `from` tarihiyle sürümlenir; bir gün için plan, `from <= gün` olan son sürümdür. Böylece düzenleme geçmişi yeniden yorumlamaz.
- `DayLog`: `(habitId, tarih) → miktar`. Streak, halka ve hatırlatmalar bu kayıtlardan **her seferinde yeniden hesaplanır** (geri alma otomatik yansır).
- `Store.exportData()` sürümlü JSON üretir (`schemaVersion`); yedek/içe aktarma eklemek için hazır.
- Pomodoro: `endsAt` (çalışırken) / `remainingMs` (duraklatınca) saklanır; seans kimliği (`runId`) ile bir seans en fazla bir kez sayılır.

## Görsel inceleme aracı
`node scripts/screenshots.mjs [klasör]` (dev sunucusu açıkken, Chrome ile) iPhone boyutunda açık/koyu ekran görüntüleri üretir.
