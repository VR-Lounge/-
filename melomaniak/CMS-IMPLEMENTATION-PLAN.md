# План внедрения CMS — MELOMANIAK

## Текущая CMS (подтверждено)
**WordPress 6.4.14 + WooCommerce 8.4.3** на nginx.  
REST: `wp/v2`, `wc/v3`, `wc/store`. Темы `NEW2021`/`NEW1`. Wishlist (YITH), фильтры, CF7, Jetpack, Joinchat.

## Рекомендация (вариант A — по умолчанию)
Оставить WP+Woo как торговый и контентный движок. Сделать кастомную тему (или дочернюю к NEW2021), перенеся визуальный язык SIDE A.

### Почему не сразу Next.js
- Каталог, цены, заказы, медиа уже в Woo.
- Миграция URL/SEO рискованна при живом sitemap/permalinks.
- Вариант B (headless) — только после подтверждения бюджета поддержки и API-доступов.

## Шаги миграции (HITL)
1. **Доступы:** WP admin, FTP/SSH, бэкап БД+uploads, staging-поддомен с `noindex`.
2. **Экспорт SEO:** все URL товаров/категорий/постов, meta, редирект-таблица old→new.
3. **Тема:** токены CSS (`--bg/--acid/--paper`), компоненты Header, Hero, EntryPaths, ProductGrid, ProductCard, BriefWizard, Editorial, Contacts.
4. **Шаблоны Woo:** `archive-product`, `single-product`, `taxonomy-product_cat` — индексируемые URL, фильтры в query string.
5. **Медиа:** AVIF/WebP, srcset, проверка photo↔SKU (как в assets-provenance.json).
6. **Контент:** согласовать редактуру SIDE A; акцию Di’Anno — управляемый блок с датами.
7. **Формы:** серверная валидация CF7/custom → CRM; без фейковых toast-успехов.
8. **Schema:** Organization/LocalBusiness; Product/Offer только с актуальными ценой и наличием.
9. **Аналитика:** починить GA4; события brief_*, product_view, contact_click.
10. **Cutover:** 301 по таблице, мониторинг 404, откат на предыдущую тему.

## Вариант B (если подтвердят)
Next.js + TypeScript, Woo Store API / WPGraphQL как backend, CMS для журнала. Отдельный бюджет на хостинг, превью и поддержку синхронизации стока.
