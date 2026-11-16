# SEO / AEO / GEO audit — melomaniak.рф

**Дата проверки:** 2026-11-13  
**Источник:** live HTML + `robots.txt` + `wp-json` (curl / Exa fetch). Firecrawl MCP был недоступен (needsAuth).

## Покрытие
- Главная `https://xn--80aannlcfckh.xn--p1ai/`
- Карточка `…/product/advance-acoustic-x-a220-x-p700/`
- `robots.txt`, `wp-sitemap.xml`, `wp-json/`

## CMS (факт)
- WordPress **6.4.14** + WooCommerce **8.4.3**
- Темы: `NEW2021`, `NEW1`
- Плагины (фрагмент): YITH Wishlist / Ajax Navigation, Contact Form 7, Jetpack, MonsterInsights (не настроен), Joinchat, Ditty ticker, Slider WD, Product Brands

## Подтверждённые дефекты (высокий приоритет)

| # | Находка | Evidence | Impact | Fix | Verify |
|---|---------|----------|--------|-----|--------|
| 1 | Нет meta description на главной | 0 совпадений `name="description"` в HTML | Слабый snippet в SERP | Yoast/Rank Math или theme `wp_head` description | View-source после деплоя |
| 2 | Нет Open Graph | 0 `og:*` meta | Плохие превью в соцсетях/мессенджерах | OG title/desc/image | Facebook Sharing Debugger / Telegram |
| 3 | Нет JSON-LD на главной | 0 `application/ld+json` | Слабее rich results / AEO | Organization/MusicStore + FAQ + Product только с актуальными Offer | Rich Results Test |
| 4 | Нет H1 на главной | 0 `<h1>` | Слабая иерархия | Один H1 с брендом/оффером | axe / outline |
| 5 | `wp-sitemap.xml` отдаёт HTML 404 «Страница не найдена» | HTTP 404 + title «Страница не найдена» | Ломается discovery | Починить WP sitemaps / permalinks; проверить `wp-sitemap-posts-product-*.xml` | `curl -I` → 200 XML |
| 6 | Дубль `<title>` (основной + Joinchat) | 2 `<title>` в документе | Шум для парсеров | Убрать title из виджета Joinchat | View-source |
| 7 | Много img без alt (~25 из 31 heuristic) | regex по img | A11y + image SEO | Alt с моделью/брендом | Lighthouse a11y |
| 8 | MonsterInsights без GA | Комментарий «No tracking code set» | Нет измерения | Настроить GA4 / согласие | Tag Assistant |
| 9 | Опечатка в title: «Hi-end апаратура» | `<title>…апаратура…` | Доверие / brand SERP | Исправить на «аппаратура» | SERP preview |

## Возможности (не дефекты)
- Canonical на главной есть — сохранить при миграции.
- `robots.txt` разрешает сайт, sitemap объявлен — после починки XML усилит crawl.
- Woo Store API жив (`/wp-json/wc/store/v1/products`) — можно кормить headless/прототип без выдуманных цен.
- GEO: адрес/телефон/часы на сайте есть; усилить LocalBusiness schema + Яндекс.Справочник (HITL).

## Не измерено
Трафик, позиции, CWV, индекс Google/Yandex — scrape не даёт этих данных.

## Что вшито в прототип SIDE A
- `noindex,nofollow` (staging)
- Title + description + OG basics
- MusicStore + FAQPage JSON-LD (без демо-Offer)
- H1, FAQ-блок (AEO), geo meta Москва
- Lazy images, осмысленные alt на товарах
- Семантика section/nav/dialog, reduced-motion
