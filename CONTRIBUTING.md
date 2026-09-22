# Katkı rehberi (iki kişilik çalışma düzeni)

## Dallar

| Dal | Ne için | Kim yazar |
|---|---|---|
| `main` | **Yayındaki sürüm.** `main`'e giren her şey birkaç dakika içinde `https://kaandev01.github.io/kaizen/` adresine otomatik yayınlanır. | Kimse doğrudan yazmaz; yalnızca `dev` → `main` Pull Request'i ile |
| `dev` | Entegrasyon dalı. Hazır işler burada birleşir, birlikte denenir. | Kimse doğrudan yazmaz; yalnızca kişisel dallardan Pull Request ile |
| `feature/<kisa-ad>` | Bir iş için kişisel dal (ör. `feature/istatistik`, `fix/streak-gece`). | İşi yapan kişi |

Kural: **herkes kendi dalında çalışır, `dev`'e Pull Request açar.** Böylece iki kişi aynı anda çalışırken birbirinin yarım kalmış işini bozmaz.

## İlk kurulum (yeni developer)

```bash
git clone https://github.com/kaandev01/kaizen.git
cd kaizen
git checkout dev
npm install
npm run dev          # http://localhost:5173
```

Projeyi **OneDrive/Dropbox gibi eşitlenen bir klasörün dışında** tut (ör. `C:\dev\kaizen`). Eşitleme `.git` ve `node_modules` ile çakışıp depoyu bozabilir.

Kimliğini bu depo için ayarla:

```bash
git config user.name  "Adın Soyadın"
git config user.email "github-e-postan@ornek.com"
```

## Günlük akış

```bash
# 1) Güncel dev'den yeni iş dalı aç
git checkout dev
git pull
git checkout -b feature/yeni-is

# 2) Çalış, sık ve küçük commit at
git add -A
git commit -m "Kısa ve açık bir açıklama"

# 3) Göndermeden önce dev'deki yeniliklerle güncelle (çakışmaları kendi dalında çöz)
git fetch origin
git rebase origin/dev        # ya da: git merge origin/dev

# 4) Kontrol
npm run typecheck && npm test

# 5) Dalını gönder ve GitHub'da Pull Request aç (hedef: dev)
git push -u origin feature/yeni-is
```

Pull Request'te CI (tip denetimi + test + derleme) otomatik çalışır. **Yeşil olmadan ve diğer kişi göz atmadan birleştirme.** Birleştirdikten sonra dalı sil ve `dev`'i çek:

```bash
git checkout dev && git pull
git branch -d feature/yeni-is
```

## Yayın (dev → main)

`dev` kararlı ve telefonda denenmişse **`dev` → `main` Pull Request'i** aç, CI yeşilse **"Create a merge commit"** ile birleştir. `main` güncellenince yayın kendiliğinden yapılır. Yayından sonra:

```bash
git checkout dev
git pull origin main      # main'deki birleştirme commit'ini dev'e de al
```

Acil hata düzeltmesi: `main`'den `fix/...` dalı aç, PR'ı doğrudan `main`'e gönder; sonra `main`'i `dev`'e geri birleştir.

## Çakışmayı azaltmak için

- **İşi bölüştürün, dosyaları değil sorumlulukları:** biri `src/core` + `tests` (mantık), diğeri `src/ui` + `styles.css` (görünüm) gibi.
- `src/styles.css` tek büyük dosya; çakışma en çok orada çıkar. Farklı ekranların stillerini farklı bölümlere ekleyin, dosyanın sonuna yığmayın.
- `package.json`/`package-lock.json` değişikliklerini (yeni paket) hemen PR'la birleştirin; uzun süre dalda bekletmeyin. Çakışırsa `package-lock.json`'ı elle düzeltme: `git checkout origin/dev -- package-lock.json && npm install`.
- Bir dosyayı büyük ölçüde yeniden yazacaksan diğer kişiye önceden haber ver.

## Kurallar

- **Testler:** mantık değişiyorsa (`src/core`, `src/storage`) test ekle/güncelle. `npm test` geçmeden PR açma.
- **Commit mesajı:** Türkçe, kısa, ne yaptığını anlatan (ör. `Seri hesabı gece yarısı sınırında düzeltildi`).
- **Şema değişikliği** (veri modeli): `SCHEMA_VERSION` artırılır ve geçiş yazılır (`src/storage/store.ts`). Aksi halde telefondaki mevcut veri bozulabilir.
- **Asla commit'leme:** `node_modules`, `dist`, `.env`, kişisel anahtarlar.
- **iPhone'da doğrula:** arayüz/PWA/bildirim değişiklikleri, `dev` → `main` öncesi gerçek cihazda denenmeli (README'deki kontrol listesi).

## Faydalı komutlar

```bash
git status                      # ne değişti
git log --oneline --graph -15   # son geçmiş
git stash / git stash pop       # yarım işi geçici kenara al
git restore <dosya>             # bir dosyadaki değişikliği at
git branch -a                   # tüm dallar
```
