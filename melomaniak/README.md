# MELOMANIAK / SIDE A — BLACK & GOLD

Интерактивный дизайн-концепт музыкального салона. **Не** действующий интернет-магазин.

Визуал **чёрное + золото** (элитная ось для рокеров/меломанов): Cormorant Garamond + Bebas Neue + Manrope. Full-bleed hero с портретом с родного сайта, atmosphere strips, editorial lookbook-каталог.

## Live asset crawl (from-live)

Источник: родной сайт [MELOMANIAK](https://xn--80aannlcfckh.xn--p1ai/).

- Манифест: `assets-live-manifest.json`
- URL-чекпоинт: `assets-live-urls.json`
- Скачанные файлы: `assets/from-live/{hero,products,editorial,brand,misc}/`
- Уже импортированные ассеты в `assets/` сохранены (`existingAssets` в манифесте)
- Краулер: `python3 crawl_live_assets.py` (`collect` | `download` | `all`)

**Сводка краула:** страниц обнаружено 2655, HTML-скрап 302, уникальных картинок скачано 9139 (URL найдено 10436). Топ hero — поле `topHeroCandidates`.

Картинки дедуплицированы по SHA-256; `suggestedUse` — подсказка для элитного редизайна (чёрное+золото).


## Локальный просмотр

```bash
cd melomaniak
python3 -m http.server 8080 --bind 127.0.0.1
```

Откройте http://127.0.0.1:8080/

npm не нужен. Работают фильтры, сортировка, поиск, избранное, модалки, бриф (скачивание TXT). Заявки не отправляются, оплаты нет.

## Ассеты

Оригинальные фото и логотип импортированы с https://xn--80aannlcfckh.xn--p1ai/

```bash
python3 import_assets.py   # при необходимости перекачать
```

Проверка соответствия: `assets-provenance.json`. Манифест: `assets-manifest.js`.

## Документы

- `CURSOR_BRIEF.md` — концепция и ограничения
- `SEO-AUDIT.md` — аудит живого сайта + что вшито в прототип
- `CMS-IMPLEMENTATION-PLAN.md` — WP+Woo план внедрения

## Ограничения

Не выдумывать наличие, отзывы, гарантии, доставку. Не публиковать и не подключать оплату без HITL.
