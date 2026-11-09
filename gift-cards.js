/**
 * VR Lounge — Gift / Prepaid cards module (additive).
 * Type=gift now; type=prepaid reserved for future shared balance model.
 * Does NOT touch payroll/salary/revenue formulas — only its own collections
 * plus optional booking.giftPayment metadata / notes.
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const GIFT_PUBLIC_BASE =
  (typeof location !== "undefined" && location.origin
    ? location.origin + location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")
    : "https://vr-lounge.github.io/-") + "/gift.html";

export const REDESIGN_GIFT_PUBLIC_BASE =
  "https://vr-lounge.github.io/vr-lounge-redesign/gift.html";

const STATUS_LABELS = {
  draft: "Черновик",
  pending: "Ожидает",
  issued: "Выпущена",
  partial: "Частично",
  redeemed: "Погашена",
  void: "Аннулирована",
};

const LOCAL_KEY = "vrl_gift_cards_local_v1";
const LOCAL_LEDGER_KEY = "vrl_gift_ledger_local_v1";

function nowIso() {
  return new Date().toISOString();
}

function digitsPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function normalizeRecipient(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 6; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 6; i++) out += alphabet[arr[i] % alphabet.length];
  return "VRL-" + out;
}

function formatRub(n) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(Number(n) || 0)) + " ₽";
}

function statusBadgeClass(status) {
  switch (status) {
    case "issued":
      return "bg-green-100 text-green-800";
    case "partial":
      return "bg-yellow-100 text-yellow-800";
    case "pending":
      return "bg-blue-100 text-blue-800";
    case "redeemed":
      return "bg-gray-100 text-gray-600";
    case "void":
      return "bg-red-100 text-red-700";
    case "draft":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function deriveStatus(faceValue, balance, current) {
  if (current === "void" || current === "draft" || current === "pending") return current;
  if (balance <= 0) return "redeemed";
  if (balance < faceValue) return "partial";
  return "issued";
}

function loadLocalCards() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalCards(cards) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(cards));
}

function loadLocalLedger() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LEDGER_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalLedger(entries) {
  localStorage.setItem(LOCAL_LEDGER_KEY, JSON.stringify(entries));
}

function seedLocalDemoIfEmpty() {
  const cards = loadLocalCards();
  if (cards.length) return cards;
  const code = "VRL-DEMO01";
  const demo = {
    id: "local-demo-1",
    type: "gift",
    publicCode: code,
    status: "issued",
    faceValue: 5000,
    balance: 5000,
    currency: "RUB",
    buyerPhone: "+7 (900) 000-00-00",
    buyerPhoneDigits: "79000000000",
    recipientName: "ИВАН ИВАНОВИЧ ИВАНОВ",
    theme: "amethyst",
    createdAt: nowIso(),
    issuedAt: nowIso(),
    createdBy: "crm",
    linkedClientId: null,
    _local: true,
  };
  saveLocalCards([demo]);
  saveLocalLedger([
    {
      id: "local-ledger-1",
      cardId: demo.id,
      publicCode: code,
      kind: "credit",
      amount: 5000,
      note: "Выпуск (локальное демо)",
      bookingId: null,
      createdBy: "system",
      createdAt: nowIso(),
    },
  ]);
  return [demo];
}

/**
 * @param {object} opts
 * @param {import('firebase/firestore').Firestore} opts.db
 * @param {() => boolean} opts.isAdmin
 * @param {() => (string|null)} [opts.getUid]
 * @param {HTMLElement} [opts.root]
 * @param {boolean} [opts.preferLocal] force localStorage (screenshots / offline)
 */
export function initGiftCardsCrm(opts) {
  const { db, isAdmin, getUid = () => null, root, preferLocal = false } = opts;
  let cards = [];
  let unsubscribe = null;
  let selectedId = null;
  let useLocal = preferLocal;
  let firebaseReady = false;

  const section =
    root ||
    document.getElementById("giftCardsSection") ||
    ensureGiftSectionDom();

  const els = {
    list: section.querySelector("[data-gift-list]"),
    empty: section.querySelector("[data-gift-empty]"),
    detail: section.querySelector("[data-gift-detail]"),
    issueForm: section.querySelector("#giftIssueForm"),
    redeemForm: section.querySelector("#giftRedeemForm"),
    statusFilter: section.querySelector("#giftStatusFilter"),
    search: section.querySelector("#giftSearch"),
    backendHint: section.querySelector("[data-gift-backend-hint]"),
  };

  function setBackendHint(msg, isWarn) {
    if (!els.backendHint) return;
    els.backendHint.textContent = msg || "";
    els.backendHint.classList.toggle("hidden", !msg);
    els.backendHint.classList.toggle("text-amber-700", !!isWarn);
    els.backendHint.classList.toggle("bg-amber-50", !!isWarn);
  }

  async function trySubscribeFirebase() {
    if (preferLocal || !db) {
      useLocal = true;
      cards = seedLocalDemoIfEmpty();
      renderList();
      setBackendHint(
        "Локальный режим: Firestore недоступен или demo-флаг. Данные только в этом браузере.",
        true
      );
      return;
    }
    try {
      unsubscribe = onSnapshot(
        query(collection(db, "giftCards"), orderBy("createdAt", "desc"), limit(200)),
        (snap) => {
          firebaseReady = true;
          useLocal = false;
          cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setBackendHint("Firestore: giftCards · live", false);
          renderList();
          if (selectedId) renderDetail(selectedId);
        },
        (err) => {
          console.warn("[gift] snapshot failed, falling back to local:", err);
          useLocal = true;
          cards = seedLocalDemoIfEmpty();
          setBackendHint(
            "Firestore rules/index ещё не задеплоены — локальный режим. Деплой firestore.rules + индекс giftCards.createdAt.",
            true
          );
          renderList();
        }
      );
    } catch (err) {
      console.warn("[gift] subscribe error", err);
      useLocal = true;
      cards = seedLocalDemoIfEmpty();
      setBackendHint("Ошибка подписки Firestore — локальный режим.", true);
      renderList();
    }
  }

  function filteredCards() {
    const q = (els.search?.value || "").trim().toLowerCase();
    const st = els.statusFilter?.value || "";
    return cards.filter((c) => {
      if (st && c.status !== st) return false;
      if (!q) return true;
      const hay = [c.publicCode, c.recipientName, c.buyerPhone, c.status]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function renderList() {
    if (!els.list) return;
    const rows = filteredCards();
    els.list.innerHTML = "";
    if (els.empty) els.empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach((c) => {
      const tr = document.createElement("tr");
      tr.className =
        "hover:bg-blue-50 cursor-pointer " +
        (c.id === selectedId ? "bg-blue-50" : "");
      tr.innerHTML = `
        <td class="py-3 px-3 font-mono text-sm">${escapeHtml(c.publicCode || "")}</td>
        <td class="py-3 px-3">${escapeHtml(c.recipientName || "—")}</td>
        <td class="py-3 px-3">${escapeHtml(c.buyerPhone || "—")}</td>
        <td class="py-3 px-3">${formatRub(c.faceValue)}</td>
        <td class="py-3 px-3 font-semibold">${formatRub(c.balance)}</td>
        <td class="py-3 px-3"><span class="px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(
          c.status
        )}">${STATUS_LABELS[c.status] || c.status}</span></td>
        <td class="py-3 px-3 text-sm text-gray-500">${formatDate(c.createdAt)}</td>
      `;
      tr.addEventListener("click", () => {
        selectedId = c.id;
        renderList();
        renderDetail(c.id);
      });
      els.list.appendChild(tr);
    });
  }

  async function loadLedger(cardId) {
    if (useLocal) {
      return loadLocalLedger()
        .filter((e) => e.cardId === cardId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, "giftLedger"),
          where("cardId", "==", cardId),
          orderBy("createdAt", "desc"),
          limit(100)
        )
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn("[gift] ledger query failed", err);
      try {
        const snap = await getDocs(
          query(collection(db, "giftLedger"), where("cardId", "==", cardId), limit(100))
        );
        return snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      } catch (e2) {
        return [];
      }
    }
  }

  async function renderDetail(cardId) {
    if (!els.detail) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card) {
      els.detail.innerHTML =
        '<p class="text-gray-500 text-center py-8">Выберите карту из списка</p>';
      return;
    }
    const ledger = await loadLedger(cardId);
    const publicUrl = publicPageUrl(card.publicCode);
    els.detail.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-xl font-semibold text-gray-900 font-mono">${escapeHtml(
              card.publicCode
            )}</h3>
            <p class="text-gray-600 mt-1">${escapeHtml(card.recipientName || "")}</p>
            <p class="text-sm text-gray-500">${escapeHtml(card.buyerPhone || "")}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-sm font-medium ${statusBadgeClass(
            card.status
          )}">${STATUS_LABELS[card.status] || card.status}</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-2xl bg-gray-50 p-4"><div class="text-xs text-gray-500">Номинал</div><div class="text-lg font-semibold">${formatRub(
            card.faceValue
          )}</div></div>
          <div class="rounded-2xl bg-green-50 p-4"><div class="text-xs text-green-700">Баланс</div><div class="text-lg font-semibold text-green-800">${formatRub(
            card.balance
          )}</div></div>
          <div class="rounded-2xl bg-gray-50 p-4"><div class="text-xs text-gray-500">Тип</div><div class="text-lg font-semibold">${
            card.type === "prepaid" ? "Предоплаченная" : "Подарочная"
          }</div></div>
          <div class="rounded-2xl bg-gray-50 p-4"><div class="text-xs text-gray-500">Источник</div><div class="text-lg font-semibold">${escapeHtml(
            String(card.createdBy || "—")
          )}</div></div>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="${escapeAttr(publicUrl)}" target="_blank" rel="noopener" class="inline-flex items-center px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Открыть публичную страницу</a>
          <a href="${escapeAttr(publicUrl + (publicUrl.includes("?") ? "&" : "?") + "print=1")}" target="_blank" rel="noopener" class="inline-flex items-center px-4 py-2 rounded-2xl bg-fuchsia-600 text-white text-sm font-medium hover:bg-fuchsia-700" title="Откроет карту и диалог печати / PDF / PNG через системный диалог">Скачать карту (PDF/PNG)</a>
          <button type="button" data-copy-link class="px-4 py-2 rounded-2xl border border-gray-300 text-sm font-medium hover:bg-gray-50">Копировать ссылку</button>
          ${
            card.status === "pending"
              ? `<button type="button" data-confirm-paid class="px-4 py-2 rounded-2xl bg-green-600 text-white text-sm font-medium hover:bg-green-700">Оплачено / активировать</button>`
              : ""
          }
          ${
            card.status !== "void" && card.status !== "pending" && card.balance > 0
              ? `<button type="button" data-focus-redeem class="px-4 py-2 rounded-2xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Списать</button>`
              : ""
          }
          ${
            card.status === "pending" || card.status === "issued" || card.status === "partial"
              ? `<button type="button" data-void-card class="px-4 py-2 rounded-2xl border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50">Аннулировать</button>`
              : ""
          }
        </div>
        <div>
          <h4 class="font-semibold text-gray-800 mb-2">История (ledger)</h4>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            ${
              ledger.length
                ? ledger
                    .map(
                      (e) => `
              <div class="flex justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                <div>
                  <div class="font-medium ${
                    e.kind === "debit" ? "text-red-700" : "text-green-700"
                  }">${e.kind === "debit" ? "−" : "+"}${formatRub(e.amount)}</div>
                  <div class="text-gray-500">${escapeHtml(e.note || "")}${
                        e.bookingId
                          ? ` · запись ${escapeHtml(e.bookingId)}`
                          : ""
                      }</div>
                </div>
                <div class="text-gray-400 whitespace-nowrap">${formatDate(
                  e.createdAt
                )}</div>
              </div>`
                    )
                    .join("")
                : '<p class="text-gray-400 text-sm">Операций пока нет</p>'
            }
          </div>
        </div>
        <form id="giftRedeemFormInline" class="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3 ${
          card.status === "void" || card.balance <= 0 ? "hidden" : ""
        }">
          <h4 class="font-semibold text-amber-900">Списать с карты</h4>
          <p class="text-xs text-amber-800">Списание идёт только в giftLedger. Формулы зарплаты / выручки CRM не меняются. Можно указать id записи для связи.</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input name="amount" type="number" min="1" max="${
              card.balance
            }" required placeholder="Сумма ₽" class="rounded-2xl border border-amber-300 px-4 py-2" />
            <input name="bookingId" type="text" placeholder="ID записи (опц.)" class="rounded-2xl border border-amber-300 px-4 py-2" />
            <input name="note" type="text" placeholder="Комментарий" class="rounded-2xl border border-amber-300 px-4 py-2" />
          </div>
          <button type="submit" class="px-4 py-2 rounded-2xl bg-amber-600 text-white font-semibold hover:bg-amber-700">Списать</button>
        </form>
      </div>
    `;
    els.detail.querySelector("[data-copy-link]")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(publicUrl);
        alert("Ссылка скопирована");
      } catch {
        prompt("Скопируйте ссылку:", publicUrl);
      }
    });
    els.detail.querySelector("[data-confirm-paid]")?.addEventListener("click", async () => {
      if (!isAdmin()) {
        alert("Требуется авторизация администратора");
        return;
      }
      if (!confirm(`Подтвердить оплату и активировать ${card.publicCode}?`)) return;
      try {
        await confirmGiftCardPaid(db, {
          cardId: card.id,
          createdBy: getUid() || "crm",
          useLocal,
          cardsRef: () => cards,
          setCards: (next) => {
            cards = next;
          },
        });
        if (useLocal) {
          cards = loadLocalCards();
          renderList();
        }
        renderDetail(card.id);
        alert("Карта активирована (issued). Отправьте PNG/PDF покупателю.");
      } catch (err) {
        console.error(err);
        alert("Не удалось активировать: " + (err.message || err));
      }
    });
    els.detail.querySelector("[data-void-card]")?.addEventListener("click", async () => {
      if (!isAdmin()) {
        alert("Требуется авторизация администратора");
        return;
      }
      if (!confirm(`Аннулировать карту ${card.publicCode}?`)) return;
      try {
        await voidGiftCard(db, {
          cardId: card.id,
          createdBy: getUid() || "crm",
          useLocal,
          cardsRef: () => cards,
          setCards: (next) => {
            cards = next;
          },
        });
        if (useLocal) {
          cards = loadLocalCards();
          renderList();
        }
        renderDetail(card.id);
      } catch (err) {
        console.error(err);
        alert("Не удалось аннулировать: " + (err.message || err));
      }
    });
    els.detail.querySelector("[data-focus-redeem]")?.addEventListener("click", () => {
      els.detail.querySelector("#giftRedeemFormInline")?.scrollIntoView({ behavior: "smooth" });
    });
    els.detail.querySelector("#giftRedeemFormInline")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin()) {
        alert("Требуется авторизация администратора");
        return;
      }
      const fd = new FormData(e.target);
      const amount = parseFloat(String(fd.get("amount")));
      const bookingId = String(fd.get("bookingId") || "").trim() || null;
      const note = String(fd.get("note") || "").trim() || "Списание в CRM";
      try {
        await redeemGiftCard(db, {
          cardId: card.id,
          amount,
          bookingId,
          note,
          createdBy: getUid() || "crm",
          useLocal,
          cardsRef: () => cards,
          setCards: (next) => {
            cards = next;
          },
        });
        if (useLocal) {
          cards = loadLocalCards();
          renderList();
          renderDetail(card.id);
        }
        alert("Списание выполнено");
      } catch (err) {
        console.error(err);
        alert("Не удалось списать: " + (err.message || err));
      }
    });
  }

  if (els.issueForm) {
    els.issueForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin()) {
        alert("Требуется авторизация администратора");
        return;
      }
      const fd = new FormData(els.issueForm);
      const faceValue = parseFloat(String(fd.get("faceValue")));
      const buyerPhone = String(fd.get("buyerPhone") || "").trim();
      const recipientName = normalizeRecipient(fd.get("recipientName")) || "НЕ УКАЗАНО";
      const theme = String(fd.get("theme") || "amethyst");
      const phoneDigits = digitsPhone(buyerPhone);
      if (!(phoneDigits.length === 11 && phoneDigits.startsWith("7")) && phoneDigits.length !== 10) {
        alert("Телефон покупателя: +7 (XXX) XXX-XX-XX");
        return;
      }
      if (!faceValue || faceValue < 1000 || faceValue > 20000 || faceValue % 1000 !== 0) {
        alert("Номинал 1 000–20 000 ₽, шаг 1 000");
        return;
      }
      try {
        const created = await createGiftCard(db, {
          faceValue,
          buyerPhone,
          recipientName,
          theme,
          createdBy: getUid() || "crm",
          status: "issued",
          useLocal,
        });
        if (useLocal) {
          cards = loadLocalCards();
          renderList();
          selectedId = created.id;
          renderDetail(created.id);
        } else {
          selectedId = created.id;
        }
        els.issueForm.reset();
        alert("Карта выпущена: " + created.publicCode);
      } catch (err) {
        console.error(err);
        alert("Не удалось выпустить карту: " + (err.message || err));
      }
    });
  }

  els.statusFilter?.addEventListener("change", renderList);
  els.search?.addEventListener("input", renderList);

  // Booking form hook: lookup + fill giftPayment metadata (does not alter cash/transfer math)
  wireBookingGiftHook(db, () => useLocal);

  trySubscribeFirebase();

  return {
    refresh: () => {
      if (useLocal) {
        cards = loadLocalCards();
        renderList();
      }
    },
    destroy: () => unsubscribe && unsubscribe(),
  };
}

function publicPageUrl(code) {
  // Prefer redesign public page (deployable from this agent); CRM gift.html as fallback path
  const redesign = REDESIGN_GIFT_PUBLIC_BASE + "?code=" + encodeURIComponent(code);
  try {
    if (/vr-lounge\.github\.io\/-\//.test(location.href) || /\/-\//.test(location.pathname)) {
      return (
        location.origin +
        location.pathname.replace(/index\.html$/, "").replace(/\/?$/, "/") +
        "gift.html?code=" +
        encodeURIComponent(code)
      );
    }
  } catch {
    /* ignore */
  }
  return redesign;
}

function wireBookingGiftHook(db, getUseLocal) {
  const methodSelect = document.getElementById("finalPaymentMethod");
  const bookingForm = document.getElementById("bookingForm");
  if (!methodSelect || !bookingForm) return;
  if (methodSelect.querySelector('option[value="gift"]')) return;

  const opt = document.createElement("option");
  opt.value = "gift_note";
  opt.textContent = "Подарочная карта (заметка, без изменения ЗП)";
  methodSelect.appendChild(opt);

  let panel = document.getElementById("giftPaymentPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "giftPaymentPanel";
    panel.className = "hidden rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-3";
    panel.innerHTML = `
      <p class="text-sm text-violet-900 font-medium">Оплата с подарочной карты</p>
      <p class="text-xs text-violet-800">Списание баланса карты — отдельный ledger. Поля наличных/перевода и расчёт зарплаты не меняются. В примечание записи добавится код карты.</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input id="giftPayCode" type="text" placeholder="Код VRL-…" class="rounded-2xl border border-violet-300 px-4 py-2 uppercase" />
        <input id="giftPayAmount" type="number" min="0" placeholder="Сумма списания" class="rounded-2xl border border-violet-300 px-4 py-2" />
        <button type="button" id="giftPayLookup" class="rounded-2xl bg-violet-600 text-white font-medium hover:bg-violet-700">Проверить баланс</button>
      </div>
      <p id="giftPayHint" class="text-sm text-violet-800"></p>
      <input type="hidden" id="giftPayCardId" value="" />
    `;
    const notes = bookingForm.querySelector("#notes")?.closest("div");
    if (notes) notes.parentNode.insertBefore(panel, notes);
    else bookingForm.appendChild(panel);
  }

  const syncPanel = () => {
    panel.classList.toggle("hidden", methodSelect.value !== "gift_note");
  };
  methodSelect.addEventListener("change", syncPanel);
  syncPanel();

  document.getElementById("giftPayLookup")?.addEventListener("click", async () => {
    const code = String(document.getElementById("giftPayCode").value || "")
      .trim()
      .toUpperCase();
    const hint = document.getElementById("giftPayHint");
    try {
      const card = await findGiftCardByCode(db, code, getUseLocal());
      if (!card) {
        hint.textContent = "Карта не найдена";
        document.getElementById("giftPayCardId").value = "";
        return;
      }
      document.getElementById("giftPayCardId").value = card.id;
      hint.textContent = `${card.publicCode}: баланс ${formatRub(card.balance)} · ${
        STATUS_LABELS[card.status] || card.status
      }`;
      const amt = document.getElementById("giftPayAmount");
      if (!amt.value) amt.value = String(card.balance);
    } catch (err) {
      hint.textContent = "Ошибка поиска: " + (err.message || err);
    }
  });

  // Expose helper for booking submit patch
  window.__vrlGiftPaymentCapture = async function captureGiftPaymentAfterSave(bookingId) {
    if (methodSelect.value !== "gift_note") return null;
    const cardId = document.getElementById("giftPayCardId")?.value;
    const code = String(document.getElementById("giftPayCode")?.value || "")
      .trim()
      .toUpperCase();
    const amount = parseFloat(document.getElementById("giftPayAmount")?.value || "0");
    if (!cardId || !amount) return null;
    await redeemGiftCard(db, {
      cardId,
      amount,
      bookingId: bookingId || null,
      note: "Оплата записи (заметка gift_note)",
      createdBy: "crm",
      useLocal: getUseLocal(),
      cardsRef: () => loadLocalCards(),
      setCards: (next) => saveLocalCards(next),
    });
    return { cardId, publicCode: code, amount };
  };
}

export async function createGiftCard(db, input) {
  const publicCode = input.publicCode || randomCode();
  const faceValue = Number(input.faceValue);
  const status = input.status || "issued";
  const recipientName = normalizeRecipient(input.recipientName) || "НЕ УКАЗАНО";
  const payload = {
    type: input.type || "gift",
    publicCode,
    status,
    faceValue,
    balance: faceValue,
    currency: "RUB",
    buyerPhone: input.buyerPhone,
    buyerPhoneDigits: digitsPhone(input.buyerPhone),
    recipientName,
    theme: input.theme || "amethyst",
    source: input.source || "website-redesign",
    createdAt: input.useLocal ? nowIso() : serverTimestamp(),
    issuedAt:
      status === "issued"
        ? input.useLocal
          ? nowIso()
          : serverTimestamp()
        : null,
    paidAt: status === "issued" ? (input.useLocal ? nowIso() : serverTimestamp()) : null,
    createdBy: input.createdBy || "site",
    linkedClientId: input.linkedClientId || null,
  };

  if (input.useLocal || !db) {
    const cards = loadLocalCards();
    const id = "local-" + Date.now();
    const issuedNow = status === "issued" ? nowIso() : null;
    const card = {
      id,
      ...payload,
      createdAt: nowIso(),
      issuedAt: issuedNow,
      paidAt: issuedNow,
      _local: true,
    };
    cards.unshift(card);
    saveLocalCards(cards);
    // Ledger credit only when card is actually issued (paid) — not on pending заявке
    if (status === "issued") {
      const ledger = loadLocalLedger();
      ledger.unshift({
        id: "local-l-" + Date.now(),
        cardId: id,
        publicCode,
        kind: "credit",
        amount: faceValue,
        note: "Выпуск карты",
        bookingId: null,
        createdBy: payload.createdBy,
        createdAt: nowIso(),
      });
      saveLocalLedger(ledger);
    }
    return card;
  }

  // Ensure unique code (best-effort)
  const existing = await getDocs(
    query(collection(db, "giftCards"), where("publicCode", "==", publicCode), limit(1))
  );
  if (!existing.empty) {
    return createGiftCard(db, { ...input, publicCode: randomCode() });
  }

  const ref = await addDoc(collection(db, "giftCards"), payload);
  if (status === "issued") {
    await addDoc(collection(db, "giftLedger"), {
      cardId: ref.id,
      publicCode,
      kind: "credit",
      amount: faceValue,
      note: "Выпуск карты",
      bookingId: null,
      createdBy: payload.createdBy,
      createdAt: serverTimestamp(),
    });
  }
  return { id: ref.id, ...payload, publicCode };
}

export async function findGiftCardByCode(db, code, useLocal) {
  const publicCode = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!publicCode) return null;
  if (useLocal || !db) {
    return loadLocalCards().find((c) => c.publicCode === publicCode) || null;
  }
  const snap = await getDocs(
    query(collection(db, "giftCards"), where("publicCode", "==", publicCode), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function getGiftCardLedger(db, cardId, useLocal) {
  if (useLocal || !db) {
    return loadLocalLedger().filter((e) => e.cardId === cardId);
  }
  const snap = await getDocs(
    query(collection(db, "giftLedger"), where("cardId", "==", cardId), limit(100))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function confirmGiftCardPaid(db, opts) {
  const { cardId, createdBy, useLocal, cardsRef, setCards } = opts;
  if (useLocal || !db) {
    const list = cardsRef ? cardsRef() : loadLocalCards();
    const idx = list.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Карта не найдена");
    if (list[idx].status !== "pending") throw new Error("Карта не в статусе «ожидает»");
    const next = [...list];
    next[idx] = {
      ...next[idx],
      status: "issued",
      paidAt: nowIso(),
      issuedAt: nowIso(),
      confirmedBy: createdBy || "crm",
    };
    if (setCards) setCards(next);
    else saveLocalCards(next);
    const ledger = loadLocalLedger();
    const hasCredit = ledger.some((e) => e.cardId === cardId && e.kind === "credit");
    if (!hasCredit) {
      ledger.unshift({
        id: "local-l-" + Date.now(),
        cardId,
        publicCode: next[idx].publicCode,
        kind: "credit",
        amount: Number(next[idx].faceValue) || 0,
        note: "Оплата подтверждена · выпуск карты",
        bookingId: null,
        createdBy: createdBy || "crm",
        createdAt: nowIso(),
      });
      saveLocalLedger(ledger);
    }
    return next[idx];
  }
  const ref = doc(db, "giftCards", cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Карта не найдена");
  const card = snap.data();
  if (card.status !== "pending") throw new Error("Карта не в статусе «ожидает»");
  await updateDoc(ref, {
    status: "issued",
    paidAt: serverTimestamp(),
    issuedAt: serverTimestamp(),
    confirmedBy: createdBy || "crm",
  });
  // Credit ledger on activate (pending site-заявки не пишут ledger при create)
  const existingLedger = await getDocs(
    query(collection(db, "giftLedger"), where("cardId", "==", cardId), where("kind", "==", "credit"), limit(1))
  );
  if (existingLedger.empty) {
    await addDoc(collection(db, "giftLedger"), {
      cardId,
      publicCode: card.publicCode,
      kind: "credit",
      amount: Number(card.faceValue) || 0,
      note: "Оплата подтверждена · выпуск карты",
      bookingId: null,
      createdBy: createdBy || "crm",
      createdAt: serverTimestamp(),
    });
  }
  return { id: cardId, ...card, status: "issued" };
}

export async function voidGiftCard(db, opts) {
  const { cardId, createdBy, useLocal, cardsRef, setCards } = opts;
  if (useLocal || !db) {
    const list = cardsRef ? cardsRef() : loadLocalCards();
    const idx = list.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Карта не найдена");
    const next = [...list];
    next[idx] = {
      ...next[idx],
      status: "void",
      voidedAt: nowIso(),
      voidedBy: createdBy || "crm",
    };
    if (setCards) setCards(next);
    else saveLocalCards(next);
    return next[idx];
  }
  const ref = doc(db, "giftCards", cardId);
  await updateDoc(ref, {
    status: "void",
    voidedAt: serverTimestamp(),
    voidedBy: createdBy || "crm",
  });
  const snap = await getDoc(ref);
  return { id: cardId, ...snap.data() };
}

export async function redeemGiftCard(db, opts) {
  const amount = Number(opts.amount);
  if (!amount || amount <= 0) throw new Error("Сумма должна быть > 0");

  if (opts.useLocal || !db) {
    const cards = opts.cardsRef ? opts.cardsRef() : loadLocalCards();
    const idx = cards.findIndex((c) => c.id === opts.cardId);
    if (idx < 0) throw new Error("Карта не найдена");
    const card = cards[idx];
    if (card.status === "void") throw new Error("Карта аннулирована");
    if (card.status === "pending" || card.status === "draft") {
      throw new Error("Сначала подтвердите оплату (кнопка «Оплачено / активировать»)");
    }
    if (amount > card.balance) throw new Error("Недостаточно баланса");
    const balance = card.balance - amount;
    card.balance = balance;
    card.status = deriveStatus(card.faceValue, balance, card.status);
    cards[idx] = card;
    if (opts.setCards) opts.setCards(cards);
    else saveLocalCards(cards);
    const ledger = loadLocalLedger();
    ledger.unshift({
      id: "local-l-" + Date.now(),
      cardId: card.id,
      publicCode: card.publicCode,
      kind: "debit",
      amount,
      note: opts.note || "Списание",
      bookingId: opts.bookingId || null,
      createdBy: opts.createdBy || "crm",
      createdAt: nowIso(),
    });
    saveLocalLedger(ledger);
    return card;
  }

  const ref = doc(db, "giftCards", opts.cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Карта не найдена");
  const card = snap.data();
  if (card.status === "void") throw new Error("Карта аннулирована");
  if (card.status === "pending" || card.status === "draft") {
    throw new Error("Сначала подтвердите оплату (кнопка «Оплачено / активировать»)");
  }
  if (amount > card.balance) throw new Error("Недостаточно баланса");
  const balance = Number(card.balance) - amount;
  const status = deriveStatus(card.faceValue, balance, card.status);
  const batch = writeBatch(db);
  batch.update(ref, { balance, status });
  const ledgerRef = doc(collection(db, "giftLedger"));
  batch.set(ledgerRef, {
    cardId: opts.cardId,
    publicCode: card.publicCode,
    kind: "debit",
    amount,
    note: opts.note || "Списание",
    bookingId: opts.bookingId || null,
    createdBy: opts.createdBy || "crm",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return { id: opts.cardId, ...card, balance, status };
}

function ensureGiftSectionDom() {
  let section = document.getElementById("giftCardsSection");
  if (section) return section;
  section = document.createElement("section");
  section.id = "giftCardsSection";
  section.className = "hidden max-w-7xl mx-auto my-8";
  section.innerHTML = defaultGiftSectionHtml();
  const clients = document.getElementById("clientsSection");
  if (clients) clients.parentNode.insertBefore(section, clients.nextSibling);
  else document.body.appendChild(section);
  return section;
}

export function defaultGiftSectionHtml() {
  return `
    <div class="bg-white rounded-3xl shadow-lg p-6 border border-gray-200">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 class="text-2xl font-semibold text-gray-900 tracking-tight flex items-center">
          <i class="fas fa-gift mr-3 text-blue-600"></i>Подарочные карты
        </h2>
        <p data-gift-backend-hint class="hidden text-xs px-3 py-1 rounded-full"></p>
      </div>
      <p class="text-sm text-gray-500 mb-6">Отдельный модуль баланса (gift / позже prepaid). Не влияет на расчёт зарплаты и выручки по услугам.</p>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div class="xl:col-span-2 space-y-4">
          <div class="flex flex-col md:flex-row gap-3">
            <input id="giftSearch" type="search" placeholder="Поиск: код, имя, телефон" class="flex-1 rounded-2xl border border-gray-300 px-4 py-2" />
            <select id="giftStatusFilter" class="rounded-2xl border border-gray-300 px-4 py-2">
              <option value="">Все статусы</option>
              <option value="issued">Выпущена</option>
              <option value="partial">Частично</option>
              <option value="pending">Ожидает</option>
              <option value="redeemed">Погашена</option>
              <option value="void">Аннулирована</option>
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b text-left text-gray-600">
                  <th class="py-2 px-3">Код</th>
                  <th class="py-2 px-3">Получатель</th>
                  <th class="py-2 px-3">Телефон</th>
                  <th class="py-2 px-3">Номинал</th>
                  <th class="py-2 px-3">Баланс</th>
                  <th class="py-2 px-3">Статус</th>
                  <th class="py-2 px-3">Создана</th>
                </tr>
              </thead>
              <tbody data-gift-list class="divide-y divide-gray-100"></tbody>
            </table>
            <div data-gift-empty class="hidden text-center py-10 text-gray-400">Карт пока нет</div>
          </div>
        </div>
        <div class="space-y-4">
          <form id="giftIssueForm" class="rounded-2xl border border-gray-200 p-4 space-y-3">
            <h3 class="font-semibold text-gray-900">Выпустить карту</h3>
            <input name="recipientName" required placeholder="Имя Отчество Фамилия" class="w-full rounded-2xl border border-gray-300 px-4 py-2" />
            <input name="buyerPhone" required type="tel" placeholder="+7 (XXX) XXX-XX-XX" class="w-full rounded-2xl border border-gray-300 px-4 py-2" />
            <input name="faceValue" required type="number" min="1000" step="1000" placeholder="Номинал ₽" class="w-full rounded-2xl border border-gray-300 px-4 py-2" />
            <select name="theme" class="w-full rounded-2xl border border-gray-300 px-4 py-2">
              <option value="amethyst">Amethyst</option>
              <option value="silver">Silver</option>
            </select>
            <button type="submit" class="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5">Выпустить</button>
          </form>
          <div data-gift-detail class="rounded-2xl border border-gray-200 p-4 min-h-[200px]">
            <p class="text-gray-400 text-center py-8">Выберите карту из списка</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function formatDate(v) {
  if (!v) return "—";
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// Re-export helpers for public page
export { STATUS_LABELS, formatRub, statusBadgeClass, seedLocalDemoIfEmpty, loadLocalCards, loadLocalLedger };
