// Geliştirme aracı: çalışan dev/preview sunucusundan iPhone boyutunda ekran görüntüleri alır.
//   node scripts/screenshots.mjs [çıktı-klasörü] [url]
// Chrome/Edge yolunu CHROME_PATH ile değiştirebilirsiniz.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'shots';
const url = process.argv[3] ?? 'http://localhost:5173';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(scheme) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(url, { waitUntil: 'networkidle0' });
  const shot = (name) => page.screenshot({ path: `${out}/${scheme}-${name}.png` });
  const click = async (sel) => {
    await page.click(sel);
    await sleep(250);
  };
  const clickText = async (text, scope = 'body') => {
    const ok = await page.evaluate((t, s) => {
      const b = [...document.querySelector(s).querySelectorAll('button')].find((x) => x.textContent.trim().includes(t));
      if (b) b.click();
      return !!b;
    }, text, scope);
    if (!ok) throw new Error('düğme yok: ' + text);
    await sleep(250);
  };
  const setTarget = async (n) => {
    await page.click('input[aria-label="Günlük hedef"]');
    await page.keyboard.type(String(n)); // odakta içerik seçilir, yazı üstüne yazar
  };
  const addHabit = async ({ name, icon, target, unit, days, remind }) => {
    await click('button[aria-label="Yeni alışkanlık ekle"]');
    await page.type('input[placeholder="Örn. Su iç"]', name);
    await click(`button[aria-label="Sembol: ${icon}"]`);
    await setTarget(target);
    await clickText(unit, '[role=dialog] .chips');
    if (days) {
      await clickText('Seçili Günler', '[role=dialog]');
      for (const d of days) await click(`[role=dialog] .day[aria-label="${d}"]`);
    }
    if (remind) await click('[role=dialog] button[aria-label="Hatırlatıcı"]');
  };
  const save = () => clickText('Kaydet', '[role=dialog]');
  const inc = async (i, n) => {
    for (let k = 0; k < n; k++) {
      await page.evaluate((idx) => document.querySelectorAll('.habit .add-btn')[idx]?.click(), i);
      await sleep(120);
    }
  };

  await shot('01-bos');
  await click('.empty .btn');
  await shot('02-editor-bos');
  await page.type('input[placeholder="Örn. Su iç"]', 'Su iç');
  await click('button[aria-label="Sembol: droplet"]');
  await setTarget(8);
  await clickText('bardak', '[role=dialog] .chips');
  await click('[role=dialog] button[aria-label="Hatırlatıcı"]');
  await shot('03-editor-dolu');
  await save();
  await sleep(300);

  await addHabit({ name: 'Diş fırçala', icon: 'sparkles', target: 2, unit: 'kez' });
  await save();
  await addHabit({ name: 'Kitap oku', icon: 'book', target: 20, unit: 'sayfa', days: ['Pzt', 'Çar', 'Cum'] });
  await shot('03b-editor-gunler');
  await save();
  await addHabit({ name: 'Yürüyüş', icon: 'walk', target: 1, unit: 'kez' });
  await save();
  await sleep(300);

  await inc(0, 3); // Su iç 3/8
  await inc(1, 1); // Diş 1/2
  await sleep(900);
  await shot('04-bugun-kismi');

  await page.evaluate(() => document.querySelectorAll('.habit-main')[0].click());
  await sleep(350);
  await shot('05-miktar');
  await clickText('Kapat', '[role=dialog]');
  await sleep(200);

  await inc(1, 1); // Diş 2/2 tamam
  await inc(3, 1); // Yürüyüş 1/1 tamam
  await sleep(1400);
  await shot('06-kismi-tamam');

  await page.evaluate(() => document.querySelectorAll('.habit-main')[0].click());
  await sleep(300);
  await clickText('Hedefe tamamla', '[role=dialog]');
  await clickText('Kapat', '[role=dialog]');
  await page.evaluate(() => document.querySelectorAll('.habit-main')[2].click());
  await sleep(300);
  await clickText('Hedefe tamamla', '[role=dialog]');
  await clickText('Kapat', '[role=dialog]');
  await sleep(1500);
  await shot('07-hepsi-tamam');

  await clickText('Odaklan', '.tabbar');
  await sleep(300);
  await shot('08-odak');
  await click('button[aria-label="Başlat"]');
  await sleep(2200);
  await clickText('Süre Ayarları', 'main');
  await sleep(300);
  await shot('09-odak-calisiyor');

  await clickText('Ayarlar', '.tabbar');
  await sleep(300);
  await shot('10-ayarlar');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(200);
  await shot('11-ayarlar-alt');
  await ctx.close();
}

await session('light');
await session('dark');
await browser.close();
console.log('bitti →', out);
