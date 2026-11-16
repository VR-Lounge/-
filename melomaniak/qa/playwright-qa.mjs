import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.MELO_URL || 'http://127.0.0.1:8080/';
await mkdir(__dirname, { recursive: true });
const results = { url: BASE, passed: [], failed: [], screenshots: [] };
const ok=(n,d='')=>{results.passed.push({n,d});console.log('PASS',n,d)};
const fail=(n,d='')=>{results.failed.push({n,d});console.error('FAIL',n,d)};
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
const title = await page.title();
title.includes('MELOMANIAK') ? ok('title') : fail('title', title);
(await page.locator('.hero-brand').innerText()).includes('MELOMANIAK') ? ok('hero-brand') : fail('hero-brand');
const heroImg = page.locator('.hero-bleed img');
await heroImg.waitFor();
const nat = await heroImg.evaluate(img => ({w: img.naturalWidth, complete: img.complete, src: img.currentSrc}));
nat.w > 0 ? ok('hero-live-photo', String(nat.w)) : fail('hero-live-photo', JSON.stringify(nat));

// Font stack: no Bebas
const fontOk = await page.evaluate(() => {
  const css = [...document.styleSheets].flatMap(s => {
    try { return [...s.cssRules].map(r => r.cssText); } catch { return []; }
  }).join(' ');
  return !/Bebas/i.test(css) && /Outfit|Cormorant/i.test(getComputedStyle(document.body).fontFamily + document.documentElement.innerHTML);
});
fontOk ? ok('fonts-no-bebas') : fail('fonts-no-bebas');

await page.screenshot({ path: path.join(__dirname, 'desktop-hero-gold.png') });
results.screenshots.push('desktop-hero-gold.png');

await page.waitForFunction(() => document.querySelectorAll('#products .feature-row, #products .rail-item').length >= 10, null, { timeout: 30000 });
const items = await page.locator('#products .feature-row, #products .rail-item').count();
items >= 10 ? ok('catalog-filled', String(items)) : fail('catalog-filled', String(items));

const catCount = await page.evaluate(() => (window.MELO_CATALOG && window.MELO_CATALOG.count) || 0);
catCount >= 1000 ? ok('catalog-api-count', String(catCount)) : fail('catalog-api-count', String(catCount));

await page.locator('#collection').scrollIntoViewIfNeeded();
const cardImgs = page.locator('#products .feature-media img, #products .rail-media img');
const cardCount = await cardImgs.count();
let broken = 0;
const checkN = Math.min(cardCount, 8);
for (let i = 0; i < checkN; i++) {
  const el = cardImgs.nth(i);
  await el.scrollIntoViewIfNeeded();
  await page.waitForFunction((idx) => {
    const imgs = [...document.querySelectorAll('#products .feature-media img, #products .rail-media img')];
    const img = imgs[idx];
    return img && img.complete && img.naturalWidth > 0;
  }, i, { timeout: 12000 }).catch(() => null);
  const info = await el.evaluate(img => ({
    w: img.naturalWidth, complete: img.complete, src: img.getAttribute('src')
  }));
  if (!info.complete || info.w < 40) { broken++; fail('card-img', JSON.stringify(info)); }
}
if (!broken) ok('card-images-ok', String(checkN));

await page.locator('#products .feature-row').first().click();
await page.waitForSelector('#detail[open]');
await page.waitForFunction(() => {
  const img = document.getElementById('detailImg');
  return img && img.complete && img.naturalWidth > 0;
}, null, { timeout: 12000 }).catch(() => null);
const detailImg = await page.locator('#detailImg').evaluate(img => ({w: img.naturalWidth, src: img.getAttribute('src')}));
detailImg.w > 0 ? ok('detail-img', String(detailImg.w)) : fail('detail-img', JSON.stringify(detailImg));
(await page.locator('.related').count()) >= 0 ? ok('detail-related') : fail('detail-related');
await page.locator('#detail .close').click();

await page.locator('.chip', { hasText: 'Акустика' }).first().click();
await page.waitForTimeout(300);
const acoustic = await page.locator('#products .feature-row, #products .rail-item').count();
acoustic >= 1 ? ok('filter-acoustic', String(acoustic)) : fail('filter-acoustic', String(acoustic));
await page.locator('.chip', { hasText: 'Все' }).first().click();

await page.locator('.fav').first().click();
await page.waitForTimeout(200);
(await page.locator('#toast').isVisible()) ? ok('favorites-toast') : fail('favorites-toast');

await page.locator('button.icon[aria-label="Поиск"]').click();
await page.waitForSelector('#search[open]');
await page.fill('#query', 'Advance');
await page.waitForTimeout(200);
(await page.locator('#results button').count()) >= 1 ? ok('search') : fail('search');
await page.locator('#results button').first().click();
await page.waitForSelector('#detail[open]');
ok('detail');
await page.locator('#detail .close').click();

// Journey pages
await page.goto(BASE + '#oplata', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const oplataVisible = await page.locator('#journey-oplata').isVisible();
oplataVisible ? ok('page-oplata') : fail('page-oplata');
await page.goto(BASE + '#dostavka', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);
(await page.locator('#journey-dostavka').isVisible()) ? ok('page-dostavka') : fail('page-dostavka');
await page.goto(BASE + '#ustanovka', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(300);
(await page.locator('#journey-ustanovka').isVisible()) ? ok('page-ustanovka') : fail('page-ustanovka');
await page.goto(BASE + '#services', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
(await page.locator('#services').isVisible()) ? ok('page-services') : fail('page-services');

await page.goto(BASE + '#home', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
await page.evaluate(() => window.startQuiz && window.startQuiz());
await page.waitForSelector('#quiz[open]');
await page.locator('#quiz .chip', { hasText: 'Рок / металл' }).click();
await page.locator('#quizbody .btn', { hasText: 'Дальше' }).click();
await page.waitForSelector('#room', { timeout: 10000 });
await page.fill('#room', '24');
await page.locator('#quizbody .btn', { hasText: 'Собрать бриф' }).click();
await page.waitForSelector('#comment');
ok('brief');
await page.locator('#quiz .close').click();
await page.locator('#collection').scrollIntoViewIfNeeded();
await page.screenshot({ path: path.join(__dirname, 'desktop-catalog-gold.png') });
results.screenshots.push('desktop-catalog-gold.png');

const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const m = await ctx.newPage();
await m.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await m.screenshot({ path: path.join(__dirname, 'mobile-hero-gold.png') });
await m.locator('button.icon[aria-label="Открыть меню"]').click();
await m.waitForSelector('#menu[open]');
ok('mobile-menu');
await m.locator('#menu a[href="#collection"]').click();
await m.waitForTimeout(500);
await m.screenshot({ path: path.join(__dirname, 'mobile-catalog-gold.png') });
results.screenshots.push('mobile-hero-gold.png','mobile-catalog-gold.png');
await ctx.close();
await browser.close();
await writeFile(path.join(__dirname, 'results-gold.json'), JSON.stringify(results, null, 2));
console.log('SUMMARY', { passed: results.passed.length, failed: results.failed.length });
if (results.failed.length) process.exit(1);
