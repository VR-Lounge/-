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

  function findProduct(ref) {
    const key = String(ref || "");
    let decoded = key;
    try {
      decoded = decodeURIComponent(key);
    } catch (e) {}
    return (
      products.find(
        (x) =>
          String(x.id) === key ||
          String(x.id) === decoded ||
          x.slug === key ||
          x.slug === decoded
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

  function renderDescription(detail, listing) {
    const html = (detail.descriptionHtml || "").trim();
    if (html) {
      return `<section class="pdp-section" id="pdp-about">
        <div class="eyebrow">О ПРОДУКТЕ</div>
        <h3 class="pdp-h">Слова с живой карточки</h3>
        <p class="pdp-lead">Ниже — оригинальное описание WooCommerce. Мы лишь собрали его в спокойную вёрстку салона.</p>
        <div class="pdp-prose">${html}</div>
      </section>`;
    }
    const text = (detail.descriptionText || listing.facts || "").trim();
    if (text) {
      return `<section class="pdp-section" id="pdp-about">
        <div class="eyebrow">О ПРОДУКТЕ</div>
        <h3 class="pdp-h">Кратко из источника</h3>
        <div class="pdp-prose"><p>${esc(text)}</p></div>
        <p class="hitl-flag">HITL: полного HTML-описания в выгрузке нет — показан доступный текст.</p>
      </section>`;
    }
    return `<section class="pdp-section" id="pdp-about">
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
              `<a class="related-card" href="#product/${esc(r.slug || r.id)}"><span class="related-thumb">${photo(r)}</span><span>${esc(r.name)}</span><strong>${money(r.price)}</strong></a>`
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
            <a href="#pdp-about">О продукте</a>
            ${detail.specs && detail.specs.length ? '<a href="#pdp-specs">Характеристики</a>' : ""}
            ${pdpGallery.length > 1 ? '<a href="#pdp-gallery">Галерея</a>' : ""}
          </div>
        </div>
      </div>
      ${renderDescription(detail, listing)}
      ${renderSpecs(detail.specs)}
      ${hitlSpecs}
      ${gallerySection}
      ${relHtml}
      <p class="micro pdp-foot">Карточка: <code>#product/${esc(listing.slug || listing.id)}</code> · payload <code>data/pdp/${listing.id}.json</code></p>
    `;
    injectProductJsonLd(listing, detail);
  }

  function detail(id) {
    const p = findProduct(id);
    if (!p) {
      toast("Позиция не найдена в выгрузке каталога");
      return;
    }
    const slug = p.slug || String(p.id);
    if (location.hash !== "#product/" + slug && location.hash !== "#product/" + p.id) {
      location.hash = "#product/" + slug;
      return;
    }
    openPdp(p);
  }
  window.detail = detail;

  async function openPdp(p) {
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
    // race: user may have navigated away
    const ref = (location.hash || "").replace(/^#product\//, "");
    if (!location.hash.startsWith("#product/")) return;
    if (ref && ref !== p.slug && ref !== String(p.id)) return;
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
        <div class="rail-body"><h3><a href="#product/${esc(x.slug || x.id)}">${esc(x.name)}</a></h3>
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

  function showPage(hash) {
    const raw = (hash || "#home").replace(/^#/, "") || "home";
    const journeyIds = ["oplata", "dostavka", "ustanovka"];
    const journeyRoot = document.getElementById("journey");
    const panels = document.querySelectorAll(".journey-panel");
    const pdpRoot = document.getElementById("pdp");

    // #product/slug or #product/id
    if (raw.startsWith("product/") || raw.startsWith("product-")) {
      let ref = raw.startsWith("product/")
        ? decodeURIComponent(raw.slice("product/".length))
        : raw.slice("product-".length);
      const p = findProduct(ref);
      setHomeVisibility(false);
      if (journeyRoot) journeyRoot.hidden = true;
      panels.forEach((panel) => (panel.hidden = true));
      if (pdpRoot) pdpRoot.hidden = false;
      if (p && (!pdpListing || pdpListing.id !== p.id)) {
        openPdp(p);
      } else if (!p) {
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
