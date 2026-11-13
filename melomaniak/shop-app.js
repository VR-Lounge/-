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
  function photo(p, eager) {
    const a = thumbOf(p);
    const loading = eager ? "eager" : "lazy";
    return a
      ? `<img src="${esc(a)}" alt="${esc(p.name)}" width="640" height="640" loading="${loading}" decoding="async" onerror="this.onerror=null;this.outerHTML=window.__meloIllu()">`
      : illustration();
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
  window.showFavorites = () => filterCategory("Избранное", true);

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

  function detail(id, imgIdx) {
    imgIdx = imgIdx || 0;
    const p = products.find((x) => String(x.id) === String(id));
    if (!p) return;
    const g = (p.gallery && p.gallery.length ? p.gallery : thumbOf(p) ? [thumbOf(p)] : []).filter(Boolean);
    const src = g[imgIdx] || thumbOf(p);
    const media = src
      ? `<img id="detailImg" src="${esc(src)}" alt="${esc(p.name)}" width="800" height="800" decoding="async">`
      : illustration();
    const thumbs =
      g.length > 1
        ? `<div class="thumbs">${g
            .map(
              (u, k) =>
                `<button type="button" class="${k === imgIdx ? "active" : ""}" aria-label="Кадр ${k + 1}" aria-pressed="${k === imgIdx}" onclick="detail(${p.id},${k})"><img src="${esc(u)}" alt="" width="128" height="128" loading="lazy" decoding="async"></button>`
            )
            .join("")}</div>`
        : "";
    const hitl = p.hitl
      ? '<p class="hitl-flag">HITL: на исходном фото карточки читаются Smart DX1 и Smart BX1 при листинге «DX1 + PX1».</p>'
      : "";
    const priceBlock =
      p.price != null
        ? `<h3 class="price">${money(p.price)} ${
            p.old ? '<del class="muted" style="font-size:14px">' + money(p.old) + "</del>" : ""
          }</h3>`
        : `<h3 class="price">Цена по запросу</h3>`;
    const rel = related(p);
    const relHtml = rel.length
      ? `<div class="related"><div class="eyebrow">РЯДОМ В КАТАЛОГЕ</div><div class="related-rail">${rel
          .map(
            (r) =>
              `<button type="button" class="related-card" onclick="detail(${r.id})"><span class="related-thumb">${photo(r)}</span><span>${esc(r.name)}</span><strong>${money(r.price)}</strong></button>`
          )
          .join("")}</div></div>`
      : "";
    const jsonLd =
      p.price != null
        ? ""
        : ""; /* Product JSON-LD injected separately only with real Offer */
    document.getElementById("detailbody").innerHTML = `${jsonLd}<div class="eyebrow">${esc(
      (p.cat || "").toUpperCase()
    )} / WOO · ЖИВОЙ КАТАЛОГ</div><h2>${esc(p.name)}</h2><div class="product-detail-art">${media}</div>${thumbs}<p>${esc(
      p.note || ""
    )}</p>${hitl}${priceBlock}${
      p.facts ? `<p class="muted">${esc(p.facts)}</p>` : ""
    }<div class="notice">Цена и название из Woo Store API живого сайта. Наличие не подтверждаем в демо. Оплаты нет — только бриф/звонок.</div><div class="actions"><button class="btn" onclick="closeDialog('detail');startQuiz('${esc(
      p.name
    )}')">Подойдёт ли к моей системе? ↗</button><a class="btn ghost" href="${esc(
      p.source || "https://xn--80aannlcfckh.xn--p1ai/"
    )}" target="_blank" rel="noopener">На оригинальном сайте ↗</a></div>${relHtml}`;
    openDialog("detail");
    injectProductJsonLd(p);
  }
  window.detail = detail;

  function injectProductJsonLd(p) {
    let el = document.getElementById("product-jsonld");
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = "product-jsonld";
      document.head.appendChild(el);
    }
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: p.note || undefined,
      image: (p.gallery || []).slice(0, 3),
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
        <div class="rail-body"><h3><a href="#product-${x.id}" onclick="event.preventDefault();detail(${x.id})">${esc(x.name)}</a></h3>
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
    query = q || "";
    const ids = filtered().slice(0, 40);
    const box = document.getElementById("results");
    if (!box) return;
    box.innerHTML = ids.length
      ? ids
          .map(
            (p) =>
              `<button type="button" onclick="closeDialog('search');detail(${p.id})">${esc(p.name)}<span style="float:right;color:var(--gold)">${money(p.price)}</span></button>`
          )
          .join("")
      : '<p class="muted">В выгрузке каталога такого компонента нет.</p>';
    // live filter catalog when typing from toolbar
    if (document.getElementById("liveQuery") === document.activeElement) {
      page = 0;
      render();
    }
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

  /* hash pages: home scroll vs journey content pages */
  function showPage(hash) {
    const id = (hash || "#home").replace(/^#/, "") || "home";
    const journeyIds = ["oplata", "dostavka", "ustanovka"];
    const journeyRoot = document.getElementById("journey");
    const panels = document.querySelectorAll(".journey-panel");
    const homeBlocks = document.querySelectorAll("[data-page='home']");
    const isJourney = journeyIds.includes(id);

    if (isJourney) {
      homeBlocks.forEach((el) => (el.hidden = true));
      // hide default main sections that aren't marked (hero etc.)
      document.querySelectorAll("main > section:not([data-page]), main > div:not([data-page])").forEach((el) => {
        if (el.id !== "journey") el.hidden = true;
      });
      if (journeyRoot) journeyRoot.hidden = false;
      panels.forEach((p) => (p.hidden = p.id !== "journey-" + id));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // restore home
    if (journeyRoot) journeyRoot.hidden = true;
    panels.forEach((p) => (p.hidden = true));
    homeBlocks.forEach((el) => (el.hidden = false));
    document.querySelectorAll("main > section:not([data-page]), main > div:not([data-page])").forEach((el) => {
      el.hidden = false;
    });
    const scrollTargets = ["collection", "services", "approach", "journal", "faq", "contacts"];
    if (scrollTargets.includes(id)) {
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 40);
    } else if (id === "home") {
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

  render();
  showPage(location.hash || "#home");
})();
