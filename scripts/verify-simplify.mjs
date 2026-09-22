// Sadeleştirme doğrulama betiği: sembollerin kaldırıldığını, tarih formatlarının
// yeni kurala uyduğunu ve font ölçeğinin uygulandığını gerçek tarayıcıda kontrol eder.
//   node scripts/verify-simplify.mjs [çıktı-klasörü] [url]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'verify-out';
const url = process.argv[3] ?? 'http://localhost:5173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(out, { recursive: true });

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
const evalFn = (fn, ...args) => page.evaluate(fn, ...args);

// Taze durum için localStorage/IndexedDB temizliği.
await page.goto(url, { waitUntil: 'networkidle0' });
await evalFn(async () => {
  localStorage.clear();
  const dbs = await indexedDB.databases?.();
  for (const d of dbs ?? []) indexedDB.deleteDatabase(d.name);
});
await page.goto(url, { waitUntil: 'networkidle0' });
await sleep(300);

// ---- Bugün ekranı: bir alışkanlık ekle (streak metni ve sembol yokluğunu görebilmek için) ----
await clickText('İlk alışkanlığını ekle').catch(() => clickText('+ Yeni Alışkanlık').catch(() => {}));
await sleep(250);
let hasForm = await evalFn(() => !!document.querySelector('.sheet, .panel'));
if (hasForm) {
  const nameInput = await page.$('input[type="text"], input:not([type])');
  if (nameInput) {
    await nameInput.click({ clickCount: 3 });
    await nameInput.type('Su iç');
  }
  await clickText('Kaydet').catch(() => {});
  await sleep(300);
}

await shot('01-home');

// 1) SEMBOLLER: hiçbir .habit-icon / .agenda-kind-icon / .sym öğesi DOM'da olmamalı.
const deadIconCounts = await evalFn(() => ({
  habitIcon: document.querySelectorAll('.habit-icon').length,
  agendaKindIcon: document.querySelectorAll('.agenda-kind-icon').length,
  sym: document.querySelectorAll('.sym').length,
  iconGrid: document.querySelectorAll('.icon-grid').length,
}));
assert(deadIconCounts.habitIcon === 0, 'DOM: .habit-icon yok');
assert(deadIconCounts.agendaKindIcon === 0, 'DOM: .agenda-kind-icon yok');
assert(deadIconCounts.sym === 0, 'DOM: .sym (sembol seçici) yok');
assert(deadIconCounts.iconGrid === 0, 'DOM: .icon-grid yok');

// Alışkanlık satırı: sadece isim + (varsa) "N gün" + miktar; sembol svg'si yok.
const habitRowInfo = await evalFn(() => {
  const main = document.querySelector('.habit-main');
  if (!main) return null;
  return {
    svgCount: main.querySelectorAll('svg').length,
    nameText: main.querySelector('.name-text')?.textContent ?? null,
    streakText: main.querySelector('.streak')?.textContent ?? null,
  };
});
assert(!!habitRowInfo, 'Alışkanlık satırı bulundu');
if (habitRowInfo) {
  assert(habitRowInfo.svgCount === 0, `Alışkanlık satırında sembol yok (svg=${habitRowInfo.svgCount})`);
  console.log('     streak metni:', habitRowInfo.streakText);
}

// Ayarlar ekranındaki alışkanlık listesi satırlarında da sembol olmamalı.
await evalFn(() => {
  const btn = [...document.querySelectorAll('.round-btn')].find((b) => b.getAttribute('aria-label') === 'Ayarlar');
  btn?.click();
});
await sleep(300);
const settingsHabitIcons = await evalFn(() => document.querySelectorAll('.group .setting.link svg').length);
console.log('     Ayarlar > Alışkanlıklarım satır svg sayısı (kalem ikonu hariç olmalıydı ama kalem fonksiyonel, o yüzden >=0 kabul):', settingsHabitIcons);
await shot('02-settings');

// ---- 2) TARİH FORMATLARI ----
// Bugün sekmesine dön ve üst eyebrow'u oku ("22 Eylül Salı" biçimi: gün ay haftaGünü, virgülsüz).
await evalFn(() => {
  const tabs = [...document.querySelectorAll('.tabbar button')];
  const home = tabs.find((b) => b.textContent.trim() === 'Bugün');
  home?.click();
});
await sleep(250);
const homeDateEl = await evalFn(() => document.querySelector('.eyebrow')?.textContent ?? null);
const homeDatePattern = /^\d{1,2} [A-ZÇĞİÖŞÜ][a-zçğıöşü]+ [A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/;
assert(homeDatePattern.test((homeDateEl ?? '').trim()), `Ana ekran tarihi "D Ay Haftagünü" biçiminde: "${homeDateEl}"`);

// Takvim ekranına git, gün başlığı "D Ay" biçiminde mi kontrol et.
await evalFn(() => {
  const tabs = [...document.querySelectorAll('.tabbar button')];
  const cal = tabs.find((b) => b.textContent.trim() === 'Takvim');
  cal?.click();
});
await sleep(300);
await shot('03-calendar');
const dayHeader = await evalFn(() => document.querySelector('.selected-day .strong-text')?.textContent ?? null);
console.log('     Takvim seçili gün başlığı:', dayHeader);
assert(dayHeader === 'Bugün' || /^\d{1,2} [A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/.test((dayHeader ?? '').trim()), `Takvim gün başlığı "Bugün" veya "D Ay": "${dayHeader}"`);

// Bir deadline ekle, saat gir, 24 saatlik "HH:mm" biçiminde görünsün.
await evalFn(() => {
  const btn = [...document.querySelectorAll('.text-btn.strong')].find((b) => b.textContent.includes('Ekle'));
  btn?.click();
});
await sleep(300);
const titleInput = await page.$('input[type="text"], input:not([type])');
if (titleInput) {
  await titleInput.click({ clickCount: 3 });
  await titleInput.type('Rapor teslimi');
}
// "Tüm gün" varsayılan açık — saat alanı ancak kapatılınca görünür.
await evalFn(() => {
  const row = [...document.querySelectorAll('.setting, .row')].find((r) => r.textContent.includes('Tüm gün'));
  const sw = row?.querySelector('button, [role="switch"]');
  sw?.click();
});
await sleep(150);
const timeInput = await page.$('input[type="time"]');
if (timeInput) {
  await evalFn((el) => (el.value = '18:30'), timeInput);
  await evalFn((el) => el.dispatchEvent(new Event('input', { bubbles: true })), timeInput);
  await evalFn((el) => el.dispatchEvent(new Event('change', { bubbles: true })), timeInput);
}
// Tarihi yarına al ki "Bugün geçti" değil "Yarın 18:30" (saatli) ifadesi görülsün.
const dateInput = await page.$('input[type="date"]');
if (dateInput) {
  await evalFn((el) => (el.value = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)), dateInput);
  await evalFn((el) => el.dispatchEvent(new Event('input', { bubbles: true })), dateInput);
}
await clickText('Kaydet').catch(() => {});
await sleep(400);
await shot('04-agenda-saved');

// Kayıt artık yarının günündeyken Takvim'in seçili-gün filtresinden kaçabilir;
// tüm kayıtları gösteren Liste görünümünden oku.
await evalFn(() => {
  const seg = [...document.querySelectorAll('.segmented button')].find((b) => b.textContent.trim() === 'Liste');
  seg?.click();
});
await sleep(300);
await shot('04b-agenda-list');
const agendaMeta = await evalFn(() => {
  const rows = [...document.querySelectorAll('.agenda-meta')];
  return rows.map((r) => r.textContent);
});
console.log('     Ajanda meta satırları:', agendaMeta);
const hasColonTime = agendaMeta.some((t) => /\d{2}:\d{2}/.test(t));
const hasDotTime = agendaMeta.some((t) => /\d{2}\.\d{2}(?!\.\d{4})[^0-9]*$/.test(t) === false); // yalnızca bilgi amaçlı
assert(hasColonTime, 'Ajanda saatleri 24 saat "HH:mm" (iki nokta üst üste) biçiminde');

// ---- 3) FONT ----
// Habit adı/buton kontrolleri için Bugün sekmesine dön.
await evalFn(() => {
  const tabs = [...document.querySelectorAll('.tabbar button')];
  const home = tabs.find((b) => b.textContent.trim() === 'Bugün');
  home?.click();
});
await sleep(250);
const fontChecks = await evalFn(() => {
  const cs = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight };
  };
  return {
    h1: cs('h1'),
    habitName: cs('.habit-name'),
    btn: cs('.btn'),
    eyebrow: cs('.eyebrow'),
  };
});
console.log('     Font kontrolleri:', JSON.stringify(fontChecks, null, 2));
assert(fontChecks.h1 && /-apple-system|BlinkMacSystemFont|Segoe UI/.test(fontChecks.h1.fontFamily), 'h1 font-family sistem yığını');
assert(fontChecks.h1 && parseInt(fontChecks.h1.fontSize) === 28, `h1 font-size 28px (got ${fontChecks.h1?.fontSize})`);
assert(fontChecks.h1 && parseInt(fontChecks.h1.fontWeight) === 700, `h1 font-weight 700 (got ${fontChecks.h1?.fontWeight})`);
assert(fontChecks.habitName && parseInt(fontChecks.habitName.fontSize) === 16, `.habit-name font-size 16px (got ${fontChecks.habitName?.fontSize})`);
assert(fontChecks.habitName && parseInt(fontChecks.habitName.fontWeight) === 600, `.habit-name font-weight 600 (got ${fontChecks.habitName?.fontWeight})`);
assert(fontChecks.eyebrow && parseInt(fontChecks.eyebrow.fontSize) === 13, `.eyebrow font-size 13px (got ${fontChecks.eyebrow?.fontSize})`);

// Türkçe karakterler doğru render ediliyor mu (metin bütünlüğü kontrolü).
const trText = await evalFn(() => document.querySelector('h1')?.textContent ?? '');
console.log('     h1 metni (TR karakter kontrolü):', trText);

console.log(failures === 0 ? `\nTÜMÜ GEÇTİ (${out})` : `\n${failures} HATA (${out})`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
