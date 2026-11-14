/* MELOMANIAK SIDE A — catalog + journey (demo: no payment, no lead spam) */
(function () {
  const catalog = window.MELO_CATALOG || { products: [], categories: {}, count: 0 };
  const products = catalog.products || [];
  const manifest = window.MELO_ASSETS || {};
  const PAGE_SIZE = 24;

  const CAT_ORDER = [
    "Все",
    "Акустика",
    "Усилители",
    "Источники",
    "ЦАПы",
    "Наушники",
    "Ресиверы",
    "Кабели",
    "Фильтры",
    "Видео",
    "Спецпредложения",
    "Другое",
    "Избранное",
  ];

  const stories = [
    {
      title: "Метаморфозы KEF LS50",
      label: "АКУСТИКА / АРХИВ",
      body: "На оригинальном сайте — материал «МЕТАМОРФОЗЫ KEF LS50». В концепте: журнальная подача с фото из каталога оригинала.",
    },
    {
      title: "ToneWinner AD-3pro+",
      label: "УСИЛЕНИЕ / АРХИВ",
      body: "ToneWinner AD-3pro+ — из ленты MELOMANIAK. Текст и фото с оригинала, не новый тест.",
    },
    {
      title: "Aurender N30SA",
      label: "ЦИФРОВОЙ ИСТОЧНИК / АРХИВ",
      body: "В оригинальной ленте: «Aurender N30SA — флагманский аудиоплеер». Фото с карточки оригинала.",
    },
  ];

  let current = "Все";
  let onlyFav = false;
  let sortMode = "featured";
  let page = 0;
  let query = "";
  let fav = [];
  try {
    fav = JSON.parse(localStorage.getItem("melo-favs-v2") || "[]");
  } catch (e) {}
  if (!Array.isArray(fav)) fav = [];

  const money = (n) =>
    n == null
      ? "Цена по запросу"
      : new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  function favKey(p) {
    return String(p.id || p.slug || p.name);
  }
  function isFav(p) {
    return fav.includes(favKey(p));
  }
  function illustration() {
    return `<svg viewBox="0 0 620 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Схематическая иллюстрация"><defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3a3420"/><stop offset=".5" stop-color="#151510"/><stop offset="1" stop-color="#0a0a08"/></linearGradient></defs><ellipse cx="310" cy="266" rx="240" ry="20" fill="#0004"/><rect x="55" y="125" width="513" height="125" rx="2" fill="url(#metal)" stroke="#d4af3744"/><circle cx="449" cy="187" r="28" fill="#2a2618" stroke="#d4af3766" stroke-width="2"/><text x="305" y="236" fill="#9a9286" text-anchor="middle" font-size="9" letter-spacing="4">M E L O M A N I A K</text></svg>`;
  }
  function thumbOf(p) {
    return p.thumb || (p.gallery && p.gallery[0]) || null;
  }
  function isRemoteUrl(u) {
    return /^https?:\/\//i.test(String(u || ""));
  }
  /** Prefer curated/local files for demo reliability; fall back to CDN then illustration. */
  function photo(p, eager) {
    const thumb = thumbOf(p);
    const local = p.thumbLocal || null;
    let primary = null;
    let fallback = "";
    if (thumb && !isRemoteUrl(thumb)) {
      primary = thumb;
      fallback = local && local !== thumb ? local : "";
    } else if (local) {
      primary = local;
      fallback = thumb && thumb !== local ? thumb : "";
    } else if (thumb) {
      primary = thumb;
    }
    if (!primary) return illustration();
    const loading = eager ? "eager" : "lazy";
    return `<img src="${esc(primary)}" alt="${esc(p.name)}" width="640" height="640" loading="${loading}" decoding="async"${
      fallback ? ` data-fallback="${esc(fallback)}"` : ""
    } onerror="if(this.dataset.fallback){const f=this.dataset.fallback;this.removeAttribute('data-fallback');this.src=f;}else{this.onerror=null;this.outerHTML=window.__meloIllu()}">`;
  }
  window.__meloIllu = illustration;

  function filtered() {
    const q = query.trim().toLowerCase();
    let list = products.filter((p) => {
      if (onlyFav && !isFav(p)) return false;
      if (!onlyFav && current !== "Все" && p.cat !== current) return false;
      if (!q) return true;
      const hay = (p.name + " " + p.cat + " " + (p.note || "") + " " + (p.cats || []).join(" ")).toLowerCase();
      return hay.includes(q);
    });
    if (sortMode === "price-asc")
      list = [...list].sort((a, b) => (a.price ?? 1e15) - (b.price ?? 1e15));
    else if (sortMode === "price-desc")
      list = [...list].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    else if (sortMode === "name")
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return list;
  }

  function setSort(v) {
    sortMode = v;
    page = 0;
    render();
  }
  window.setSort = setSort;

  function filterCategory(c, scroll) {
    onlyFav = c === "Избранное";
    current = onlyFav ? "Все" : c;
    page = 0;
    render();
    if (scroll) document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
  }
  window.filterCategory = filterCategory;
  window.showFavorites = () => {
    onlyFav = true;
    current = "Все";
    page = 0;
    render();
    const onDetached =
      location.hash.startsWith("#product/") ||
      location.hash === "#oplata" ||
      location.hash === "#dostavka" ||
      location.hash === "#ustanovka";
    if (onDetached) {
      location.hash = "#collection";
    } else {
      document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  function toggleFav(id) {
    const p = products.find((x) => favKey(x) === String(id) || String(x.id) === String(id));
    if (!p) return;
    const k = favKey(p);
    fav = isFav(p) ? fav.filter((x) => x !== k) : [...fav, k];
    try {
      localStorage.setItem("melo-favs-v2", JSON.stringify(fav));
    } catch (e) {}
    render();
    toast(isFav(p) ? "Сохранено в избранном" : "Убрано из избранного");
  }
  window.toggleFav = toggleFav;

  let toastTimer;
  function toast(s) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = s;
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.display = "none"), 3200);
  }

  function openDialog(id) {
    document.getElementById(id)?.showModal();
    document.body.classList.add("noscroll");
  }
  function closeDialog(id) {
    document.getElementById(id)?.close();
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("noscroll");
  }
  window.openDialog = openDialog;
  window.closeDialog = closeDialog;

  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          closeDialog(d.id);
      }
    });
    d.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) document.body.classList.remove("noscroll");
    });
  });

  function related(p, n = 4) {
    return products
      .filter((x) => x.id !== p.id && x.cat === p.cat && x.price)
      .slice(0, n);
  }

  const detailCache = new Map();
  let pdpGallery = [];
  let pdpActive = 0;
  let pdpListing = null;

  /**
   * Woo catalog stores many Cyrillic slugs already percent-encoded
   * (e.g. "%d1%81%d1%82%d1%80…"). Hash routing / browsers may hand us
   * encoded, decoded, or double-encoded forms. Normalize both sides.
   */
  function decodeSlug(value) {
    let cur = String(value || "");
    for (let i = 0; i < 5; i++) {
      try {
        const next = decodeURIComponent(cur);
        if (next === cur) break;
        cur = next;
      } catch (e) {
        break;
      }
    }
    return cur;
  }

  function encodeSlug(value) {
    const decoded = decodeSlug(value);
    try {
      return encodeURIComponent(decoded).replace(/%[0-9A-F]{2}/gi, (m) =>
        m.toLowerCase()
      );
    } catch (e) {
      return decoded;
    }
  }

  function slugMatches(stored, ref) {
    if (stored == null || ref == null) return false;
    const a = String(stored);
    const b = String(ref);
    if (a === b) return true;
    const da = decodeSlug(a);
    const db = decodeSlug(b);
    if (da === db) return true;
    if (a === encodeSlug(b) || encodeSlug(a) === b || encodeSlug(a) === encodeSlug(b))
      return true;
    return false;
  }

  function productHash(p) {
    if (!p) return "#collection";
    const raw = p.slug != null && String(p.slug) !== "" ? String(p.slug) : String(p.id);
    // Prefer decoded Cyrillic in the hash; the browser encodes once.
    // If catalog already has %xx, decode first so we never double-encode.
    const path = decodeSlug(raw);
    return "#product/" + path;
  }

  function findProduct(ref) {
    const key = String(ref || "");
    if (!key) return null;
    const decoded = decodeSlug(key);
    return (
      products.find(
        (x) =>
          String(x.id) === key ||
          String(x.id) === decoded ||
          slugMatches(x.slug, key) ||
          slugMatches(x.slug, decoded)
      ) || null
    );
  }

  function galleryItems(listing, detail) {
    const fromDetail = (detail && detail.gallery) || [];
    if (fromDetail.length) {
      return fromDetail.map((g) => {
        const local = g.local || null;
        const cdn = g.src || null;
        const src = local || cdn;
        return {
          src,
          thumb: g.thumb || local || cdn,
          alt: g.alt || (listing && listing.name) || "",
          cdn,
        };
      });
    }
    const g = (listing && listing.gallery) || [];
    if (g.length) {
      // Prefer listing thumbLocal as first frame when gallery is CDN-only
      const frames = g.map((u) => ({ src: u, thumb: u, alt: (listing && listing.name) || "" }));
      if (listing.thumbLocal && isRemoteUrl(frames[0].src)) {
        frames[0] = {
          src: listing.thumbLocal,
          thumb: listing.thumbLocal,
          alt: listing.name || "",
          cdn: frames[0].src,
        };
      } else if (listing.thumb && !isRemoteUrl(listing.thumb)) {
        frames[0] = {
          src: listing.thumb,
          thumb: listing.thumb,
          alt: listing.name || "",
          cdn: isRemoteUrl(g[0]) ? g[0] : undefined,
        };
      }
      return frames;
    }
    const local = listing && listing.thumbLocal;
    const t = listing && thumbOf(listing);
    const src = (t && !isRemoteUrl(t) ? t : null) || local || t;
    return src ? [{ src, thumb: src, alt: listing.name || "" }] : [];
  }

  function measureImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          src,
          width: img.naturalWidth || 1600,
          height: img.naturalHeight || 1600,
        });
      img.onerror = () => resolve({ src, width: 1600, height: 1600 });
      img.src = src;
    });
  }

  function openPhotoSwipe(items, index) {
    if (!items || !items.length) return;
    if (typeof PhotoSwipe === "undefined") {
      toast("Галерея ещё загружается…");
      return;
    }
    const start = Math.max(0, Math.min(index || 0, items.length - 1));
    Promise.all(
      items.map(async (it) => {
        const measured = await measureImage(it.src);
        return {
          src: measured.src,
          width: measured.width,
          height: measured.height,
          alt: it.alt || "",
        };
      })
    ).then((dataSource) => {
      const pswp = new PhotoSwipe({
        dataSource,
        index: start,
        bgOpacity: 1,
        wheelToZoom: true,
        paddingFn: (viewportSize) => {
          const narrow = viewportSize.x < 720;
          return {
            top: narrow ? 56 : 48,
            bottom: narrow ? 48 : 40,
            left: narrow ? 12 : 56,
            right: narrow ? 12 : 56,
          };
        },
      });
      pswp.init();
    });
  }
  window.openPhotoSwipe = openPhotoSwipe;

  function setPdpSlide(idx) {
    if (!pdpGallery.length) return;
    pdpActive = ((idx % pdpGallery.length) + pdpGallery.length) % pdpGallery.length;
    const item = pdpGallery[pdpActive];
    const img = document.getElementById("pdpHeroImg");
    if (img) {
      img.src = item.thumb || item.src;
      img.alt = item.alt || (pdpListing && pdpListing.name) || "";
      img.dataset.full = item.src;
    }
    document.querySelectorAll(".pdp-thumbs button").forEach((btn, i) => {
      const on = i === pdpActive;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  window.setPdpSlide = setPdpSlide;
  window.pdpPrev = () => setPdpSlide(pdpActive - 1);
  window.pdpNext = () => setPdpSlide(pdpActive + 1);
  window.openPdpGallery = (idx) => openPhotoSwipe(pdpGallery, idx == null ? pdpActive : idx);

  async function loadDetailPayload(p) {
    if (detailCache.has(p.id)) return detailCache.get(p.id);
    try {
      const res = await fetch("data/pdp/" + p.id + ".json", { credentials: "same-origin" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      detailCache.set(p.id, data);
      return data;
    } catch (e) {
      const fallback = {
        id: p.id,
        slug: p.slug,
        name: p.name,
        descriptionHtml: "",
        descriptionText: p.facts || "",
        specs: [],
        gallery: (p.gallery || []).map((u) => ({ src: u, thumb: u, alt: p.name })),
        source: p.source,
        missing: true,
      };
      detailCache.set(p.id, fallback);
      return fallback;
    }
  }

  function renderSpecs(specs) {
    if (!specs || !specs.length) return "";
    return `<section class="pdp-section" id="pdp-specs">
      <div class="eyebrow">ХАРАКТЕРИСТИКИ</div>
      <h3 class="pdp-h">Как записано у источника</h3>
      <p class="pdp-lead">Только атрибуты и таблицы с карточки melomaniak.рф — без домыслов о мощности или наличии.</p>
      <div class="pdp-specs-wrap"><table class="pdp-specs"><tbody>${specs
        .map(
          (s) =>
            `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`
        )
        .join("")}</tbody></table></div>
    </section>`;
  }

  /** Clean Woo HTML artifacts (@@@…@@@) left by imperfect exports. */
  function scrubWooArtifacts(s) {
    return String(s || "")
      .replace(/@@@[^@]*@@@/g, "")
      .replace(/@@@/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function plainTextOf(el) {
    return scrubWooArtifacts((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function significantKids(p) {
    return Array.from((p && p.childNodes) || []).filter((n) => {
      if (n.nodeType === 3) return String(n.textContent || "").trim().length > 0;
      return n.nodeType === 1;
    });
  }

  function isLoneStrongParagraph(p) {
    if (!p || p.tagName !== "P") return false;
    const kids = significantKids(p);
    if (kids.length !== 1 || kids[0].nodeType !== 1) return false;
    const only = kids[0];
    if (!/^(STRONG|B)$/i.test(only.tagName)) return false;
    const t = plainTextOf(only);
    return t.length >= 8 && t.length <= 160;
  }

  /** Lone <em>/<i> title lines from Woo (e.g. ТЕХНИЧЕСКИЕ ХАРАКТЕРИСТИКИ). */
  function isLoneEmParagraph(p) {
    if (!p || p.tagName !== "P") return false;
    const kids = significantKids(p);
    if (kids.length !== 1 || kids[0].nodeType !== 1) return false;
    const only = kids[0];
    if (!/^(EM|I)$/i.test(only.tagName)) return false;
    const t = plainTextOf(only);
    return t.length >= 8 && t.length <= 120;
  }

  function makeSubhead(text) {
    const sub = document.createElement("p");
    sub.className = "pdp-prose-sub";
    sub.textContent = text;
    return sub;
  }

  function makeProseP(nodes) {
    const body = document.createElement("p");
    body.className = "pdp-prose-p";
    (nodes || []).forEach((n) => body.appendChild(n.cloneNode(true)));
    return body;
  }

  /** Woo often uses <p><strong>Title</strong><br>body…</p> — split without inventing copy. */
  function splitStrongLeadParagraph(p) {
    if (!p || p.tagName !== "P") return false;
    const kids = Array.from(p.childNodes);
    let lead = null;
    let leadIdx = -1;
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (n.nodeType === 3 && !String(n.textContent || "").trim()) continue;
      if (n.nodeType === 1 && /^(STRONG|B)$/i.test(n.tagName)) {
        lead = n;
        leadIdx = i;
        break;
      }
      return false;
    }
    if (!lead) return false;
    const title = plainTextOf(lead);
    if (title.length < 8 || title.length > 160) return false;
    let sawBr = false;
    let hasBody = false;
    for (let i = leadIdx + 1; i < kids.length; i++) {
      const n = kids[i];
      if (n.nodeType === 1 && /^BR$/i.test(n.tagName)) {
        sawBr = true;
        continue;
      }
      if (n.nodeType === 3 && !String(n.textContent || "").trim()) continue;
      hasBody = true;
      break;
    }
    if (!sawBr || !hasBody) return false;
    const bodyNodes = [];
    let pastBr = false;
    for (let i = leadIdx + 1; i < kids.length; i++) {
      const n = kids[i];
      if (!pastBr) {
        if (n.nodeType === 1 && /^BR$/i.test(n.tagName)) pastBr = true;
        continue;
      }
      bodyNodes.push(n);
    }
    const body = makeProseP(bodyNodes);
    if (!plainTextOf(body)) return false;
    p.replaceWith(makeSubhead(title), body);
    return true;
  }

  /**
   * Mid-paragraph sourced breaks: …text<br><strong>Title</strong> rest…
   * Splits into body + gold subhead + rest — titles only from source strong.
   */
  function splitMidBrStrongParagraph(p) {
    if (!p || p.tagName !== "P") return false;
    const kids = Array.from(p.childNodes);
    let brIdx = -1;
    let strongIdx = -1;
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (n.nodeType === 1 && /^BR$/i.test(n.tagName)) {
        let j = i + 1;
        while (j < kids.length && kids[j].nodeType === 3 && !String(kids[j].textContent || "").trim()) j++;
        if (j < kids.length && kids[j].nodeType === 1 && /^(STRONG|B)$/i.test(kids[j].tagName)) {
          const title = plainTextOf(kids[j]);
          // Model codes like «X-i1100» are short; still sourced titles.
          if (title.length >= 4 && title.length <= 120) {
            brIdx = i;
            strongIdx = j;
            break;
          }
        }
      }
    }
    if (brIdx < 0 || strongIdx < 0) return false;
    const before = kids.slice(0, brIdx);
    const title = plainTextOf(kids[strongIdx]);
    const after = kids.slice(strongIdx + 1);
    const parts = [];
    const beforeP = makeProseP(before);
    if (plainTextOf(beforeP)) parts.push(beforeP);
    parts.push(makeSubhead(title));
    const afterP = makeProseP(after);
    if (plainTextOf(afterP)) parts.push(afterP);
    if (parts.length < 2) return false;
    p.replaceWith(...parts);
    return true;
  }

  /** Split only on sourced <br><br> (or BR + whitespace + BR) — never invent breaks. */
  function splitParagraphOnDoubleBreaks(p) {
    if (!p || p.tagName !== "P") return false;
    const kids = Array.from(p.childNodes);
    const chunks = [];
    let cur = [];
    let i = 0;
    let splitOnce = false;
    while (i < kids.length) {
      const n = kids[i];
      if (n.nodeType === 1 && /^BR$/i.test(n.tagName)) {
        let j = i + 1;
        while (j < kids.length && kids[j].nodeType === 3 && !String(kids[j].textContent || "").trim()) j++;
        if (j < kids.length && kids[j].nodeType === 1 && /^BR$/i.test(kids[j].tagName)) {
          if (cur.length) chunks.push(cur);
          cur = [];
          splitOnce = true;
          i = j + 1;
          continue;
        }
      }
      cur.push(n);
      i++;
    }
    if (!splitOnce) return false;
    if (cur.length) chunks.push(cur);
    const parts = chunks
      .map((nodes) => makeProseP(nodes))
      .filter((el) => plainTextOf(el));
    if (parts.length < 2) return false;
    p.replaceWith(...parts);
    return true;
  }

  /** Group consecutive plain paragraphs into a full-width 2-col editorial flow. */
  function wrapPlainProseFlows(root) {
    const kids = Array.from(root.children);
    let run = [];
    function flush() {
      if (!run.length) return;
      const chars = run.reduce((n, el) => n + plainTextOf(el).length, 0);
      const longEnough = chars >= 420 || run.some((el) => plainTextOf(el).length >= 360);
      if (longEnough && run.length >= 1) {
        const flow = document.createElement("div");
        flow.className = "pdp-prose-flow";
        run[0].parentNode.insertBefore(flow, run[0]);
        run.forEach((el) => flow.appendChild(el));
      }
      run = [];
    }
    kids.forEach((el) => {
      const isPlain =
        el.tagName === "P" &&
        el.classList.contains("pdp-prose-p") &&
        !el.classList.contains("pdp-prose-sub");
      if (isPlain) run.push(el);
      else flush();
    });
    flush();
  }

  function chipLabelFromLi(li) {
    const full = plainTextOf(li);
    if (!full) return "";
    if (full.length <= 72) return full;
    const split = full.split(/\s*[:–—−]\s+/);
    if (split.length >= 2) {
      const lead = scrubWooArtifacts(split[0]);
      if (lead.length >= 8 && lead.length <= 72) return lead;
    }
    return "";
  }

  /**
   * Editorial salon transform: sanitize allowlist, promote strong-only
   * subheads, optional pull-quote + feature chips — never invent copy.
   */
  function formatPdpProse(rawHtml) {
    const ALLOWED = new Set([
      "P",
      "H1",
      "H2",
      "H3",
      "H4",
      "UL",
      "OL",
      "LI",
      "STRONG",
      "B",
      "EM",
      "I",
      "A",
      "BR",
      "HR",
      "TABLE",
      "THEAD",
      "TBODY",
      "TR",
      "TH",
      "TD",
      "IMG",
      "BLOCKQUOTE",
      "SUP",
      "SUB",
    ]);
    /* DIV/SPAN intentionally unwrapped — Woo export chrome, not salon semantics */
    const wrap = document.createElement("div");
    try {
      const doc = new DOMParser().parseFromString(
        "<div id='melo-prose-root'>" + rawHtml + "</div>",
        "text/html"
      );
      const src = doc.getElementById("melo-prose-root");
      if (src) wrap.appendChild(document.importNode(src, true));
      else wrap.innerHTML = rawHtml;
    } catch (e) {
      wrap.textContent = scrubWooArtifacts(rawHtml.replace(/<[^>]+>/g, " "));
      return { chipsHtml: "", bodyHtml: wrap.innerHTML };
    }

    // Drop broken manual/PDF shells and interactive junk.
    wrap
      .querySelectorAll("script,style,form,button,input,textarea,select,iframe,object,embed")
      .forEach((n) => n.remove());
    wrap.querySelectorAll("[class*='manual'], a[href*='@@@'], img[src*='@@@']").forEach((n) => {
      const block = n.closest("div,p") || n;
      block.remove();
    });
    // @@@ store shells: remove chrome tags; unwrap DIV/SPAN so product copy survives.
    wrap.querySelectorAll("[class*='@@@'], [id*='@@@']").forEach((n) => {
      if (/^(H1|H2|H3|H4|P|UL|OL|LI|TABLE|THEAD|TBODY|TR|TH|TD)$/.test(n.tagName)) return;
      if (/^(A|IMG|BUTTON|NAV|ASIDE|HEADER|FOOTER|FORM)$/.test(n.tagName)) {
        n.remove();
        return;
      }
      const parent = n.parentNode;
      if (!parent) return;
      while (n.firstChild) parent.insertBefore(n.firstChild, n);
      parent.removeChild(n);
    });

    function sanitizeNode(node) {
      if (node.nodeType === 3) {
        node.textContent = String(node.textContent || "").replace(/@@@[^@]*@@@/g, "");
        return;
      }
      if (node.nodeType !== 1) {
        node.remove();
        return;
      }
      const tag = node.tagName;
      Array.from(node.attributes || []).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const val = attr.value || "";
        if (name.startsWith("on") || name === "style" || name === "srcset") {
          node.removeAttribute(attr.name);
          return;
        }
        if (val.includes("@@@")) {
          const cleaned = scrubWooArtifacts(val);
          if (!cleaned && (name === "class" || name === "id" || name === "align")) {
            node.removeAttribute(attr.name);
          } else if (name === "href" || name === "src") {
            if (!cleaned || cleaned.startsWith("javascript:")) node.removeAttribute(attr.name);
            else node.setAttribute(attr.name, cleaned);
          } else {
            node.setAttribute(attr.name, cleaned);
          }
        }
      });
      if (tag === "A") {
        const href = node.getAttribute("href") || "";
        if (!href || href.startsWith("javascript:")) node.removeAttribute("href");
        else {
          node.setAttribute("rel", "noopener noreferrer");
          if (/^https?:/i.test(href)) node.setAttribute("target", "_blank");
        }
      }
      if (tag === "IMG") {
        const src = node.getAttribute("src") || "";
        if (!src || src.includes("@@@") || src.startsWith("javascript:")) {
          node.remove();
          return;
        }
        node.setAttribute("loading", "lazy");
        node.setAttribute("decoding", "async");
      }
      Array.from(node.childNodes).forEach(sanitizeNode);
      if (!ALLOWED.has(tag)) {
        const parent = node.parentNode;
        if (!parent) return;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
      }
    }
    Array.from(wrap.childNodes).forEach(sanitizeNode);

    // Drop leaked tracking / marketplace chrome (not product copy).
    (function stripTrackingChrome() {
      const junkRe =
        /\b(yaCounter|yaParams|ym\s*\(|gtag\s*\(|GTM-|googletagmanager|mc\.yandex\.ru|dataLayer|_am_region_set|document\.scripts)\b/i;
      const chromeExact =
        /^(войти|москва|купить|теги|рекомендуем|бесплатная доставка|доставим послезавтра|услуга срочной доставки|записаться на прослушивание|в магазине на электрозаводской|отлично)$/i;
      const chromeSoft =
        /(?:\|\s*)?купить\s+в\s+магазине|аудиомания|в\s+наличии\s*\d|отзыв\w*\s*\d+\s*\/\s*5/i;
      Array.from(wrap.querySelectorAll("p,title,h1,h2,h3,h4,a,strong")).forEach((el) => {
        const t = plainTextOf(el);
        if (!t) {
          el.remove();
          return;
        }
        if (
          el.tagName === "TITLE" ||
          junkRe.test(t) ||
          /^var\s+\w+\s*=/.test(t) ||
          chromeExact.test(t) ||
          chromeSoft.test(t)
        ) {
          el.remove();
        }
      });
      Array.from(wrap.querySelectorAll("p")).forEach((p) => {
        if (!plainTextOf(p)) p.remove();
      });
      // Lone BRs left as top-level chrome
      Array.from(wrap.childNodes).forEach((n) => {
        if (n.nodeType === 1 && n.tagName === "BR") n.remove();
      });
    })();

    // Source-only splits: double <br>, then mid <br><strong>, then lead <strong><br>.
    (function applySourceBreaks() {
      let guard = 0;
      while (guard++ < 40) {
        const p = Array.from(wrap.querySelectorAll("p")).find(splitParagraphOnDoubleBreaks);
        if (!p) break;
      }
      guard = 0;
      while (guard++ < 40) {
        const hit = Array.from(wrap.querySelectorAll("p")).some(splitMidBrStrongParagraph);
        if (!hit) break;
      }
      Array.from(wrap.querySelectorAll("p")).forEach((p) => {
        if (splitStrongLeadParagraph(p)) return;
        if (isLoneStrongParagraph(p) || isLoneEmParagraph(p)) {
          p.replaceWith(makeSubhead(plainTextOf(p)));
        }
      });
    })();

    // Pull-quote: only an opening short paragraph (sourced), never mid-article.
    (function promoteOpeningPullquote() {
      const blocks = Array.from(wrap.children);
      let seenBody = 0;
      for (let i = 0; i < blocks.length && seenBody < 2; i++) {
        const el = blocks[i];
        if (el.classList && el.classList.contains("pdp-prose-sub")) continue;
        if (/^H[1-4]$/.test(el.tagName)) continue;
        if (el.tagName !== "P") {
          if (/^(UL|OL|TABLE|BLOCKQUOTE|HR)$/.test(el.tagName)) break;
          continue;
        }
        seenBody++;
        const t = plainTextOf(el);
        if (t.length < 24 || t.length > 180) return;
        if (/\|\s*купить\b/i.test(t) || /аудиомания/i.test(t)) return;
        const q = document.createElement("blockquote");
        q.className = "pdp-pullquote";
        q.textContent = t;
        el.replaceWith(q);
        return;
      }
    })();

    // Drop empty lists left after chrome unwraps.
    Array.from(wrap.querySelectorAll("ul,ol")).forEach((list) => {
      const items = Array.from(list.children).filter((c) => c.tagName === "LI" && plainTextOf(c));
      if (!items.length) list.remove();
    });

    // Feature chips from first feature <ul> — labels only from sourced li leads.
    let chipsHtml = "";
    const firstUl = wrap.querySelector("ul");
    if (firstUl) {
      const items = Array.from(firstUl.children).filter((c) => c.tagName === "LI" && plainTextOf(c));
      firstUl.classList.add("pdp-feature-list");
      const labels = items.map(chipLabelFromLi).filter(Boolean).slice(0, 8);
      if (labels.length >= 3) {
        chipsHtml = `<div class="pdp-feature-chips" role="list">${labels
          .map((l) => `<span class="pdp-chip" role="listitem">${esc(l)}</span>`)
          .join("")}</div>`;
      }
    }

    wrap.querySelectorAll("p:not(.pdp-prose-sub)").forEach((p) => {
      p.classList.add("pdp-prose-p");
      if (plainTextOf(p).length >= 360) p.classList.add("pdp-prose-p--long");
    });

    wrapPlainProseFlows(wrap);

    // Drop-cap on first plain paragraph in the editorial body (sourced letter only).
    const firstPlain =
      wrap.querySelector(".pdp-prose-flow > .pdp-prose-p") ||
      wrap.querySelector(".pdp-prose-p");
    if (firstPlain && plainTextOf(firstPlain).length >= 80) {
      firstPlain.classList.add("pdp-prose-p--drop");
    }

    return { chipsHtml, bodyHtml: wrap.innerHTML };
  }

  function renderDescription(detail, listing) {
    const html = (detail.descriptionHtml || "").trim();
    if (html) {
      const { chipsHtml, bodyHtml } = formatPdpProse(html);
      const enriched = !!detail.enriched;
      const title = enriched ? "Карточка салона" : "Слова с живой карточки";
      const lead = enriched
        ? "Редакционное описание по материалам производителя — только подтверждённые факты, без выдуманных ватт и импеданса."
        : "Оригинальное описание WooCommerce в editorial-вёрстке салона — без домыслов и новых характеристик.";
      const hitlEnriched = enriched
        ? `<p class="hitl-flag">HITL: enriched=true · источники в карточке (${(detail.sources || []).length} URL) — сверить тон и комплектность перед публикацией.</p>`
        : "";
      return `<section class="pdp-section pdp-section--about" id="pdp-about">
        <div class="eyebrow">О ПРОДУКТЕ</div>
        <h3 class="pdp-h">${title}</h3>
        <p class="pdp-lead">${lead}</p>
        ${chipsHtml}
        <div class="pdp-prose">${bodyHtml}</div>
        ${hitlEnriched}
      </section>`;
    }
    const text = (detail.descriptionText || listing.facts || "").trim();
    if (text) {
      return `<section class="pdp-section pdp-section--about" id="pdp-about">
        <div class="eyebrow">О ПРОДУКТЕ</div>
        <h3 class="pdp-h">Кратко из источника</h3>
        <div class="pdp-prose"><p class="pdp-prose-p">${esc(text)}</p></div>
        <p class="hitl-flag">HITL: полного HTML-описания в выгрузке нет — показан доступный текст.</p>
      </section>`;
    }
    return `<section class="pdp-section pdp-section--about" id="pdp-about">
      <div class="eyebrow">О ПРОДУКТЕ</div>
      <h3 class="pdp-h">Описание у источника пустое</h3>
      <p class="pdp-lead">${esc(listing.note || "")}</p>
      <p class="hitl-flag">HITL: на живой карточке нет текста описания. Не выдумываем характеристики.</p>
    </section>`;
  }

  function renderPdp(listing, detail) {
    pdpListing = listing;
    pdpGallery = galleryItems(listing, detail);
    pdpActive = 0;
    const hero = pdpGallery[0];
    const heroSrc = hero ? hero.thumb || hero.src : null;
    const media = heroSrc
      ? `<button type="button" class="pdp-hero-btn" onclick="openPdpGallery()" aria-label="Открыть галерею, увеличить">
          <img id="pdpHeroImg" src="${esc(heroSrc)}" data-full="${esc(hero.src)}" alt="${esc(listing.name)}" width="1000" height="1000" decoding="async">
          <span class="pdp-zoom-hint">Увеличить · pinch / drag</span>
        </button>`
      : `<div class="pdp-hero-btn">${illustration()}</div>`;
    const thumbs =
      pdpGallery.length > 1
        ? `<div class="pdp-thumbs" role="list">${pdpGallery
            .map(
              (g, i) =>
                `<button type="button" role="listitem" class="${i === 0 ? "active" : ""}" aria-label="Кадр ${i + 1}" aria-pressed="${i === 0}" onclick="setPdpSlide(${i});">
                  <img src="${esc(g.thumb || g.src)}" alt="" width="120" height="120" loading="lazy" decoding="async">
                </button>`
            )
            .join("")}</div>
          <div class="pdp-gallery-nav">
            <button type="button" class="btn ghost" onclick="pdpPrev()" aria-label="Предыдущий кадр">←</button>
            <button type="button" class="btn ghost" onclick="openPdpGallery()">Галерея · ${pdpGallery.length}</button>
            <button type="button" class="btn ghost" onclick="pdpNext()" aria-label="Следующий кадр">→</button>
          </div>`
        : pdpGallery.length === 1
          ? `<div class="pdp-gallery-nav"><button type="button" class="btn ghost" onclick="openPdpGallery(0)">Открыть в полном размере</button></div>`
          : "";

    const priceBlock =
      listing.price != null
        ? `<p class="pdp-price">${money(listing.price)}${
            listing.old ? '<del>' + money(listing.old) + "</del>" : ""
          }</p>`
        : `<p class="pdp-price">Цена по запросу</p>`;

    const hitlPhoto = listing.hitl
      ? '<p class="hitl-flag">HITL: на исходном фото карточки читаются Smart DX1 и Smart BX1 при листинге «DX1 + PX1».</p>'
      : "";
    const hitlSpecs =
      !detail.specs || !detail.specs.length
        ? '<p class="hitl-flag">HITL: структурированных характеристик (атрибуты Woo / таблицы) у источника нет — блок спецификаций скрыт, без выдуманных ваттов и импеданса.</p>'
        : "";

    const rel = related(listing);
    const relHtml = rel.length
      ? `<section class="pdp-section"><div class="eyebrow">РЯДОМ В КАТАЛОГЕ</div><div class="related-rail">${rel
          .map(
            (r) =>
              `<a class="related-card" href="${esc(productHash(r))}"><span class="related-thumb">${photo(r)}</span><span>${esc(r.name)}</span><strong>${money(r.price)}</strong></a>`
          )
          .join("")}</div></section>`
      : "";

    const gallerySection =
      pdpGallery.length > 1
        ? `<section class="pdp-section" id="pdp-gallery">
            <div class="eyebrow">ГАЛЕРЕЯ</div>
            <h3 class="pdp-h">Кадры с карточки</h3>
            <p class="pdp-lead">Листинг остаётся лёгким; полный размер — в PhotoSwipe: зум, pan, клавиатура, свайп.</p>
            <div class="pdp-gallery-grid">${pdpGallery
              .map(
                (g, i) =>
                  `<button type="button" class="pdp-gcell" onclick="openPdpGallery(${i})" aria-label="Открыть кадр ${i + 1}">
                    <img src="${esc(g.thumb || g.src)}" alt="${esc(g.alt || listing.name)}" loading="lazy" decoding="async" width="400" height="400">
                  </button>`
              )
              .join("")}</div>
          </section>`
        : "";

    const root = document.getElementById("pdpbody");
    if (!root) return;
    root.innerHTML = `
      <nav class="pdp-crumb" aria-label="Навигация">
        <a href="#collection">Каталог</a>
        <span aria-hidden="true">/</span>
        <span>${esc(listing.cat || "Компонент")}</span>
      </nav>
      <div class="pdp-hero">
        <div class="pdp-stage">
          ${media}
          ${thumbs}
        </div>
        <div class="pdp-buy">
          <div class="eyebrow">${esc((listing.cat || "").toUpperCase())} · ЖИВОЙ КАТАЛОГ</div>
          <h1 class="pdp-title">${esc(listing.name)}</h1>
          <p class="pdp-kicker">${esc(listing.note || "")}</p>
          ${hitlPhoto}
          ${priceBlock}
          <div class="notice">Цена и название — Woo Store API. Наличие в демо не подтверждаем. Оплаты нет — бриф или звонок.</div>
          <div class="actions">
            <button type="button" class="btn" onclick="startQuiz('${esc(listing.name)}')">Подойдёт ли к моей системе? ↗</button>
            <a class="btn ghost" href="${esc(listing.source || detail.source || "#")}" target="_blank" rel="noopener">На оригинальном сайте ↗</a>
          </div>
          <div class="pdp-jump">
            <a href="#pdp-about" data-pdp-anchor="pdp-about">О продукте</a>
            ${detail.specs && detail.specs.length ? '<a href="#pdp-specs" data-pdp-anchor="pdp-specs">Характеристики</a>' : ""}
            ${pdpGallery.length > 1 ? '<a href="#pdp-gallery" data-pdp-anchor="pdp-gallery">Галерея</a>' : ""}
          </div>
        </div>
      </div>
      ${renderDescription(detail, listing)}
      ${renderSpecs(detail.specs)}
      ${hitlSpecs}
      ${gallerySection}
      ${relHtml}
      <p class="micro pdp-foot">Карточка: <code>${esc(productHash(listing))}</code> · payload <code>data/pdp/${listing.id}.json</code></p>
    `;
    injectProductJsonLd(listing, detail);
  }

  function detail(id) {
    const p = findProduct(id);
    if (!p) {
      toast("Позиция не найдена в выгрузке каталога");
      return;
    }
    const target = productHash(p);
    const cur = location.hash || "";
    const curRef = cur.replace(/^#product\//, "");
    const sameProduct =
      cur.startsWith("#product/") &&
      (slugMatches(curRef, p.slug) || String(p.id) === decodeSlug(curRef) || String(p.id) === curRef);
    if (!sameProduct) {
      location.hash = target;
      return;
    }
    openPdp(p);
  }
  window.detail = detail;

  async function openPdp(p) {
    pdpListing = p;
    const pdpRoot = document.getElementById("pdp");
    const journeyRoot = document.getElementById("journey");
    const body = document.getElementById("pdpbody");
    setHomeVisibility(false);
    if (journeyRoot) journeyRoot.hidden = true;
    if (pdpRoot) pdpRoot.hidden = false;
    if (body)
      body.innerHTML =
        '<div class="pdp-loading"><div class="eyebrow">MELOMANIAK</div><p>Собираем карточку из живого описания…</p></div>';
    const detailData = await loadDetailPayload(p);
    // race: user may have navigated away (also tolerate encoded/decoded slug forms)
    const hash = location.hash || "";
    if (!hash.startsWith("#product/")) return;
    const ref = hash.replace(/^#product\//, "");
    if (
      ref &&
      !slugMatches(ref, p.slug) &&
      String(p.id) !== decodeSlug(ref) &&
      String(p.id) !== ref
    ) {
      return;
    }
    renderPdp(p, detailData);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function injectProductJsonLd(p, detail) {
    let el = document.getElementById("product-jsonld");
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "product-jsonld";
      document.head.appendChild(el);
    }
    const imgs = galleryItems(p, detail)
      .map((g) => g.src)
      .filter(Boolean)
      .slice(0, 5);
    const desc =
      (detail && (detail.descriptionText || "").slice(0, 500)) || p.note || undefined;
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: desc,
      image: imgs.length ? imgs : (p.gallery || []).slice(0, 3),
      brand: { "@type": "Brand", name: (p.name || "").split(" ")[0] },
      url: p.source,
    };
    if (p.price != null) {
      data.offers = {
        "@type": "Offer",
        priceCurrency: "RUB",
        price: String(p.price),
        availability: "https://schema.org/InStoreOnly",
        url: p.source,
        seller: { "@type": "Organization", name: "MELOMANIAK" },
      };
    }
    el.textContent = JSON.stringify(data);
  }

  function renderFilters(list) {
    const counts = {};
    products.forEach((p) => {
      counts[p.cat] = (counts[p.cat] || 0) + 1;
    });
    const chips = CAT_ORDER.filter((c) => c === "Все" || c === "Избранное" || counts[c]).map((c) => {
      const active = c === "Избранное" ? onlyFav : !onlyFav && current === c;
      const extra =
        c === "Избранное"
          ? " · " + fav.length
          : c === "Все"
            ? " · " + catalog.count
            : counts[c]
              ? " · " + counts[c]
              : "";
      return `<button type="button" class="chip ${active ? "active" : ""}" onclick="filterCategory('${c}')">${c}<span class="chip-count">${extra}</span></button>`;
    });
    document.getElementById("filters").innerHTML = chips.join("");
    const meta = document.getElementById("catalogMeta");
    if (meta) {
      meta.textContent = `Показано ${Math.min(list.length, (page + 1) * PAGE_SIZE)} из ${list.length} · всего в выгрузке ${catalog.count}`;
    }
  }

  function render() {
    const list = filtered();
    renderFilters(list);
    const root = document.getElementById("products");
    if (!root) return;
    if (!list.length) {
      root.innerHTML =
        '<div class="empty">Пока здесь тишина. Снимите фильтр или добавьте позиции в избранное.</div>';
      document.getElementById("pager") && (document.getElementById("pager").innerHTML = "");
      return;
    }
    const slice = list.slice(0, (page + 1) * PAGE_SIZE);
    const lead = slice[0];
    const rest = slice.slice(1);
    const hitl = lead.hitl ? '<div class="hitl-flag">HITL: сверка DX1/PX1 vs BX1 на фото</div>' : "";
    let html = `<article class="feature-row" id="product-${lead.id}" onclick="if(!event.target.closest('button'))detail(${lead.id})">
      <div class="feature-media">${photo(lead, true)}<button type="button" class="fav feature-fav ${isFav(lead) ? "on" : ""}" aria-label="Избранное" aria-pressed="${isFav(lead)}" onclick="event.stopPropagation();toggleFav(${lead.id})">${isFav(lead) ? "♥" : "♡"}</button></div>
      <div class="feature-body"><div class="tag">${lead.old ? "СПЕЦПРЕДЛОЖЕНИЕ" : esc((lead.cat || "").toUpperCase())} · ИЗ ЖИВОГО КАТАЛОГА</div>
      <h3>${esc(lead.name)}</h3><p>${esc(lead.note || "")}</p>${hitl}
      <div class="price">${money(lead.price)}${lead.old ? "<del>" + money(lead.old) + "</del>" : ""}</div>
      <div class="feature-actions"><button type="button" class="btn" onclick="event.stopPropagation();detail(${lead.id})">Смотреть ↗</button>
      <button type="button" class="btn ghost" onclick="event.stopPropagation();startQuiz('${esc(lead.name)}')">В бриф</button></div></div></article>`;
    if (rest.length) {
      html +=
        `<div class="rail">` +
        rest
          .map((x) => {
            const h = x.hitl ? '<div class="hitl-flag">HITL: сверка DX1/PX1 vs BX1</div>' : "";
            return `<article class="rail-item" id="product-${x.id}">
        <div class="rail-media" onclick="detail(${x.id})"><span class="tag">${x.old ? "СПЕЦПРЕДЛОЖЕНИЕ" : esc((x.cat || "").toUpperCase())}</span>
        <button type="button" class="fav ${isFav(x) ? "on" : ""}" aria-label="Избранное" aria-pressed="${isFav(x)}" onclick="event.stopPropagation();toggleFav(${x.id})">${isFav(x) ? "♥" : "♡"}</button>${photo(x)}</div>
        <div class="rail-body"><h3><a href="${esc(productHash(x))}">${esc(x.name)}</a></h3>
        <p>${esc(x.note || "")}</p>${h}<div class="rail-foot"><div class="price">${money(x.price)}${x.old ? "<del>" + money(x.old) + "</del>" : ""}</div>
        <button type="button" class="round" onclick="detail(${x.id})" aria-label="Подробнее">↗</button></div></div></article>`;
          })
          .join("") +
        `</div>`;
    }
    root.innerHTML = html;
    const pager = document.getElementById("pager");
    if (pager) {
      if (slice.length < list.length) {
        pager.innerHTML = `<button type="button" class="btn ghost" onclick="loadMore()">Показать ещё · осталось ${list.length - slice.length}</button>`;
      } else {
        pager.innerHTML = `<span class="micro">Конец текущей выборки · ${list.length} позиций</span>`;
      }
    }
  }
  window.loadMore = () => {
    page += 1;
    render();
  };

  function openSearch() {
    openDialog("search");
    searchProducts("");
    setTimeout(() => document.getElementById("query")?.focus(), 30);
  }
  window.openSearch = openSearch;

  function searchProducts(q) {
    // Modal search is independent of category / избранное / liveQuery filter
    const modalQ = String(q || "")
      .trim()
      .toLowerCase();
    const box = document.getElementById("results");
    if (!box) return;
    let list = products;
    if (modalQ) {
      list = products.filter((p) => {
        const hay = (
          p.name +
          " " +
          p.cat +
          " " +
          (p.note || "") +
          " " +
          (p.cats || []).join(" ") +
          " " +
          (p.slug || "")
        ).toLowerCase();
        return hay.includes(modalQ);
      });
    }
    const ids = list.slice(0, 40);
    box.innerHTML = ids.length
      ? ids
          .map(
            (p) =>
              `<button type="button" class="search-hit" onclick="closeDialog('search');detail(${p.id})"><span class="search-hit-name">${esc(p.name)}</span><span class="search-hit-meta">${esc(p.cat || "")} · ${money(p.price)}</span></button>`
          )
          .join("")
      : '<p class="muted">В выгрузке каталога такого компонента нет.</p>';
  }
  window.searchProducts = searchProducts;

  window.onLiveQuery = (v) => {
    query = v || "";
    page = 0;
    render();
  };

  /* ——— brief quiz ——— */
  const quizState = { step: 0, brief: {} };
  window.brief = quizState.brief;
  function startQuiz(goal) {
    quizState.step = 0;
    quizState.brief = {
      goal: goal || "Система с нуля",
      genres: [],
      room: "",
      budget: "Обсудим",
      existing: "",
      comment: "",
      album: "",
    };
    window.brief = quizState.brief;
    quizRender();
    openDialog("quiz");
  }
  window.startQuiz = startQuiz;

  function quizRender() {
    const step = quizState.step;
    const brief = quizState.brief;
    document.getElementById("progress").style.width = ((step + 1) / 3) * 100 + "%";
    const b = document.getElementById("quizbody");
    if (step === 0) {
      b.innerHTML = `<div class="micro">01 / ВАША МУЗЫКА</div><h2>Что ставим первым?</h2><p class="muted">Жанры или любимый альбом — это скажет больше, чем список моделей.</p><div class="checks">${[
        "Рок / металл",
        "Джаз / блюз",
        "Классика",
        "Электроника",
        "Вокал / соул",
        "Всё понемногу",
      ]
        .map(
          (g) =>
            `<button type="button" class="chip ${brief.genres.includes(g) ? "active" : ""}" onclick="genre('${g}')" aria-pressed="${brief.genres.includes(g)}">${g}</button>`
        )
        .join(
          ""
        )}</div><label for="album">Альбом или исполнитель</label><input id="album" value="${esc(brief.album || "")}" placeholder="Например: Pink Floyd — Wish You Were Here"><div class="actions"><button type="button" class="btn" onclick="quizNextFromMusic()">Дальше →</button></div>`;
    } else if (step === 1) {
      b.innerHTML = `<div class="micro">02 / ВАШЕ ПРОСТРАНСТВО</div><h2>Где зазвучит музыка?</h2><div class="formgrid"><div><label for="room">Площадь комнаты, м²</label><input id="room" type="number" min="5" max="500" placeholder="Например, 24" value="${esc(
        brief.room
      )}"></div><div><label for="budget">Ориентир по бюджету</label><select id="budget">${[
        "Обсудим",
        "До 150 000 ₽",
        "150 000–300 000 ₽",
        "300 000–600 000 ₽",
        "Более 600 000 ₽",
      ]
        .map((x) => `<option ${x === brief.budget ? "selected" : ""}>${x}</option>`)
        .join(
          ""
        )}</select></div></div><label for="existing">Какие компоненты уже есть?</label><textarea id="existing" placeholder="Модели усилителя, акустики, источника…">${esc(
        brief.existing
      )}</textarea><div class="actions"><button type="button" class="btn ghost" onclick="quizBackToMusic()">← Назад</button><button type="button" class="btn" onclick="quizNextFromSpace()">Собрать бриф →</button></div>`;
    } else {
      b.innerHTML = `<div class="micro">03 / НАЧАЛО РАЗГОВОРА</div><h2>Уже есть с чего начать.</h2><div class="notice">${esc(brief.goal)}<br>Музыка: ${esc(
        brief.genres.join(", ") || "обсудим"
      )}<br>Альбом: ${esc(brief.album || "обсудим")}<br>Комната: ${esc(brief.room || "не указана")} ${
        brief.room ? "м²" : ""
      }<br>Бюджет: ${esc(
        brief.budget
      )}</div><label for="comment">Что ещё важно?</label><textarea id="comment" placeholder="Соседи, расстановка, винил, желание наконец услышать бас-гитару…">${esc(
        brief.comment
      )}</textarea><p class="micro">Локальное демо: контакты не собираются, заявка не отправляется.</p><div class="actions"><button type="button" class="btn ghost" onclick="quizBackToSpace()">← Назад</button><button type="button" class="btn" onclick="downloadBrief()">Скачать мой бриф ↓</button></div><a class="link" href="tel:+74959603921">Или позвонить: +7 495 960-39-21</a>`;
    }
  }
  window.quizRender = quizRender;
  window.quizNextFromMusic = function () {
    quizState.brief.album = document.getElementById("album").value;
    quizState.step = 1;
    quizRender();
  };
  window.quizBackToMusic = function () {
    saveSpace();
    quizState.step = 0;
    quizRender();
  };
  window.quizNextFromSpace = function () {
    if (saveSpace()) {
      quizState.step = 2;
      quizRender();
    }
  };
  window.quizBackToSpace = function () {
    quizState.brief.comment = document.getElementById("comment").value;
    quizState.step = 1;
    quizRender();
  };
  window.genre = function (g) {
    const brief = quizState.brief;
    brief.album = document.getElementById("album").value;
    brief.genres = brief.genres.includes(g) ? brief.genres.filter((x) => x !== g) : [...brief.genres, g];
    quizRender();
  };
  window.saveSpace = function () {
    const r = document.getElementById("room");
    if (!r.reportValidity()) return false;
    const brief = quizState.brief;
    brief.room = r.value;
    brief.budget = document.getElementById("budget").value;
    brief.existing = document.getElementById("existing").value;
    return true;
  };
  window.downloadBrief = function () {
    const brief = quizState.brief;
    brief.comment = document.getElementById("comment").value;
    const labels = {
      goal: "Задача",
      genres: "Жанры",
      album: "Альбом",
      room: "Площадь комнаты",
      budget: "Бюджет",
      existing: "Уже есть",
      comment: "Комментарий",
    };
    const text = [
      "MELOMANIAK — бриф на подбор системы",
      "Демо: не отправлено в магазин",
      "",
      ...Object.entries(brief).map(
        ([k, v]) => (labels[k] || k) + ": " + (Array.isArray(v) ? v.join(", ") : v)
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "melomaniak-brief.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Бриф сохранён. В магазин ничего не отправлено.");
  };

  function article(i) {
    const s = stories[i];
    const img = manifest.stories?.[s.title];
    const media = img ? `<div class="product-detail-art"><img src="${esc(img)}" alt="${esc(s.title)}"></div>` : "";
    document.getElementById("detailbody").innerHTML = `<div class="eyebrow">${s.label}</div><h2>${s.title}</h2>${media}<div class="article-body"><p>${s.body}</p></div><div class="notice">В демо — аннотация. Полный архив статей не импортирован.</div><a class="btn ghost" href="https://xn--80aannlcfckh.xn--p1ai/?s=${encodeURIComponent(
      s.title
    )}" target="_blank" rel="noopener">Найти материал на оригинале ↗</a>`;
    openDialog("detail");
  }
  window.article = article;

  /* hash pages: home scroll vs journey vs product PDP */
  function setHomeVisibility(showHome) {
    const journeyRoot = document.getElementById("journey");
    const pdpRoot = document.getElementById("pdp");
    const homeBlocks = document.querySelectorAll("[data-page='home']");
    homeBlocks.forEach((el) => (el.hidden = !showHome));
    document.querySelectorAll("main > section:not([data-page]), main > div:not([data-page])").forEach((el) => {
      if (el.id === "journey" || el.id === "pdp") return;
      el.hidden = !showHome;
    });
    if (journeyRoot && showHome) journeyRoot.hidden = true;
    if (pdpRoot && showHome) pdpRoot.hidden = true;
  }

  const PDP_INPAGE = new Set(["pdp-specs", "pdp-about", "pdp-gallery"]);

  function scrollPdpAnchor(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function showPage(hash) {
    const raw = (hash || "#home").replace(/^#/, "") || "home";
    const journeyIds = ["oplata", "dostavka", "ustanovka"];
    const journeyRoot = document.getElementById("journey");
    const panels = document.querySelectorAll(".journey-panel");
    const pdpRoot = document.getElementById("pdp");

    // In-page PDP anchors (#pdp-specs etc.) must NOT leave the product page.
    // Prefer click handler (keeps #product/…); this is a safety net if hash changed.
    if (PDP_INPAGE.has(raw)) {
      if (pdpRoot && !pdpRoot.hidden && pdpListing) {
        setHomeVisibility(false);
        if (journeyRoot) journeyRoot.hidden = true;
        panels.forEach((panel) => (panel.hidden = true));
        pdpRoot.hidden = false;
        setTimeout(() => scrollPdpAnchor(raw), 40);
        return;
      }
      // Cold load of #pdp-specs with no product — fall through to home rather than blank.
    }

    // #product/slug or #product/id (slug may be encoded, decoded, or catalog-%xx)
    if (raw.startsWith("product/") || raw.startsWith("product-")) {
      let ref = raw.startsWith("product/")
        ? raw.slice("product/".length)
        : raw.slice("product-".length);
      // Strip accidental in-page fragment leftovers if any
      ref = ref.split(/[?#]/)[0];
      const p = findProduct(ref);
      setHomeVisibility(false);
      if (journeyRoot) journeyRoot.hidden = true;
      panels.forEach((panel) => (panel.hidden = true));
      if (pdpRoot) pdpRoot.hidden = false;
      if (p && (!pdpListing || pdpListing.id !== p.id)) {
        openPdp(p);
      } else if (p && pdpListing && pdpListing.id === p.id) {
        // already on this PDP — keep content
      } else if (!p) {
        pdpListing = null;
        if (pdpRoot) {
          document.getElementById("pdpbody").innerHTML =
            '<div class="pdp-loading"><p>Позиция не найдена.</p><a class="btn ghost" href="#collection">В каталог</a></div>';
        }
      }
      return;
    }

    if (pdpRoot) pdpRoot.hidden = true;
    pdpListing = null;

    const isJourney = journeyIds.includes(raw);
    if (isJourney) {
      setHomeVisibility(false);
      if (journeyRoot) journeyRoot.hidden = false;
      panels.forEach((panel) => (panel.hidden = panel.id !== "journey-" + raw));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // restore home
    if (journeyRoot) journeyRoot.hidden = true;
    panels.forEach((panel) => (panel.hidden = true));
    setHomeVisibility(true);
    const scrollTargets = ["collection", "services", "approach", "journal", "faq", "contacts"];
    if (scrollTargets.includes(raw)) {
      setTimeout(() => document.getElementById(raw)?.scrollIntoView({ behavior: "smooth" }), 40);
    } else if (raw === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  window.showPage = showPage;
  window.addEventListener("hashchange", () => showPage(location.hash));

  /* PDP in-page jump links: scroll without replacing #product/… hash (router hijack). */
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest && e.target.closest("[data-pdp-anchor]");
      if (!a) return;
      const id = a.getAttribute("data-pdp-anchor");
      if (!id || !PDP_INPAGE.has(id)) return;
      e.preventDefault();
      e.stopPropagation();
      scrollPdpAnchor(id);
    },
    true
  );

  /* init media strips */
  (function initStrip() {
    const strip = document.getElementById("photoStrip");
    const items = (manifest.atmosphere || []).slice(0, 6);
    const labels = ["DAVIS", "STAGE", "ELAC", "JBL A190", "ATMOSPHERE", "STEREOPHILE"];
    if (strip) {
      strip.innerHTML = items
        .map(
          (src, i) =>
            `<figure><img src="${esc(src)}" alt="Кадр с melomaniak.рф ${i + 1}" width="480" height="600" loading="lazy" decoding="async"><figcaption>LIVE · ${labels[i] || i + 1}</figcaption></figure>`
        )
        .join("");
    }
    const mosaic = document.getElementById("lookbookMosaic");
    if (mosaic) {
      const shots = (manifest.lookbookStrip || manifest.atmosphere || []).slice(0, 5);
      const caps = ["JBL STAGE", "DAVIS MK2", "ELAC DEBUT", "STAGE A170", "ELAC VELA"];
      mosaic.innerHTML = shots
        .map(
          (src, i) =>
            `<figure><img src="${esc(src)}" alt="Lookbook ${caps[i] || i + 1} — melomaniak.рф" width="960" height="720" loading="lazy" decoding="async"><figcaption>${caps[i] || "LIVE · " + (i + 1)}</figcaption></figure>`
        )
        .join("");
    }
    const storiesEl = document.getElementById("stories");
    if (storiesEl) {
      storiesEl.innerHTML = stories
        .map((s, i) => {
          const img = manifest.stories?.[s.title];
          const art = img
            ? `<img src="${esc(img)}" alt="${esc(s.title)}" width="800" height="450" loading="lazy" decoding="async">`
            : `<span style="font:48px var(--display);color:rgba(212,175,55,.35);display:grid;place-items:center;height:100%">${esc(s.title.slice(0, 4))}</span>`;
          return `<button type="button" class="story" onclick="article(${i})"><div class="story-art">${art}</div><div class="story-inner"><p><small>${s.label}</small></p><h3>${s.title} ↗</h3><p>Открыть аннотацию материала из архива.</p></div></button>`;
        })
        .join("");
    }
  })();

  document.addEventListener("keydown", (e) => {
    const pdp = document.getElementById("pdp");
    if (!pdp || pdp.hidden) return;
    if (document.querySelector("dialog[open]")) return;
    // PhotoSwipe owns Escape / arrows while open
    if (document.querySelector(".pswp--open")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPdpSlide(pdpActive - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPdpSlide(pdpActive + 1);
    } else if (e.key === "Escape" && location.hash.startsWith("#product/")) {
      location.hash = "#collection";
    }
  });

  render();
  showPage(location.hash || "#home");
})();
