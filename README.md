# Kaizen

Kişisel alışkanlık takibi + bağımsız Pomodoro + günlük + takvim/deadline + aylık-yıllık hedefler.
iPhone'da ana ekrana eklenen çevrimdışı bir web uygulaması (PWA). Tüm veri her zaman önce cihazdaki
IndexedDB'de durur (çevrimdışı çalışır); isteğe bağlı bir hesap/bulut senkron katmanı da var —
bkz. [Bulut senkron / kullanıcı girişi](#bulut-senkron--kullanıcı-girişi). **AI/LLM bağlantısı yok** —
veri modeli gelecekteki bir analiz fazına hazır tutulur (bkz. [Hafıza/dönemsel sorgular](#hafıza--dönemsel-sorgular-gelecekteki-ai-fazı-için)),
ama bu sürümde hiçbir şey otomatik yorumlanmaz veya AI'ya gönderilmez.

**Teknoloji:** Vite + TypeScript + Preact. Testler: Vitest. Bulut tarafı: Supabase (Auth + Postgres +
Row Level Security). Mac/Xcode/Apple Developer üyeliği gerekmez.

## Komutlar

```bash
npm install          # ilk kurulum
npm run dev          # geliştirme sunucusu (http://localhost:5173, ağdaki cihazlardan da erişilir)
npm test             # birim/entegrasyon testleri (122 test)
npm run typecheck    # TypeScript denetimi
npm run build        # dist/ klasörüne üretim derlemesi (PWA + service worker dahil)
npm run icons        # uygulama simgelerini yeniden üretir (scripts/make-icons.mjs)
```

## Bulut senkron / kullanıcı girişi

Giriş **zorunludur** — uygulama açılışta e-posta/şifre ile giriş/kayıt ister (bkz. `src/ui/AuthScreen.tsx`, `Root.tsx`). Mevcut cihazdaki veri kaybolmaz: ilk başarılı girişten sonra "bu cihazdaki verileri hesabına aktar" teklif edilir (bkz. `src/sync/migrate.ts`). Giriş sonrası tüm ekleme/düzenleme/silme, cihazda hızlı çalışmaya devam ederken (iyimser güncelleme, aynen eskisi gibi) arka planda bir giden kuyruk üzerinden buluta senkronlanır (`src/sync/engine.ts`) — çevrimdışıyken yapılan değişiklikler kuyrukta bekler, bağlantı gelince otomatik gönderilir; Ayarlar → Hesap'ta "Güncel / Gönderiliyor / Çevrimdışı" durumu görünür.

**Kendi Supabase projeni kurman gerekiyor** (ücretsiz plan yeterli). Hiçbir gizli anahtar bu depoya veya sohbete girmez:

1. [supabase.com](https://supabase.com)'da ücretsiz bir proje oluştur.
2. Proje → **SQL Editor**'de `supabase/migrations/0001_init.sql` dosyasının **tamamını** yapıştırıp çalıştır (tablolar + Row Level Security politikaları + senkron fonksiyonunu tek seferde kurar).
3. Proje → **Settings → API**'den `Project URL` ve `anon public` anahtarını al.
4. Yerel geliştirme için: `.env.example`'ı `.env.local` olarak kopyala, iki değeri gir (`.env.local` asla commit edilmez).
5. Yayınlanan (GitHub Pages) sürüm için: repo → **Settings → Secrets and variables → Actions**'a `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` olarak ekle (`ci.yml`/`deploy.yml` build adımında okunur).
6. Supabase → **Authentication → URL Configuration**'da Site URL / Redirect URLs'e yayın adresini (`https://<kullanıcı>.github.io/<depo>/`) ekle — e-posta doğrulama/şifre sıfırlama bağlantıları oraya döner.

Bu iki değer (`URL` + `anon key`) herkese açık/istemci-güvenli değerlerdir — Supabase'in tasarımı gereği tarayıcıda görünmeleri normaldir; gerçek güvenlik sınırı veritabanındaki Row Level Security politikalarıdır (her kullanıcı yalnızca kendi satırlarını okuyabilir/yazabilir). `.env.local`'e veya buraya **asla** `service_role` anahtarı ya da veritabanı şifresi girilmez.

Bu adımlar tamamlanmadan uygulama **bulutsuz modda çalışmaya devam eder** — env değişkenleri boşsa `src/sync/supabaseClient.ts` `null` döner, giriş ekranı "yapılandırma eksik" uyarısı gösterir, derleme/testler kırılmaz.

### Çakışma stratejisi
- Alışkanlık günlük miktarları (+1/-1 dokunuşu ve doğrudan düzeltmeler): **delta (fark) olarak** gönderilir, sunucuda atomik olarak toplanır (`apply_day_log_delta`) — iki cihazın art arda artışları asla birbirini silmez. Bilinçli ödün: tam aynı anda iki cihazdan yapılan "mutlak" düzeltmeler toplamsal birleşir (sayaç-birleştirmede standart davranış).
- Diğer her şey (alışkanlıklar, ajanda, günlük, gün puanı, hedefler, ayarlar): son yazan kazanır (sunucu zaman damgasına göre).
- Silme **tombstone** (`deleted_at`) ile yapılır — eski bir cihaz bağlanınca silinen kayıt geri gelmez.
- Aktif (çalışan) Pomodoro sayacı senkronlanmaz; yalnızca tamamlanmış/durdurulmuş seanslar buluta gider.

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
- **Takvim:** aylık ızgara + **Takvim/Liste** geçişi. Bir güne dokununca o günün ajanda kayıtları **takvimin altında satır içi** hemen görünür (ekleme bir modal içinde olur ama sonucu görmek için modal açmak GEREKMEZ). "Gün detayı" düğmesi ayrıca o günün **gün puanı, günlük notları, alışkanlık ilerlemesi (salt okunur) ve Pomodoro özetini** açar. Üstteki hedef ikonu **Hedefler** sayfasını açar.

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

**Bir defa gerçek bir hata olarak bildirildi ve düzeltildi:** deadline kaydedildikten sonra hiçbir
şey görünmüyordu. Kök neden üç ayrı sorundu (ayrıntılar [Bilinen düzeltmeler](#bilinen-düzeltmeler-deadline-görünmezlik-hatası) altında);
şimdi ekleme akışı **iyimser + doğrulanmış**: kayıt anında satır içi listede görünür, gerçek
kalıcı yazma başarısız olursa otomatik geri alınır ve kullanıcıya panel kapanmadan gösterilir.

- Aylık ızgara, Pazartesi başlangıçlı; **Takvim/Liste** geçişi. Gecikmiş kaydı olan günler kırmızı, diğerleri nötr noktayla işaretlenir (bir hücrede en fazla 3 nokta).
- Seçili günün ajandası **takvimin hemen altında, satır içi** listelenir — hiçbir modal açmadan görünür; boşsa yalnızca "Bu gün için kayıt yok" yazar.
- Kayıt alanları: başlık, tür, tarih, isteğe bağlı saat (yoksa "tüm gün"), **önem** (normal/önemli/kritik — kullanıcı seçer), isteğe bağlı not, **birden fazla hatırlatma**, tamamlanma durumu + tamamlanma zamanı.
- **Önem, zamana bağlı aciliyetle karıştırılmaz**: aciliyet (`urgencyOf`) yalnızca tarihten hesaplanır; "kritik" işaretli ama uzak bir kayıt aciliyet açısından hâlâ "later"dır.
- **Tüm günlük bir kayıt kendi günü bitmeden gecikmiş sayılmaz**; saatli bir kayıt saatini geçince gecikmiş sayılır. Tamamlanan kayıtlar hiçbir zaman gecikmiş sayılmaz (`src/core/agenda.ts` → `isOverdue`).
- Hatırlatmalar: 1 hafta/1 gün/1 saat önce, tam zamanında, özel tarih+saat — çoklu seçilebilir. **Tüm günlük bir kayıtta offset tabanlı hatırlatma eklemek için kullanıcı açıkça bir "hatırlatma saati" seçmek ZORUNDADIR** — hiçbir zaman gizlice gece yarısına düşmez (`reminderTriggerAt`, boş anchor'da `null` döner, hatırlatma planlanmaz). Geçmişte kalacak bir hatırlatma editörde açıkça işaretlenir.
- Düzenleme/silme, hatırlatma zamanlamasını otomatik günceller (her hatırlatmanın anahtarı kayıt+hatırlatma+tetiklenme anına bağlıdır; bkz. `agendaRemindersBetween`); tamamlanma geri alınırsa gelecekteki hatırlatmalar tekrar geçerli olur.
- **Bugün ekranı → Yaklaşan:** günlük ilerlemenin altında, en fazla 3 tamamlanmamış kayıt (gecikenler önce), her biri kısa bir aciliyet ifadesiyle ("Bugün 18.00", "Yarın", "3 gün kaldı", "2 gün gecikti"). Kayıt yoksa bölüm hiç render edilmez. "Tümü" → Takvim'i doğrudan Liste görünümünde açar.
- **Liste görünümü:** Geciken / Bugün / Yaklaşan / Tamamlanan (varsayılan kapalı) gruplu, tüm ajandayı tarihten bağımsız gösterir.
- Tekrarlayan etkinlikler ve harici takvim senkronizasyonu bu fazda **yok** (kapsam dışı, bilinçli).

## Bilinen düzeltmeler: deadline görünmezlik hatası

Araştırma (oluşturma→saklama→sorgulama→gösterme zincirinin uçtan uca gerçek tarayıcıda sürülmesi)
zincirin kendisinin doğru çalıştığını gösterdi, ama üç gerçek hata bulundu ve düzeltildi:

1. **Çift dokunma aynı kaydı iki kez oluşturuyordu.** React/Preact state güncellemeleri eşzamanlı
   değildir; aynı JS turunda arka arkaya gelen iki tıklama, henüz yeniden render edilmemiş `saving`
   state'ini ikisi de "false" görebiliyordu. Düzeltme: gerçek koruma bir `useRef` (senkron) ile
   yapılıyor; `useState` yalnızca düğmenin görünümü için kullanılıyor (`AgendaEditor.tsx`).
2. **Kaydetme, gerçek IndexedDB yazması bitmeden paneli kapatıyordu.** `Store.addAgendaItem`/
   `updateAgendaItem` artık kaydın kendisini VE gerçek yazmanın sonucunu (`Promise<boolean>`)
   birlikte döndürür (`Persisted<T>`); UI bunu bekler. Yazma başarısız olursa iyimser eklenen kayıt
   **otomatik geri alınır**, panel KAPANMAZ, girilen bilgiler korunur, hata gösterilir.
3. **Hata bandı açık bir panelin arkasında kalabiliyordu** (z-index çakışması: bant 30, panel 50).
   Düzeltme: kaydetme hatası bandı ve toast, her panelden daha yüksek katmanda gösteriliyor.

Bunlara ek olarak görünürlük zayıftı: kayıttan sonra "Eklendi" bildirimi yoktu, ana ekranda
deadline hiç görünmüyordu, takvimdeki işaret küçüktü. Bunlar `Yaklaşan` bölümü, satır içi gün
listesi ve toast ile giderildi (yukarıya bakın).

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
| Gün detayı / ajanda / hedefler / günlük panelleri | `src/ui/DayDetailSheet.tsx`, `AgendaEditor.tsx`, `AgendaRow.tsx`, `AgendaListView.tsx`, `GoalsSheet.tsx`, `GoalEditor.tsx`, `JournalPanel.tsx` |
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
| Giriş/kayıt ekranı, oturum yönlendirme | `src/ui/AuthScreen.tsx`, `src/ui/Root.tsx` |
| Bulut şeması + RLS + senkron fonksiyonu | `supabase/migrations/0001_init.sql` |
| Senkron motoru, yerel↔bulut eşleme, ilk aktarım | `src/sync/engine.ts`, `mapping.ts`, `migrate.ts`, `supabaseClient.ts`, `types.ts` |

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
- `node scripts/verify-phase.mjs [klasör]` — dev sunucusu açıkken, günlük + sesle giriş hata yolu, gün puanı, takvim gezinme, ajanda CRUD + gecikme, hedefler + dönem izolasyonu, gerçek dosya indirme/yükleme ile yedek geri yükleme (onaylı/onaysız) akışlarını gerçek tarayıcıda sürüp assert eder.
- `node scripts/verify-deadline-fix.mjs [url]` — deadline görünmezlik hatasının düzeltmesini (satır içi anında görünürlük, "Eklendi" toast, çift-dokunma koruması, tüm günlük hatırlatmada zorunlu saat, Yaklaşan/Liste görünümü, tamamla/geri al, yeniden açılışta kalıcılık) gerçek tarayıcıda uçtan uca doğrular.
