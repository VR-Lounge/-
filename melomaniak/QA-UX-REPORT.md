# MELOMANIAK — QA / UX отчёт

Дата: 2026-11-13 · ветка `cursor/melomaniak-redesign-elite-7a29` · превью `http://127.0.0.1:8080`

## Что проверено

Playwright-аудит `qa/playwright-ux-audit.mjs` (desktop 1440, tablet 768, iPhone 13) + ручной просмотр скринов.

| Зона | Результат |
|------|-----------|
| Hero / бренд / нав | OK |
| Каталог 1887 SKU, фильтры, сортировка, «Показать ещё» | OK |
| Поиск (в т.ч. после «Избранное») | OK после фикса |
| Избранное + toast + scroll-lock модалок | OK |
| Journey: услуги / оплата / доставка / установка | OK |
| Бриф (quiz) | OK |
| PDP `#product/...`, описание, характеристики, галерея | OK |
| **Cyrillic Woo-slugs** (encoded / decoded / id) | OK после фикса |
| **Якорь «Характеристики»** остаётся на PDP | OK после фикса |
| Комплексные решения — on-theme HT/projector images | OK |
| PhotoSwipe: open / zoom / next / prev / close (desktop + mobile) | OK |
| Overflow / console / page errors | 0 fail |
| Mobile меню ~390px | OK |

Скриншоты: `qa/ux-desktop-*.png`, `qa/ux-mobile-*.png`, `qa/ux-tablet-*.png`, `qa/verify-pswp.png`.

## Что починено

1. **`[hidden]` не скрывал блоки** — авторский `display:grid` у `.hero` перебивал UA-правило; на PDP/journey торчал hero. Фикс: `[hidden]{display:none!important}`.
2. **Поиск зависел от фильтра «Избранное»** — модалка искала только текущую выборку → 0 хитов по «Advance». Теперь поиск по всему каталогу, независимо от chips/`onlyFav`.
3. **Карточки с remote-thumb** — primary теперь локальный `thumb` / `thumbLocal`, CDN — fallback (`data-fallback`).
4. **Избранное с PDP/journey** — возврат на `#collection` с активным фильтром избранного.
5. **PhotoSwipe chrome** — после CDN: тонкие gold-кнопки close/zoom/arrows, counter Outfit uppercase, фон `#050505`, `bgOpacity:1`.
6. **UX polish** — line-clamp названий/описаний, hit-target fav 44px, sticky close в модалках, scrollable search results, toast z-index, prose overflow-wrap.
7. **PDP «Позиция не найдена» на кириллических slug** — в каталоге ~817 SKU хранят slug уже percent-encoded (`%d1%81…`), а роутер делал `decodeURIComponent` и сравнивал с Cyrillic → miss. Фикс: `decodeSlug` / `encodeSlug` / `slugMatches` + lookup по id; карточки пишут `productHash()` (decoded, без double-encode). Регрессии: Marantz PM7000N, Audio Research DS450, 10 sample + 14×3 spot-check.
8. **«Характеристики» → `#pdp-specs` уводил с PDP** — hashchange роутер воспринимал `#pdp-specs` как home-scroll и прятал PDP. Фикс: `data-pdp-anchor` + preventDefault/scrollIntoView; safety-net в `showPage` для in-page PDP якорей.
9. **Комплексные решения — off-topic фото** — заменены на `assets/services/svc-ht-tv.jpg` (Pexels TV+Hi-Fi), `svc-projector-120.jpg` (from-live private cinema), `svc-projector-150.jpg` (Pexels large HT). Attribution: `assets/services/ATTRIBUTION.md`.

Аудит после фиксов: **61 PASS / 0 FAIL / 0 WARN**, console errors: 0.

## PhotoSwipe — статус стиля

Готово под black-gold:

- иконки `--pswp-icon-color: #f0d78c`
- кнопки 44–52px, тонкая золотая обводка, тёмный полупрозрачный фон, без «жирного» дефолта библиотеки
- counter: 11px, letter-spacing, uppercase gold
- стрелки с отступами; на mobile компактнее

Стили в `#pswp-melomaniak` **после** `photoswipe.css` (CDN иначе сбрасывает переменные).

## Как открыть

```bash
cd melomaniak && python3 -m http.server 8080 --bind 127.0.0.1
# → http://127.0.0.1:8080/
# PDP: http://127.0.0.1:8080/#product/advance-acoustic-x-a220-x-p700
# Cyrillic (encoded): …/#product/%d1%81%d1%82%d1%80%d0%b8%d0%bc%d0%b8%d0%bd%d0%b3%d0%be%d0%b2%d1%8b%d0%b9-…
# Cyrillic (id):     …/#product/262399
# Галерея: клик по главному кадру PDP
```

QA: `node qa/playwright-ux-audit.mjs`

## HITL (осталось человеку)

- Сверка DX1+PX1 vs BX1 на фото (флаг в каталоге).
- Часы салона 10:00–20:00 vs «до 22:00» на «О нас» оригинала.
- Цены / наличие / условия — демо без оплаты; подтверждение перед публикацией.
- Часть SKU без HTML-описания или specs — показан HITL-флаг, без выдуманных характеристик.
- Полный краул `assets/from-live/` (~GB) не отдаётся целиком в UI — только display/thumbs + точечный fallback.
- Реальная CRM / оплата / отправка брифа — вне scope static shop.
- Подтвердить финальный выбор фото «Комплексные решения» (Pexels + from-live) vs собственные салонные кадры HT/проектор.
- Опционально: нормализовать slug в `catalog-data.js` до decoded Cyrillic при следующем импорте Woo (сейчас роутер терпит оба формата).
