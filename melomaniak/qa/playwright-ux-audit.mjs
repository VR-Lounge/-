/**
 * Full UX / smoke audit for Melomaniak static shop.
 * Run: node qa/playwright-ux-audit.mjs
 */
import { chromium, devices } from "playwright";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.MELO_URL || "http://127.0.0.1:8080/";
await mkdir(__dirname, { recursive: true });

const results = {
  url: BASE,
  passed: [],
  failed: [],
  warnings: [],
  screenshots: [],
  consoleErrors: [],
  pageErrors: [],
};

const ok = (n, d = "") => {
  results.passed.push({ n, d });
  console.log("PASS", n, d);
};
const fail = (n, d = "") => {
  results.failed.push({ n, d });
  console.error("FAIL", n, d);
};
const warn = (n, d = "") => {
  results.warnings.push({ n, d });
  console.warn("WARN", n, d);
};

const shot = async (page, name) => {
  const file = path.join(__dirname, name);
  await page.screenshot({ path: file, fullPage: false });
  results.screenshots.push(name);
};

function attachConsole(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/favicon|Download the React|third-party/i.test(t)) return;
      results.consoleErrors.push(t.slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    results.pageErrors.push(String(err.message || err).slice(0, 300));
  });
}

async function checkOverflow(page, label) {
  const overflows = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const bad = [];
    if (doc.scrollWidth > doc.clientWidth + 2) {
      bad.push(`html scrollWidth=${doc.scrollWidth} client=${doc.clientWidth}`);
    }
    if (body.scrollWidth > body.clientWidth + 2) {
      bad.push(`body scrollWidth=${body.scrollWidth}`);
    }
    [...document.querySelectorAll("section, .wrap, .feature-row, .rail-item, .pdp-hero, header")].forEach(
      (el) => {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 4 || r.left < -4) {
          bad.push(`${el.className || el.tagName}: left=${r.left.toFixed(0)} right=${r.right.toFixed(0)}`);
        }
      }
    );
    return bad.slice(0, 12);
  });
  if (overflows.length) fail(`overflow-${label}`, overflows.join(" | "));
  else ok(`overflow-${label}`);
}

async function checkBrokenImages(page, label, selector, limit = 12) {
  const imgs = page.locator(selector);
  const n = Math.min(await imgs.count(), limit);
  let broken = 0;
  for (let i = 0; i < n; i++) {
    const el = imgs.nth(i);
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page
      .waitForFunction(
        ({ sel, idx }) => {
          const img = document.querySelectorAll(sel)[idx];
          return img && img.complete && img.naturalWidth > 20;
        },
        { sel: selector, idx: i },
        { timeout: 12000 }
      )
      .catch(() => null);
    const info = await el
      .evaluate((img) => ({
        w: img.naturalWidth,
        complete: img.complete,
        src: (img.currentSrc || img.getAttribute("src") || "").slice(-80),
      }))
      .catch(() => ({ w: 0, complete: false, src: "?" }));
    if (!info.complete || info.w < 20) {
      broken++;
      fail(`img-${label}-${i}`, JSON.stringify(info));
    }
  }
  if (!broken) ok(`imgs-${label}`, String(n));
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
attachConsole(desktop);

console.log("=== DESKTOP ===");
await desktop.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
(await desktop.title()).includes("MELOMANIAK") ? ok("title") : fail("title");
await shot(desktop, "ux-desktop-hero.png");

// Catalog load
await desktop.waitForFunction(
  () => document.querySelectorAll("#products .feature-row, #products .rail-item").length >= 8,
  null,
  { timeout: 45000 }
);
const cardCount = await desktop.locator("#products .feature-row, #products .rail-item").count();
cardCount >= 8 ? ok("catalog-cards", String(cardCount)) : fail("catalog-cards", String(cardCount));

const catCount = await desktop.evaluate(() => (window.MELO_CATALOG && window.MELO_CATALOG.count) || 0);
catCount >= 100 ? ok("catalog-count", String(catCount)) : fail("catalog-count", String(catCount));

await desktop.locator("#collection").scrollIntoViewIfNeeded();
await checkBrokenImages(desktop, "catalog", "#products .feature-media img, #products .rail-media img", 10);
await checkOverflow(desktop, "home");
await shot(desktop, "ux-desktop-catalog.png");

// Nav links
for (const hash of ["#services", "#oplata", "#dostavka", "#ustanovka", "#contacts"]) {
  await desktop.locator(`.navlinks a[href="${hash}"]`).click();
  await desktop.waitForTimeout(400);
  const visible = await desktop.evaluate((h) => {
    if (h === "#services" || h === "#contacts") {
      const el = document.querySelector(h);
      return el && !el.closest("[hidden]") && el.getBoundingClientRect().height > 20;
    }
    const j = document.getElementById("journey-" + h.slice(1));
    return j && !j.hidden && getComputedStyle(j).display !== "none";
  }, hash);
  visible ? ok(`nav-${hash}`) : fail(`nav-${hash}`);
}

// Back to catalog via brand / collection
await desktop.goto(BASE + "#collection", { waitUntil: "domcontentloaded" });
await desktop.waitForTimeout(500);

// Filters
const chips = desktop.locator("#filters .chip, .filters .chip, .chip");
const chipCount = await chips.count();
chipCount >= 2 ? ok("chips-present", String(chipCount)) : fail("chips-present", String(chipCount));
const acoustic = chips.filter({ hasText: /Акустик/i }).first();
if (await acoustic.count()) {
  await acoustic.click();
  await desktop.waitForTimeout(350);
  const n = await desktop.locator("#products .feature-row, #products .rail-item").count();
  n >= 1 ? ok("filter-acoustic", String(n)) : fail("filter-acoustic", String(n));
}
const allChip = chips.filter({ hasText: /^Все/ }).first();
if (await allChip.count()) await allChip.click();
await desktop.waitForTimeout(200);

// Sort
const sort = desktop.locator("#sort");
if (await sort.count()) {
  const options = await sort.locator("option").allTextContents();
  options.length >= 2 ? ok("sort-options", options.join("|")) : fail("sort-options");
  await sort.selectOption({ index: Math.min(1, options.length - 1) });
  await desktop.waitForTimeout(300);
  ok("sort-change");
}

// Favorites
const favBtn = desktop.locator("#products .fav").first();
if (await favBtn.count()) {
  await favBtn.click();
  await desktop.waitForTimeout(250);
  const toastVis = await desktop.locator("#toast").isVisible().catch(() => false);
  toastVis ? ok("fav-toast") : warn("fav-toast", "toast not visible");
  await desktop.locator('button.icon.favtool, button.icon[aria-label="Избранное"]').click();
  await desktop.waitForTimeout(500);
  // favorites may open search-like view or filter — check toast / products
  ok("fav-tool-click");
}

// Search
// Search must work even after избранное filter (regression)
await desktop.locator('button.icon[aria-label="Поиск"]').click();
await desktop.waitForSelector("#search[open]", { timeout: 5000 });
ok("search-open");
await desktop.fill("#query", "Advance");
await desktop.waitForTimeout(350);
const searchHits = await desktop.locator("#results button, #results .search-hit").count();
searchHits >= 1 ? ok("search-hits-after-fav", String(searchHits)) : fail("search-hits-after-fav", String(searchHits));

// Open PDP from search — first result should navigate to #product/
await desktop.locator("#results button, #results .search-hit").first().click();
await desktop.waitForTimeout(1000);
await desktop.waitForSelector("#pdpbody .pdp-title, #pdpbody h1, #detail[open]", { timeout: 20000 }).catch(() => null);
const hashAfterSearch = await desktop.evaluate(() => location.hash);
/product\//.test(hashAfterSearch) || (await desktop.locator("#detail[open]").count())
  ? ok("search-open-product", hashAfterSearch)
  : fail("search-open-product", hashAfterSearch);

// Close search if still open
await desktop.evaluate(() => {
  const s = document.getElementById("search");
  if (s && s.open) s.close();
  document.body.classList.remove("noscroll");
});

// Direct PDP deep link (known slug from demo banner)
await desktop.goto(BASE + "#product/advance-acoustic-x-a220-x-p700", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await desktop.waitForSelector("#pdpbody .pdp-title, #pdpbody h1", { timeout: 30000 });
ok("pdp-deep-link");
await desktop.waitForTimeout(600);
const homeHidden = await desktop.evaluate(() => {
  const hero = document.querySelector(".hero");
  return !!(hero && hero.hidden && getComputedStyle(hero).display === "none");
});
homeHidden ? ok("pdp-hides-home") : fail("pdp-hides-home", "hero still visible under PDP");
await shot(desktop, "ux-desktop-pdp.png");

const pdpTitle = await desktop.locator(".pdp-title, #pdpbody h1").first().innerText();
pdpTitle.length > 3 ? ok("pdp-title", pdpTitle.slice(0, 60)) : fail("pdp-title");

const about = await desktop.locator("#pdp-about, .pdp-prose").count();
about >= 1 ? ok("pdp-description") : warn("pdp-description", "no about block");

const specs = await desktop.locator("#pdp-specs, .pdp-specs").count();
specs >= 1 ? ok("pdp-specs") : warn("pdp-specs", "no specs (may be HITL empty)");

const galleryCells = await desktop.locator(".pdp-gcell, .pdp-thumbs button, .pdp-hero-btn").count();
galleryCells >= 1 ? ok("pdp-gallery-ui", String(galleryCells)) : fail("pdp-gallery-ui");

await checkBrokenImages(desktop, "pdp", "#pdpbody img", 8);
await checkOverflow(desktop, "pdp");

/* --- Regression: Cyrillic Woo slugs (encoded / decoded / id) --- */
{
  const cyrCases = [
    {
      n: "cyr-marantz-pm7000n",
      enc: "%d1%81%d1%82%d1%80%d0%b8%d0%bc%d0%b8%d0%bd%d0%b3%d0%be%d0%b2%d1%8b%d0%b9-%d0%b8%d0%bd%d1%82%d0%b5%d0%b3%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9-%d1%83%d1%81%d0%b8%d0%bb%d0%b8%d1%82%d0%b5%d0%bb%d1%8c",
      id: "262399",
      expect: /Marantz|PM7000/i,
    },
    {
      n: "cyr-audio-research-ds450",
      enc: "%d1%83%d1%81%d0%b8%d0%bb%d0%b8%d1%82%d0%b5%d0%bb%d1%8c-%d0%bc%d0%be%d1%89%d0%bd%d0%be%d1%81%d1%82%d0%b8-audio-research-ds450",
      id: "42427",
      expect: /Audio Research|DS450/i,
    },
  ];
  for (const c of cyrCases) {
    let decoded = c.enc;
    try {
      decoded = decodeURIComponent(c.enc);
    } catch (_) {}
    for (const [label, slug] of [
      ["enc", c.enc],
      ["dec", decoded],
      ["id", c.id],
    ]) {
      await desktop.goto(BASE + "#product/" + slug, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await desktop.waitForTimeout(1000);
      const info = await desktop.evaluate(() => {
        const body = document.getElementById("pdpbody")?.innerText || "";
        const title =
          document.querySelector(".pdp-title, #pdpbody h1")?.textContent || "";
        return {
          notFound: /Позиция не найдена/.test(body),
          title,
          hidden: !!document.getElementById("pdp")?.hidden,
        };
      });
      const pass =
        !info.notFound &&
        !info.hidden &&
        c.expect.test(info.title || "");
      pass
        ? ok(`pdp-cyrillic-${c.n}-${label}`, info.title.slice(0, 50))
        : fail(
            `pdp-cyrillic-${c.n}-${label}`,
            JSON.stringify({ slug: String(slug).slice(0, 60), ...info })
          );
    }
  }

  // Broader sample: 10 random percent-encoded catalog slugs via MELO_CATALOG
  const sample = await desktop.evaluate(() => {
    const products = (window.MELO_CATALOG && window.MELO_CATALOG.products) || [];
    const cyr = products.filter((p) => /%[0-9a-f]{2}/i.test(p.slug || ""));
    const out = [];
    const step = Math.max(1, Math.floor(cyr.length / 10));
    for (let i = 0; i < 10 && i * step < cyr.length; i++) {
      const p = cyr[i * step];
      out.push({ id: p.id, slug: p.slug, name: p.name });
    }
    return out;
  });
  let sampleOk = 0;
  for (const p of sample) {
    await desktop.goto(BASE + "#product/" + p.slug, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await desktop.waitForTimeout(700);
    const okOne = await desktop.evaluate((id) => {
      const body = document.getElementById("pdpbody")?.innerText || "";
      if (/Позиция не найдена/.test(body)) return false;
      if (document.getElementById("pdp")?.hidden) return false;
      const title =
        document.querySelector(".pdp-title, #pdpbody h1")?.textContent || "";
      return title.length > 2;
    }, p.id);
    if (okOne) sampleOk++;
    else fail("pdp-cyrillic-sample", `${p.id} ${String(p.slug).slice(0, 40)}`);
  }
  if (sample.length)
    sampleOk === sample.length
      ? ok("pdp-cyrillic-sample-10", `${sampleOk}/${sample.length}`)
      : fail("pdp-cyrillic-sample-10", `${sampleOk}/${sample.length}`);
}

/* --- Regression: Характеристики must stay on PDP (no hash hijack) --- */
{
  await desktop.goto(BASE + "#product/advance-acoustic-x-a220-x-p700", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await desktop.waitForSelector("#pdpbody .pdp-title", { timeout: 30000 });
  await desktop.waitForTimeout(600);
  const hasJump = await desktop.locator('a[data-pdp-anchor="pdp-specs"], a[href="#pdp-specs"]').count();
  if (hasJump) {
    const before = await desktop.evaluate(() => location.hash);
    await desktop.locator('a[data-pdp-anchor="pdp-specs"], a[href="#pdp-specs"]').first().click();
    await desktop.waitForTimeout(500);
    const after = await desktop.evaluate(() => {
      const specs = document.getElementById("pdp-specs");
      const r = specs && specs.getBoundingClientRect();
      return {
        hash: location.hash,
        pdpHidden: !!document.getElementById("pdp")?.hidden,
        heroHidden: !!document.querySelector(".hero")?.hidden,
        specsInView: !!(r && r.top < window.innerHeight && r.bottom > 0),
        stillProduct: /^#product\//.test(location.hash),
      };
    });
    after.stillProduct && !after.pdpHidden && after.heroHidden
      ? ok("pdp-specs-anchor-stays", `${before} → ${after.hash}; inView=${after.specsInView}`)
      : fail("pdp-specs-anchor-stays", JSON.stringify(after));
  } else {
    warn("pdp-specs-anchor-stays", "no specs jump link on this SKU");
  }
}

// PhotoSwipe open
await desktop.locator(".pdp-hero-btn").first().click();
await desktop.waitForSelector(".pswp--open", { timeout: 15000 }).catch(() => null);
const pswpOpen = await desktop.locator(".pswp--open").count();
if (pswpOpen) {
  ok("pswp-open");
  await desktop.waitForTimeout(500);
  await shot(desktop, "ux-desktop-pswp.png");

  // Controls presence
  const controls = await desktop.evaluate(() => {
    const root = document.querySelector(".pswp--open");
    if (!root) return null;
    return {
      close: !!root.querySelector(".pswp__button--close"),
      zoom: !!root.querySelector(".pswp__button--zoom"),
      prev: !!root.querySelector(".pswp__button--arrow--prev"),
      next: !!root.querySelector(".pswp__button--arrow--next"),
      counter: !!root.querySelector(".pswp__counter"),
      iconColor: getComputedStyle(root).getPropertyValue("--pswp-icon-color").trim(),
    };
  });
  controls?.close ? ok("pswp-close-btn") : fail("pswp-close-btn");
  controls?.zoom ? ok("pswp-zoom-btn") : warn("pswp-zoom-btn", "missing");
  controls?.counter ? ok("pswp-counter") : warn("pswp-counter");
  ok("pswp-vars", JSON.stringify(controls));

  // Next / prev if arrows exist
  if (controls?.next) {
    await desktop.locator(".pswp__button--arrow--next").click();
    await desktop.waitForTimeout(400);
    ok("pswp-next");
  }
  if (controls?.prev) {
    await desktop.locator(".pswp__button--arrow--prev").click();
    await desktop.waitForTimeout(300);
    ok("pswp-prev");
  }
  // Zoom toggle
  if (controls?.zoom) {
    await desktop.locator(".pswp__button--zoom").click();
    await desktop.waitForTimeout(400);
    ok("pswp-zoom-click");
  }
  // Close via button
  await desktop.locator(".pswp__button--close").click();
  await desktop.waitForTimeout(400);
  const closed = (await desktop.locator(".pswp--open").count()) === 0;
  closed ? ok("pswp-close") : fail("pswp-close");
} else {
  fail("pswp-open", "PhotoSwipe did not open from hero");
}

// Scroll lock / body class on modal
await desktop.locator('button.icon[aria-label="Поиск"]').click();
await desktop.waitForSelector("#search[open]");
const noscroll = await desktop.evaluate(() => document.body.classList.contains("noscroll"));
noscroll ? ok("modal-scroll-lock") : warn("modal-scroll-lock", "body.noscroll missing");
await desktop.keyboard.press("Escape");
await desktop.waitForTimeout(300);

// Brief / quiz
await desktop.evaluate(() => window.startQuiz && window.startQuiz());
await desktop.waitForSelector("#quiz[open]", { timeout: 8000 });
ok("quiz-open");
const quizChip = desktop.locator("#quiz .chip").first();
if (await quizChip.count()) {
  await quizChip.click();
  await desktop.waitForTimeout(200);
  const next = desktop.locator("#quizbody .btn").filter({ hasText: /Дальше|Собрать|Далее/i }).first();
  if (await next.count()) await next.click();
  ok("quiz-step");
}
await desktop.locator('#quiz .close').click().catch(() => {});
await desktop.keyboard.press("Escape");

// Services section cards + on-theme HT/projector images
await desktop.goto(BASE + "#services", { waitUntil: "domcontentloaded" });
await desktop.waitForTimeout(500);
const svc = await desktop.locator(".service-card, #services .story").count();
svc >= 1 ? ok("services-cards", String(svc)) : fail("services-cards", String(svc));
const svcImgs = await desktop.evaluate(async () => {
  const list = [...document.querySelectorAll(".service-card .svc-media img")];
  await Promise.all(
    list.map((img) =>
      img.complete && img.naturalWidth
        ? null
        : new Promise((r) => {
            img.onload = img.onerror = r;
          })
    )
  );
  return list.map((img) => ({
    src: img.getAttribute("src") || "",
    w: img.naturalWidth,
    h: img.naturalHeight,
  }));
});
const svcOk =
  svcImgs.length >= 3 &&
  svcImgs.every((i) => i.w > 100 && /assets\/services\//.test(i.src));
svcOk
  ? ok("services-ht-images", svcImgs.map((i) => i.src.split("/").pop()).join(","))
  : fail("services-ht-images", JSON.stringify(svcImgs));
await shot(desktop, "ux-desktop-services.png");

// Pagination — reset filters so full catalog can page
await desktop.goto(BASE + "#collection", { waitUntil: "domcontentloaded" });
await desktop.waitForTimeout(400);
await desktop.evaluate(() => {
  if (window.filterCategory) window.filterCategory("Все");
  if (window.onLiveQuery) window.onLiveQuery("");
  const live = document.getElementById("liveQuery");
  if (live) live.value = "";
});
await desktop.waitForTimeout(400);
await desktop.waitForSelector("#products .feature-row, #products .rail-item", { timeout: 20000 });
const loadMore = desktop.locator("#pager button");
if (await loadMore.count()) {
  ok("pagination-present", await loadMore.innerText());
  await loadMore.first().click();
  await desktop.waitForTimeout(500);
  const after = await desktop.locator("#products .feature-row, #products .rail-item").count();
  after > 24 ? ok("pagination-click", String(after)) : warn("pagination-click", String(after));
} else {
  warn("pagination", "no #pager button (end of slice or empty)");
}

await desktop.close();

// === TABLET ===
console.log("=== TABLET ===");
const tablet = await browser.newPage({ viewport: { width: 768, height: 1024 } });
attachConsole(tablet);
await tablet.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
await tablet.waitForFunction(
  () => document.querySelectorAll("#products .feature-row, #products .rail-item").length >= 4,
  null,
  { timeout: 45000 }
);
await checkOverflow(tablet, "tablet-home");
await shot(tablet, "ux-tablet-catalog.png");
await tablet.goto(BASE + "#product/advance-acoustic-x-a220-x-p700", { waitUntil: "domcontentloaded" });
await tablet.waitForSelector("#pdpbody .pdp-title, #pdpbody h1", { timeout: 30000 });
await checkOverflow(tablet, "tablet-pdp");
await shot(tablet, "ux-tablet-pdp.png");
await tablet.close();

// === MOBILE ===
console.log("=== MOBILE ===");
const mctx = await browser.newContext({ ...devices["iPhone 13"] });
const mobile = await mctx.newPage();
attachConsole(mobile);
await mobile.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
await shot(mobile, "ux-mobile-hero.png");
await mobile.locator('button.icon[aria-label="Открыть меню"]').click();
await mobile.waitForSelector("#menu[open]");
ok("mobile-menu");
const menuNoscroll = await mobile.evaluate(() => document.body.classList.contains("noscroll"));
menuNoscroll ? ok("mobile-menu-scroll-lock") : warn("mobile-menu-scroll-lock");
await mobile.locator('#menu a[href="#collection"]').click();
await mobile.waitForTimeout(600);
await checkOverflow(mobile, "mobile-catalog");
await shot(mobile, "ux-mobile-catalog.png");

await mobile.goto(BASE + "#product/advance-acoustic-x-a220-x-p700", { waitUntil: "domcontentloaded" });
await mobile.waitForSelector("#pdpbody .pdp-title, #pdpbody h1", { timeout: 30000 });
await checkOverflow(mobile, "mobile-pdp");
await shot(mobile, "ux-mobile-pdp.png");

// PhotoSwipe on mobile
await mobile.locator(".pdp-hero-btn").first().click();
await mobile.waitForSelector(".pswp--open", { timeout: 15000 }).catch(() => null);
if (await mobile.locator(".pswp--open").count()) {
  ok("mobile-pswp-open");
  await mobile.waitForTimeout(400);
  await shot(mobile, "ux-mobile-pswp.png");
  // swipe-ish: keyboard / close
  await mobile.locator(".pswp__button--close").click();
  await mobile.waitForTimeout(300);
  ok("mobile-pswp-close");
} else {
  fail("mobile-pswp-open");
}

await mctx.close();
await browser.close();

if (results.consoleErrors.length) {
  warn("console-errors", results.consoleErrors.slice(0, 8).join(" || "));
} else {
  ok("no-console-errors");
}
if (results.pageErrors.length) {
  fail("page-errors", results.pageErrors.join(" || "));
} else {
  ok("no-page-errors");
}

await writeFile(path.join(__dirname, "results-ux-audit.json"), JSON.stringify(results, null, 2));
console.log(
  "SUMMARY",
  JSON.stringify({
    passed: results.passed.length,
    failed: results.failed.length,
    warnings: results.warnings.length,
    consoleErrors: results.consoleErrors.length,
  })
);
if (results.failed.length) process.exit(1);
