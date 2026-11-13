import { chromium, devices } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.MELO_URL || 'http://127.0.0.1:8080/';
const out = path.join(__dirname);
await mkdir(out, { recursive: true });

const results = { url: BASE, passed: [], failed: [], screenshots: [] };

function ok(name, detail = '') {
  results.passed.push({ name, detail });
  console.log('PASS', name, detail);
}
function fail(name, detail = '') {
  results.failed.push({ name, detail });
  console.error('FAIL', name, detail);
}

async function shot(page, name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage: false });
  results.screenshots.push(name);
}

async function runDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const title = await page.title();
  if (title.includes('MELOMANIAK')) ok('title', title); else fail('title', title);

  const brand = await page.locator('.hero-brand').innerText();
  if (brand.includes('MELOMANIAK')) ok('hero-brand', brand.replace(/\s+/g, ' ').slice(0, 40)); else fail('hero-brand', brand);

  await shot(page, 'desktop-hero-void.png');

  const cards = await page.locator('#products .card').count();
  if (cards === 6) ok('catalog-6', String(cards)); else fail('catalog-6', String(cards));

  await page.locator('.chip', { hasText: 'Акустика' }).click();
  await page.waitForTimeout(200);
  const acoustic = await page.locator('#products .card').count();
  if (acoustic === 2) ok('filter-acoustic', String(acoustic)); else fail('filter-acoustic', String(acoustic));

  await page.locator('.chip', { hasText: 'Все' }).click();
  await page.locator('.fav').first().click();
  await page.waitForTimeout(200);
  const toast = await page.locator('#toast').isVisible();
  if (toast) ok('favorites-toast'); else fail('favorites-toast');

  await page.locator('button.icon[aria-label="Поиск"]').click();
  await page.waitForSelector('#search[open]');
  await page.fill('#query', 'McIntosh');
  await page.waitForTimeout(150);
  const searchHits = await page.locator('#results button').count();
  if (searchHits >= 1) ok('search-mcintosh', String(searchHits)); else fail('search-mcintosh', String(searchHits));
  await page.locator('#results button').first().click();
  await page.waitForSelector('#detail[open]');
  ok('detail-modal');
  await page.locator('#detail .close').click();

  await page.locator('.btn', { hasText: 'Найти свой звук' }).first().click();
  await page.waitForSelector('#quiz[open]');
  await page.locator('#quiz .chip', { hasText: 'Рок' }).click();
  await page.locator('#quiz .btn', { hasText: 'Дальше' }).click();
  await page.fill('#room', '24');
  await page.locator('#quiz .btn', { hasText: 'Собрать бриф' }).click();
  await page.waitForSelector('#comment');
  ok('brief-steps');
  await page.locator('#quiz .close').click();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'desktop-contact.png');
  await page.close();
}

async function runMobile(browser) {
  const iPhone = devices['iPhone 13'];
  const context = await browser.newContext({ ...iPhone });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, 'mobile-hero-void.png');

  await page.locator('button.icon[aria-label="Открыть меню"]').click();
  await page.waitForSelector('#menu[open]');
  ok('mobile-menu');
  await page.locator('#menu a[href="#collection"]').click();
  await page.waitForTimeout(400);
  await shot(page, 'mobile-catalog-void.png');

  const cards = await page.locator('#products .card').count();
  if (cards >= 2) ok('mobile-cards', String(cards)); else fail('mobile-cards', String(cards));

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runDesktop(browser);
  await runMobile(browser);
} finally {
  await browser.close();
}

const { writeFile } = await import('fs/promises');
await writeFile(path.join(out, 'results-void.json'), JSON.stringify(results, null, 2));
console.log('\nSUMMARY', { passed: results.passed.length, failed: results.failed.length });
if (results.failed.length) process.exit(1);
