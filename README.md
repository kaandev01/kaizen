# Kaizen

Kişisel alışkanlık takibi + bağımsız Pomodoro + günlük + takvim/deadline + aylık-yıllık hedefler.
iPhone'da ana ekrana eklenen çevrimdışı bir web uygulaması (PWA). Hesap ve sunucu yok; tüm veri
cihazdaki IndexedDB'de durur. **AI/LLM bağlantısı yok** — veri modeli gelecekteki bir analiz fazına
hazır tutulur (bkz. [Hafıza/dönemsel sorgular](#hafıza--dönemsel-sorgular-gelecekteki-ai-fazı-için)),
ama bu sürümde hiçbir şey otomatik yorumlanmaz veya AI'ya gönderilmez.

**Teknoloji:** Vite + TypeScript + Preact. Testler: Vitest. Mac/Xcode/Apple Developer üyeliği gerekmez.

## Komutlar

```bash
npm install          # ilk kurulum
npm run dev          # geliştirme sunucusu (http://localhost:5173, ağdaki cihazlardan da erişilir)
npm test             # birim/entegrasyon testleri (102 test)
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
`npm run dev` çalışırken iPhone Safari'de `http://<bilgisayarın-IP'si>:5173` aç. HTTP olduğu için service worker/bildirim/çevrimdışı/**sesle giriş çalışmaz**; sadece arayüzü denemek içindir (Web Speech API güvenli bağlam — HTTPS ya da localhost — ister).

### Süre / üyelik kısıtları
- Apple Developer üyeliği gerekmez, **7 günlük sürenin dolması diye bir şey yoktur** (bu, Xcode ile ücretsiz Apple ID kurulumuna özgüdür).
- Web Push/ana ekran bildirim API'leri için iOS **16.4+** gerekir. Titreşim hilesi için iOS **17.4+**.
- iOS, uzun süre kullanılmayan **Safari sekmelerinin** verisini silebilir; **ana ekrana eklenen uygulama** bundan muaftır. Yine de ara sıra *Ayarlar → Verileri dışa aktar* ile yedek al. Uygulamayı ana ekrandan silersen veri de silinir.

## Ekranlar ve gezinme

Alt menü: **Bugün / Odaklan / Takvim**. Ayarlar her ekranın sağ üstündeki dişli ikonuyla açılır (ayrı bir sekme değil).

- **Bugün:** alışkanlık ilerlemesi + günlük halka (değişmedi) ve küçük bir **mikrofon düğmesi** (bugüne hızlıca not eklemek için — alışkanlık artırma düğmeleriyle karışmaz, ayrı bir alanda).
- **Odaklan:** bağımsız Pomodoro (değişmedi).
- **Takvim:** aylık ızgara. Bir güne dokununca o günün **gün puanı, günlük notları, ajanda kayıtları, alışkanlık ilerlemesi (salt okunur) ve Pomodoro özeti** tek sayfada açılır. Üstteki hedef ikonu **Hedefler** sayfasını açar.

## Pomodoro geçmişi

Her odaklanma (focus) seansı `PomoSession` olarak kalıcı kaydedilir: benzersiz kimlik, planlanan süre,
gerçek **çalışma aralıkları** (`segments`), bunlardan hesaplanan `activeMs` ve durum (`completed` / `stopped`).

- Duraklama ve mola süreleri hiçbir zaman `activeMs`'e eklenmez — yalnızca gerçekten "running" olunan aralıklar sayılır.
- Erken bitirilen (sıfırlanan/aşama değiştirilen) bir odaklanma seansının çalışılmış süresi **saklanır** ama tamamlanan Pomodoro sayısına eklenmez (`status: 'stopped'`).
- Aynı seans (`runId`) birden fazla kez kaydedilmez — uygulama yeniden açılışında veya yarım kalmış bir yazmadan sonra tekilleştirilir.
- Gece yarısını geçen bir seansın aktif süresi ilgili günlere **oranla dağıtılır** (`src/core/pomoStats.ts` → `splitByLocalDay`); tamamlanma sayısı ise seansın **bittiği** güne yazılır.
- Takvim → gün detayı, o günün "N Pomodoro · X saat Y dakika" özetini ve seans saatlerini gösterir.

## Günlük (yazılı + sesle giriş)

- Aynı güne birden fazla not eklenebilir; her biri ayrı düzenlenir/silinir.
- **Sesle giriş** tarayıcının **Web Speech API**'sini kullanır (`src/ui/speech.ts`). Dürüst sınırlar:
  - **iOS Safari bu API'yi desteklemez** — yazının yazıldığı tarihte. Desteklenmeyen bir cihazda mikrofon düğmesi görünmez, yazılı giriş sorunsuz çalışır.
  - Destekleyen tarayıcılarda (ör. masaüstü Chrome) tanıma genellikle **sunucu tabanlıdır ve internet gerektirir**; cihazda/çevrimdışı çalıştığı **iddia edilmez**.
  - Tanıma hatasında (izin reddi, ağ sorunu, sessizlik) **yazılmış metin kaybolmaz**; yalnızca bir uyarı gösterilir.
  - Yeni tanınan (final) metin, mevcut metni **silmeden** sonuna eklenir; kaydetmeden önce serbestçe düzenlenebilir.
  - **Ham ses hiçbir zaman saklanmaz**; yalnızca "Kaydet" dendiğinde nihai metin kalıcı olur.
- Günlük metni yalnızca bir nottur — "8 bardak su içtim" yazmak alışkanlık sayaçlarını **değiştirmez** (bu fazda hiçbir metin çıkarımı/otomatik tamamlama yok).

## Gün puanı

1-10 arası, isteğe bağlı, gün başına tek puan (Takvim → gün detayı içinde, Günlük panelinin üstünde). Zaten seçili olan puana tekrar basmak temizler. Girilmemiş gün için hiçbir zaman `0` kaydı oluşturulmaz.

## Takvim / ajanda (deadline, sınav, yapılacak, diğer)

- Aylık ızgara, Pazartesi başlangıçlı. Gecikmiş (tamamlanmamış + süresi geçmiş) kaydı olan günler kırmızı noktayla işaretlenir.
- Kayıt alanları: başlık, tür, tarih, isteğe bağlı saat (yoksa "tüm gün"), açıklama, isteğe bağlı hatırlatma saati, tamamlandı/tamamlanmadı.
- **Tüm günlük bir kayıt kendi günü bitmeden gecikmiş sayılmaz**; saatli bir kayıt saatini geçince gecikmiş sayılır. Tamamlanan kayıtlar hiçbir zaman gecikmiş sayılmaz (`src/core/agenda.ts` → `isOverdue`).
- Düzenleme/silme, hatırlatma zamanlamasını otomatik günceller (hatırlatma anahtarı tarih+saate bağlıdır; bkz. `agendaRemindersBetween`).
- Tekrarlayan etkinlikler ve harici takvim senkronizasyonu bu fazda **yok** (kapsam dışı, bilinçli).

## Aylık / yıllık hedefler

Takvim → hedef ikonundan açılır. Tamamen isteğe bağlı (zorunlu onboarding adımı değil). Alanlar: başlık, açıklama, dönem (ay ya da yıl), durum (devam ediyor/tamamlandı/vazgeçildi). Dönem geçse de (ay/yıl değişse de) hedefler **silinmez**; geçmiş dönemler Hedefler sayfasında dönem seçiciyle gezilebilir. AI hiçbir hedef önermez veya değiştirmez; hedefler alışkanlık listesine otomatik eklenmez.

## Hafıza / dönemsel sorgular (gelecekteki AI fazı için)

`src/core/periods.ts` ve `src/core/memory.ts`, **rapor üretmeden**, yalnızca bir tarih aralığına
düşen kayıtları toplamayı kolaylaştırır:
- `lastCompletedPeriod('week'|'month'|'quarter'|'year', bugün)` → rapor takviminin ("tamamlanan hafta
  için sonraki pazartesi", "önceki ay için yeni ayın başı", çeyrekler için 1 Ocak/Nisan/Temmuz/Ekim, yıl
  için 1 Ocak) tanımladığı en son tamamlanmış dönemin aralığını döndürür.
- `snapshotForRange(veri, aralık)` → o aralığa düşen alışkanlık günlerini (**o günkü** hedef/tekrar planıyla,
  bugünkü ayarlarla yeniden yorumlamadan), Pomodoro seanslarını, günlük notlarını, gün puanlarını, ajanda
  kayıtlarını ve dönemi kesişen hedefleri tek nesnede toplar.

Bu modül hiçbir zamanlayıcı, otomatik rapor veya AI çağrısı içermez — yalnızca ileride bir analiz
katmanının üzerine kolayca inşa edilebileceği, test edilmiş bir sorgu katmanıdır.

## iOS'ta PWA kısıtları (dürüst özet)

| Özellik | Durum |
|---|---|
| Tüm verinin (alışkanlık, Pomodoro, günlük, puan, ajanda, hedef) kalıcılığı | Çalışır (IndexedDB, çevrimdışı) |
| Uygulama **açıkken** alışkanlık/ajanda hatırlatması | Çalışır (üstte bant; arka plana geçince bildirim denenir) |
| Uygulama **kapalıyken/kilitliyken zamanlanmış yerel bildirim** | **Yok.** iOS'ta PWA yerel bildirim zamanlayamaz (Notification Triggers desteklenmez). Bu, sunucusuz PWA'nın temel sınırıdır — hem alışkanlıklar hem ajanda için geçerli. |
| Pomodoro bitişinde kilit ekranı bildirimi | **Yok** (aynı neden). Sayaç zaman damgasıyla hesaplanır: uygulamayı açtığında durum/kalan süre doğru görünür, bitmişse seans tam bir kez sayılır. |
| Pomodoro sırasında ekran kapanmaması | Wake Lock ile (ayarlanabilir); kilitlenirse JS durur ama sayaç doğru kalır |
| Sesle günlük girişi | **iOS Safari'de yok** (Web Speech API desteklenmiyor). Yazılı giriş her zaman çalışır. |
| Kapalıyken hatırlatma için çözüm | *Ayarlar → Hatırlatmaları Takvim'e aktar (.ics)*: iPhone Takvim'ine tekrarlayan uyarılar ekler (yalnızca alışkanlıklar için); **kapalıyken/kilitliyken çalışır**. Kaldırdığın saatleri Takvim'den elle silmelisin. |
| Titreşim | `navigator.vibrate` iOS'ta yok; iOS 17.4+ Safari için `<input switch>` hilesi kullanılır (belgesiz, cihazda doğrulanmalı) |

**Gerçek arka plan bildirimi istersen** iki yol var: (a) küçük bir Web Push sunucusu (ör. Cloudflare Worker; hatırlatma saatleri sunucuya gider, "sunucusuz" ilkesi bozulur) veya (b) Mac + Xcode ile native/Capacitor sürümü.

## Nerelerde düzenlenir

| Ne | Nerede |
|---|---|
| Renkler, yarıçap, yazı tipi (Stitch tasarımı: lavanta zemin, mor ana renk; açık/koyu tokenlar) | `src/styles.css` → en üstteki `:root` tokenları |
| Bileşen görünümü | `src/styles.css` (bileşen bölümleri) |
| Ana ekranlar | `src/ui/TodayScreen.tsx`, `FocusScreen.tsx`, `CalendarScreen.tsx`, `SettingsScreen.tsx` |
| Gün detayı / ajanda / hedefler / günlük panelleri | `src/ui/DayDetailSheet.tsx`, `AgendaEditor.tsx`, `GoalsSheet.tsx`, `GoalEditor.tsx`, `JournalPanel.tsx` |
| Sesle giriş sarmalayıcısı | `src/ui/speech.ts` |
| Sekmeler arası gezinme (Ayarlar dişlisi) | `src/ui/nav.ts` |
| Alışkanlık ikonları (çizgi ikon kümesi) | `src/ui/icons.tsx` (`HABIT_ICONS`; yeni ikon = tabloya bir giriş) |
| Alışkanlık renk paleti, birim seçenekleri | `src/ui/HabitEditor.tsx` (`COLORS`, `UNITS`) |
| Pomodoro varsayılan süreleri | `src/core/types.ts` → `DEFAULT_SETTINGS` |
| Streak / plan / halka kuralları | `src/core/streak.ts`, `plan.ts`, `progress.ts` |
| Pomodoro durum makinesi + geçmiş | `src/core/pomodoro.ts`, `pomoStats.ts` |
| Ajanda mantığı (gecikme, sıralama, hatırlatma) | `src/core/agenda.ts` |
| Hedef yardımcıları | `src/core/goals.ts` |
| Dönem/tarih aralığı hesapları | `src/core/periods.ts` |
| Hafıza sorguları | `src/core/memory.ts` |
| Yedek doğrulama/göç | `src/core/backup.ts` |
| Tarih/saat (tek nokta, test edilebilir) | `src/core/dates.ts` (`Clock`) |
| Kalıcılık ve şema sürümü | `src/storage/storage.ts`, `store.ts` (`SCHEMA_VERSION`) |
| Uygulama adı/simgesi | `vite.config.ts` (manifest), `index.html`, `scripts/make-icons.mjs` |

## Tasarım notları (Stitch'ten sapmalar)
- Alt menü üçe indirildi (**Bugün / Odaklan / Takvim**); Ayarlar artık her ekranın köşesindeki küçük dişli ikonuyla açılıyor, ayrı bir sekme değil.
- Profil avatarı yok (hesap yok). Tasarımdaki **"Otomatik Mola" eklenmedi**: şartname sonraki aşamanın kullanıcı başlatınca çalışmasını istiyor.
- Tasarımdaki *Sessiz Mod* (bitiş sesini kapatır) ve *Bildirimler* ana anahtarı (hatırlatmaları topluca kapatır) uygulandı.
- Tasarımda olmayan durumlar (boş liste, plansız gün, tümü tamam, izin reddi, silme onayı, mikrofon desteklenmiyor/hata, yedek geri yükleme onayı) aynı dille tamamlandı.

## Veri modeli notları
- `Habit.revisions`: hedef/birim/tekrar değişiklikleri `from` tarihiyle sürümlenir; bir gün için plan, `from <= gün` olan son sürümdür. Böylece düzenleme geçmişi yeniden yorumlamaz. Aynı ilke `PomoSession.segments`, `JournalEntry`, `AgendaItem`, `Goal` için de geçerlidir: her kayıt kendi tarih/zaman damgasını taşır, hiçbiri "bugünkü ayarlarla" yeniden hesaplanmaz.
- `DayLog`: `(habitId, tarih) → miktar`. Streak, halka ve hatırlatmalar bu kayıtlardan **her seferinde yeniden hesaplanır** (geri alma otomatik yansır).
- `PomoSession`: `segments` (gerçek çalışma aralıkları) tek kaynak; `activeMs` bunlardan türetilir, gün bazlı dağılım da aynı alandan hesaplanır (`pomoStats.ts`).
- `DayRating`: `date` birincil anahtar — gün başına tek kayıt; puan silinince kayıt tamamen kaldırılır (asla `score: 0` yazılmaz).
- **Şema sürümü 2** (`SCHEMA_VERSION`): v1'den yükseltmede eski `meta.pomoHistory` blobu yeni `pomoSessions` deposuna taşınır (veri kaybı yok); o an sürmekte olan bir Pomodoro varsa (canlı, geçici durum) güvenle `idle`'a sıfırlanır — kalıcı geçmiş etkilenmez. Yeni koleksiyonlar (`journal`, `ratings`, `agenda`, `goals`) v1'de hiç yoktu, boş başlar.
- `Store.exportData()` / `parseBackup()` (`src/core/backup.ts`): sürümlü JSON, eski (v1) yedekleri de aynı göç mantığıyla kabul eder. `Store.restoreBackup()` **tüm veriyi** tek bir IndexedDB işleminde (ya hep ya hiç) değiştirir; canlı Pomodoro sayacı asla geri yüklenmez (temiz/idle başlar — geçmişte kalmış bir zaman damgasının "az önce tamamlandı" gibi yorumlanıp sahte kayıt üretmesini engeller).

## Doğrulama araçları
- `node scripts/screenshots.mjs [klasör]` — dev sunucusu açıkken, temel akışların (alışkanlık, Pomodoro, ayarlar) açık/koyu ekran görüntülerini üretir.
- `node scripts/verify-phase.mjs [klasör]` — dev sunucusu açıkken, bu fazın **tüm** yeni özelliklerini (günlük + sesle giriş hata yolu, gün puanı, takvim gezinme, ajanda CRUD + gecikme, hedefler + dönem izolasyonu, gerçek dosya indirme/yükleme ile yedek geri yükleme — onaylı/onaysız) gerçek tarayıcıda sürüp assert eder; başarısızlıkta çıkış kodu 1 döner.
