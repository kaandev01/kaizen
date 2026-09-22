// Faz 1-4 doğrulama betiği: gerçek çalışan uygulamayı (dev sunucusu) Puppeteer
// ile sürer, iddia edilen davranışları DOM üzerinden assert eder ve anahtar
// ekranlardan ekran görüntüsü alır.
//   node scripts/verify-phase.mjs [çıktı-klasörü] [url]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'verify-out';
const url = process.argv[3] ?? 'http://localhost:5173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(out, { recursive: true });
const downloadDir = path.resolve(out, 'downloads');
mkdirSync(downloadDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function assert(cond, label) {
  if (cond) console.log('OK   ', label);
  else {
    failures++;
    console.log('FAIL ', label);
  }
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const clickText = async (text, scope = 'body') => {
  const ok = await page.evaluate(
    (t, s) => {
      const root = document.querySelector(s);
      const b = [...root.querySelectorAll('button')].find((x) => x.textContent.trim().includes(t));
      if (b) b.click();
      return !!b;
    },
    text,
    scope,
  );
  if (!ok) throw new Error('düğme yok: ' + text);
  await sleep(200);
};
const clickSel = async (sel) => {
  await page.click(sel);
  await sleep(200);
};
const typeInto = async (sel, text) => {
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, text);
};
const textOf = async (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const exists = async (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
const countOf = async (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
// İç içe sayfalarda (ör. Takvim gün detayı → Ajanda düzenle) en son açılan her
// zaman DOM'da en sondaki eşleşmedir — bu yüzden "son" olanı hedefliyoruz.
const clickTextLast = async (text, sel) => {
  const ok = await page.evaluate(
    (t, s) => {
      const nodes = [...document.querySelectorAll(s)];
      for (let i = nodes.length - 1; i >= 0; i--) {
        const b = [...nodes[i].querySelectorAll('button')].find((x) => x.textContent.trim().includes(t));
        if (b) {
          b.click();
          return true;
        }
      }
      return false;
    },
    text,
    sel,
  );
  if (!ok) throw new Error('düğme yok (son eşleşmede): ' + text);
  await sleep(200);
};
const lastOf = async (sel, prop = 'textContent') =>
  page.evaluate(
    (s, p) => {
      const nodes = document.querySelectorAll(s);
      const el = nodes[nodes.length - 1];
      return el ? el[p] : null;
    },
    sel,
    prop,
  );

await page.goto(url, { waitUntil: 'networkidle0' });
await shot('01-bos');

// ---- Faz 1: alışkanlık ekle (mevcut akış hâlâ çalışıyor mu) ------------------
await clickSel('.empty .btn');
await page.type('input[placeholder="Örn. Su iç"]', 'Su iç');
await clickSel('button[aria-label="Sembol: droplet"]');
await page.click('input[aria-label="Günlük hedef"]', { clickCount: 3 });
await page.type('input[aria-label="Günlük hedef"]', '8');
await clickText('bardak', '[role=dialog] .chips');
await clickText('Kaydet', '[role=dialog]');
await sleep(300);
assert((await countOf('.habit')) === 1, 'Faz1: alışkanlık eklendi (mevcut özellik korunmuş)');

// ---- Faz 2: mikrofon düğmesi Bugün ekranında, artırma düğmesinden ayrı -------
const micLabel = await page.evaluate(() => document.querySelector('button[aria-label*="Bugüne not ekle"]')?.getAttribute('aria-label'));
assert(!!micLabel, 'Faz2: mikrofon düğmesi Bugün ekranında mevcut');
await clickSel('button[aria-label*="Bugüne not ekle"]');
await sleep(200);
assert(await exists('.journal-panel'), 'Faz2: Günlük paneli açıldı');

// Gün puanı: seç, tekrar aynı puana bas → temizlenir.
await clickSel('.rating-dot:nth-child(8)'); // 8
assert((await page.evaluate(() => document.querySelector('.rating-dot.on')?.textContent)) === '8', 'Faz3: gün puanı 8 seçildi');
await clickSel('.rating-dot:nth-child(8)'); // aynısına tekrar bas → temizle
assert((await countOf('.rating-dot.on')) === 0, 'Faz3: gün puanı tekrar basınca temizlendi (0 asla kaydedilmez)');
await clickSel('.rating-dot:nth-child(9)'); // 9 ile bırak
await sleep(150);

// Yazılı giriş: metin yaz, KAYDETMEDEN mikrofonu dene → hata sonrası metin kaybolmamalı.
await typeInto('.journal-compose textarea', 'Bugün iyi geçti, 5 km koştum');
const before = await page.$eval('.journal-compose textarea', (el) => el.value);
const micBtn = await page.$('.journal-compose .mic-btn');
if (micBtn) {
  await micBtn.click();
  await sleep(1500); // headless Chrome'da mikrofon izni/donanımı yok; onerror beklenir
  const afterText = await page.$eval('.journal-compose textarea', (el) => el.value);
  assert(afterText === before, 'Faz2: tanıma hatasında yazılmış metin KAYBOLMADI');
  const hadWarn = await exists('.journal-compose .hint.warn');
  console.log(hadWarn ? '   (mikrofon hata mesajı gösterildi — izin/donanım yok, beklenen)' : '   (mikrofon desteklenmiyor veya hata vermedi)');
} else {
  assert(await exists('.journal-compose'), 'Faz2: bu ortamda mikrofon desteklenmiyor, yazılı giriş çalışıyor');
}
await shot('02-gunluk-yazili');

await clickText('Kaydet', '.journal-compose');
await sleep(200);
assert((await countOf('.journal-entry')) === 1, 'Faz1/2: not kaydedildi');
await typeInto('.journal-compose textarea', 'İkinci not: akşam kitap okudum');
await clickText('Kaydet', '.journal-compose');
await sleep(200);
assert((await countOf('.journal-entry')) === 2, 'Faz1: aynı güne birden fazla not eklenebiliyor');

// Notu düzenle
await clickSel('.journal-entry:first-child button[aria-label="Notu düzenle"]');
await page.$eval('.journal-entry.editing textarea', (el) => (el.value = ''));
await page.type('.journal-entry.editing textarea', 'Düzenlendi: 6 km koştum');
await clickText('Kaydet', '.journal-entry.editing');
await sleep(200);
assert((await textOf('.journal-entry:first-child .journal-text'))?.includes('6 km'), 'Faz1: not düzenlendi');

// Notu sil
await clickSel('.journal-entry:last-child button[aria-label="Notu sil"]');
await sleep(150);
await clickText('Sil', '[role=alertdialog]');
await sleep(200);
assert((await countOf('.journal-entry')) === 1, 'Faz1: not silindi');
await shot('03-gunluk-son');
await clickText('Kapat', '[role=dialog]');
await sleep(200);

// ---- Faz 3: Takvim -----------------------------------------------------------
await clickText('Takvim', '.tabbar');
await sleep(250);
assert(await exists('.cal-grid'), 'Faz3: Takvim aylık ızgara render edildi');
const monthTitle1 = await textOf('#calendar-h');
await clickSel('button[aria-label="Sonraki ay"]');
await clickSel('button[aria-label="Sonraki ay"]');
const monthTitle2 = await textOf('#calendar-h');
assert(monthTitle1 !== monthTitle2, 'Faz3: ay ileri gezinme çalışıyor');
await clickText('Bugün', '.month-nav');
await sleep(150);
const monthTitle3 = await textOf('#calendar-h');
assert(monthTitle3 === monthTitle1, 'Faz3: "Bugün" düğmesi geçerli aya döndürüyor');
await shot('04-takvim');

await clickSel('.cal-cell.is-today');
await sleep(300);
assert(await exists('.journal-panel'), 'Faz3: gün detayında Günlük paneli var');
assert((await countOf('.journal-entry')) === 1, 'Faz3: gün detayı, Bugün ekranında eklenen notu gösteriyor (aynı veri)');
assert((await countOf('.agenda-row')) === 0, 'Faz3: gün detayı açılışta ajanda boş durumunu gösteriyor');

// Ajanda kaydı ekle (saatli + hatırlatıcılı)
await clickText('+ Ekle', '.sheet');
await sleep(200);
await page.type('input[placeholder="Örn. Matematik sınavı"]', 'Matematik sınavı');
await clickTextLast('Sınav', '[role=dialog]');
// tüm gün kapat, saat gir (en son açılan diyalog: AgendaEditor)
const allDaySwitch = await page.evaluateHandle(() => {
  const dialogs = document.querySelectorAll('[role=dialog]');
  return dialogs[dialogs.length - 1].querySelector('.panel .switch');
});
await allDaySwitch.asElement().click();
await sleep(150);
const timeInputHandle = await page.evaluateHandle(() => {
  const dialogs = document.querySelectorAll('[role=dialog]');
  return dialogs[dialogs.length - 1].querySelector('input[type=time]');
});
await timeInputHandle.asElement().evaluate((el) => {
  el.value = '10:00';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await clickTextLast('Kaydet', '[role=dialog]');
await sleep(300);
assert((await countOf('.agenda-row')) === 1, 'Faz3: ajanda kaydı eklendi');
assert((await textOf('.agenda-title'))?.includes('Matematik'), 'Faz3: ajanda başlığı doğru');
await shot('05-gun-detayi-ajanda');

// Düzenle: tamamlandı işaretle
await clickSel('.agenda-check');
await sleep(200);
assert(await page.evaluate(() => document.querySelector('.agenda-row').classList.contains('done')), 'Faz3: ajanda kaydı tamamlandı olarak işaretlendi (checkbox)');

// Sil (düzenleme ekranından)
await clickSel('.agenda-main');
await sleep(200);
await clickTextLast('Kaydı Sil', '[role=dialog]');
await sleep(150);
await clickText('Sil', '[role=alertdialog]');
await sleep(250);
assert((await countOf('.agenda-row')) === 0, 'Faz3: ajanda kaydı silindi');

// Alışkanlıklar gün detayında görünüyor mu (salt okunur)
assert((await countOf('.mini-habit')) === 1, 'Faz3: gün detayında alışkanlık ilerlemesi (salt okunur) gösteriliyor');
assert((await exists('.mini-habit .add-btn')) === false, 'Faz3: gün detayındaki alışkanlık satırında artırma düğmesi YOK (salt okunur)');

// Odaklanma özeti: henüz seans yok → boş durum metni (gün detayının son .field'ı)
assert((await lastOf('.sheet.tall .form > .field'))?.includes('Pomodoro kaydı yok'), 'Faz1: Odaklanma bölümü boş-durum metnini gösteriyor');
await clickText('Kapat', '.sheet.tall');
await sleep(200);

// ---- Faz 4: Hedefler ----------------------------------------------------------
await clickSel('button[aria-label="Hedefler"]');
await sleep(250);
assert(await exists('.sheet'), 'Faz4: Hedefler sayfası açıldı');
await clickText('+ Hedef Ekle', '.sheet');
await sleep(200);
await page.type('input[placeholder="Örn. Haftada 3 gün spor"]', 'Günde 10.000 adım');
await clickTextLast('Kaydet', '[role=dialog]');
await sleep(300);
assert((await countOf('.group .setting.link')) >= 1, 'Faz4: aylık hedef listede görünüyor');

// Yıllık döneme geçince aylık hedef görünmemeli
await clickText('Yıllık', '.sheet .segmented');
await sleep(200);
assert((await countOf('.group .setting.link')) === 0, 'Faz4: yıllık dönemde aylık hedef görünmüyor — dönem hedefleri karışmıyor');
await clickText('Aylık', '.sheet .segmented');
await sleep(200);
assert((await countOf('.group .setting.link')) >= 1, 'Faz4: aylık döneme dönünce hedef yine görünüyor (silinmedi)');

await clickSel('.group .setting.link');
await sleep(200);
await clickTextLast('Tamamlandı', '[role=dialog] .segmented');
await clickTextLast('Kaydet', '[role=dialog]');
await sleep(250);
assert((await textOf('.group .setting.link .muted'))?.includes('Tamamlandı'), 'Faz4: hedef durumu güncellendi');
await clickSel('.group .setting.link');
await sleep(200);
await clickTextLast('Hedefi Sil', '[role=dialog]');
await sleep(150);
await clickText('Sil', '[role=alertdialog]');
await sleep(250);
assert(await exists('.sheet .hint'), 'Faz4: hedef silindi');
await clickText('Kapat', '.sheet');
await sleep(200);

// ---- Ayarlar: yedek dışa aktar → geri yükle (tam döngü) -----------------------
await clickSel('button[aria-label="Ayarlar"]');
await sleep(250);
await clickText('Verileri dışa aktar (.json)', 'main');
await sleep(1200); // indirme tamamlansın
const files = readdirSync(downloadDir).filter((f) => f.endsWith('.json'));
assert(files.length === 1, 'Faz1/Veri: yedek dosyası indirildi');
const backupPath = path.join(downloadDir, files[0]);
const backupJson = JSON.parse(readFileSync(backupPath, 'utf8'));
assert(backupJson.app === 'kaizen' && typeof backupJson.schemaVersion === 'number', 'Faz1/Veri: yedek dosyası sürüm bilgisi taşıyor');
assert(backupJson.journal?.length === 1 && backupJson.pomoSessions !== undefined && backupJson.agenda !== undefined && backupJson.goals !== undefined, 'Faz4: yedek yeni koleksiyonların hepsini içeriyor');

// Anlamlı bir karşılaştırma için gerçek yedeği FARKLI bir alışkanlık adıyla
// değiştirip ikinci bir "başka cihazdan gelen yedek" dosyası üretelim.
const otherBackup = { ...backupJson, habits: [{ ...backupJson.habits[0], id: 'baska-cihaz-1', name: 'Yedekteki Alışkanlık' }] };
const otherBackupPath = path.join(downloadDir, 'baska-cihaz-yedek.json');
await import('node:fs/promises').then((fs) => fs.writeFile(otherBackupPath, JSON.stringify(otherBackup)));

const fileInput = await page.$('input[type=file]');
await fileInput.uploadFile(otherBackupPath);
await sleep(400);
assert(await exists('[role=alertdialog]'), 'Veri: geri yükleme onay ekranı çıkıyor (otomatik uygulanmıyor)');
assert((await textOf('[role=alertdialog]'))?.includes('silinip'), 'Veri: geri yüklemenin mevcut veriye etkisi açıkça belirtiliyor');
await shot('06-geri-yukleme-onay');
await clickText('Vazgeç', '[role=alertdialog]');
await sleep(300);
const settingsTextAfterCancel = await page.evaluate(() => document.body.innerText);
assert(settingsTextAfterCancel.includes('Su iç') && !settingsTextAfterCancel.includes('Yedekteki Alışkanlık'), 'Veri: Vazgeç ile veri DEĞİŞMEDİ (onaysız geri yükleme yok)');

// Şimdi gerçekten onaylayalım: veri yedektekiyle değişmeli.
await fileInput.uploadFile(otherBackupPath);
await sleep(400);
await clickText('Geri Yükle', '[role=alertdialog]');
await sleep(400);
const settingsTextAfterConfirm = await page.evaluate(() => document.body.innerText);
assert(settingsTextAfterConfirm.includes('Yedekteki Alışkanlık') && !settingsTextAfterConfirm.includes('Su iç'), 'Veri: onaylayınca veri gerçekten yedektekiyle değişti');
await shot('07-ayarlar-geri-yuklendi');

await clickText('Bugün', '.tabbar');
await sleep(300);
assert((await countOf('.habit')) === 1 && (await textOf('.habit-name'))?.includes('Yedekteki'), 'Veri: geri yüklenen alışkanlık Bugün ekranında da görünüyor');

console.log('\n' + (failures === 0 ? `TÜMÜ BAŞARILI (0 hata)` : `${failures} DOĞRULAMA BAŞARISIZ`));
await browser.close();
process.exit(failures === 0 ? 0 : 1);
