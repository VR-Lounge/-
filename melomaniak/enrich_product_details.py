#!/usr/bin/env python3
"""Fetch full Woo Store API product payloads → local PDP JSON + enriched catalog.

Source: https://xn--80aannlcfckh.xn--p1ai/wp-json/wc/store/v1/products
No invented specs — attributes + tables/lists parsed from original description HTML only.
"""
from __future__ import annotations

import html as html_lib
import json
import re
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, quote, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
BASE = "https://xn--80aannlcfckh.xn--p1ai"
API = f"{BASE}/wp-json/wc/store/v1/products"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-pdp-enrich/1.0)"
PDP_DIR = ROOT / "data" / "pdp"
OUT_CATALOG_JS = ROOT / "catalog-data.js"
OUT_CATALOG_JSON = ROOT / "data" / "catalog-full.json"
OUT_META = ROOT / "data" / "pdp-enrich-meta.json"

CAT_MAP = {
    "акустик": "Акустика",
    "сабвуфер": "Акустика",
    "усилител": "Усилители",
    "фонокорр": "Усилители",
    "ресивер": "Ресиверы",
    "av процессор": "Ресиверы",
    "процессор": "Ресиверы",
    "наушник": "Наушники",
    "кабел": "Кабели",
    "межблок": "Кабели",
    "цап": "ЦАПы",
    "dac": "ЦАПы",
    "источник": "Источники",
    "проигрывател": "Источники",
    "транспорт": "Источники",
    "плеер": "Источники",
    "тюнер": "Источники",
    "видео": "Видео",
    "проектор": "Видео",
    "специальн": "Спецпредложения",
    "sale": "Спецпредложения",
}


def encode_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(unquote(parts.path), safe="/':@!$&()*+,;=")
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))


def fetch_json(url: str, retries: int = 4):
    last = None
    for i in range(retries):
        try:
            req = Request(
                encode_url(url),
                headers={"User-Agent": UA, "Accept": "application/json", "Referer": BASE + "/"},
            )
            with urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8", "replace")
                headers = {k.lower(): v for k, v in r.headers.items()}
                return json.loads(raw), headers
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"fetch failed {url}: {last}")


def strip_tags(s: str) -> str:
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", s or "")
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</p>", "\n\n", s)
    s = re.sub(r"(?is)</(div|h[1-6]|li|tr)>", "\n", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def first_paragraph(text: str, limit: int = 280) -> str:
    if not text:
        return ""
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunk = parts[0] if parts else text
    chunk = re.sub(r"\s+", " ", chunk).strip()
    if len(chunk) <= limit:
        return chunk
    cut = chunk[: limit - 1].rsplit(" ", 1)[0]
    return cut + "…"


def map_category(cats: list) -> str:
    names = [c.get("name") or "" for c in (cats or [])]
    blob = " ".join(names).lower()
    for needle, label in CAT_MAP.items():
        if needle in blob:
            return label
    if names:
        return "Другое"
    return "Другое"


def note_for(name: str, cat: str) -> str:
    n = re.sub(r"\s+", " ", name or "").strip()
    hints = {
        "Акустика": "акустика для комнаты и тракта — слушаем систему, не ценник.",
        "Усилители": "усиление: характер тракта важнее ваттов на бумаге.",
        "Ресиверы": "центр домашнего кино и многоканального звука.",
        "Наушники": "личная сцена — подбор под жанры и источник.",
        "Кабели": "связующее тракта; подбор после понимания системы.",
        "ЦАПы": "цифро-аналоговое звено тракта.",
        "Источники": "источник сигнала в тракте.",
        "Видео": "видео-звено домашнего кино.",
        "Спецпредложения": "позиция из спецпредложений живого каталога.",
    }
    return f"{n} — {hints.get(cat, 'компонент Hi-Fi / High End из живого каталога.')}"


def attrs_to_specs(attrs: list) -> list[dict]:
    out = []
    for a in attrs or []:
        name = (a.get("name") or "").strip()
        terms = a.get("terms") or []
        vals = []
        for t in terms:
            if isinstance(t, dict):
                vals.append((t.get("name") or t.get("slug") or "").strip())
            else:
                vals.append(str(t).strip())
        vals = [v for v in vals if v]
        if name and vals:
            out.append({"label": name, "value": ", ".join(vals), "source": "attribute"})
    return out


def parse_tables(desc_html: str) -> list[dict]:
    out = []
    for table in re.findall(r"(?is)<table[^>]*>(.*?)</table>", desc_html or ""):
        rows = re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", table)
        for row in rows:
            cells = re.findall(r"(?is)<t[hd][^>]*>(.*?)</t[hd]>", row)
            cells = [strip_tags(c) for c in cells]
            cells = [c for c in cells if c]
            if len(cells) >= 2:
                label, value = cells[0], cells[1]
                if label.lower() in ("название", "name", ""):
                    # keep product name rows — still sourced
                    pass
                if len(label) < 80 and value and label.lower() != value.lower():
                    out.append({"label": label, "value": value, "source": "table"})
    return out


def parse_spec_lists(desc_html: str) -> list[dict]:
    """Pull label:value pairs from list items in original description HTML."""
    out = []
    if not desc_html:
        return out

    def from_li(text: str, source: str) -> dict | None:
        if not text or len(text) > 240:
            return None
        m = re.match(r"^(.{2,80}?)\s*[:–—-]\s*(.+)$", text)
        if not m:
            return None
        label, value = m.group(1).strip(), m.group(2).strip()
        if len(value) < 1 or label.lower() == value.lower():
            return None
        return {"label": label, "value": value, "source": source}

    # Prefer blocks under characteristic headings
    parts = re.split(r"(?is)(<h[1-6][^>]*>.*?</h[1-6]>)", desc_html)
    capture = False
    for part in parts:
        if re.match(r"(?is)<h[1-6]", part or ""):
            title = strip_tags(part).lower()
            capture = any(
                k in title
                for k in (
                    "характеристик",
                    "техническ",
                    "спецификац",
                    "параметр",
                    "основные",
                )
            )
            continue
        if not capture:
            continue
        for li in re.findall(r"(?is)<li[^>]*>(.*?)</li>", part):
            item = from_li(strip_tags(li), "list")
            if item:
                out.append(item)

    # Also accept clear label:value list items anywhere (still sourced, not invented)
    if len(out) < 3:
        for li in re.findall(r"(?is)<li[^>]*>(.*?)</li>", desc_html):
            item = from_li(strip_tags(li), "list")
            if item:
                out.append(item)
    return out


def dedupe_specs(specs: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for s in specs:
        key = (s["label"].strip().lower(), s["value"].strip().lower())
        if key in seen or not s["label"] or not s["value"]:
            continue
        seen.add(key)
        out.append(s)
    return out


def full_image_url(src: str) -> str:
    """Prefer original upload URL over -600x600 derivatives when obvious."""
    if not src:
        return src
    return re.sub(r"-(\d+)x(\d+)(\.(?:jpe?g|png|webp|gif))$", r"\3", src, flags=re.I)


def build_gallery(images: list, url_to_local: dict) -> list[dict]:
    out = []
    seen = set()
    for img in images or []:
        src = full_image_url(img.get("src") or "")
        thumb = img.get("thumbnail") or src
        if not src or src in seen:
            continue
        seen.add(src)
        local = url_to_local.get(src) or url_to_local.get(img.get("src") or "")
        # also try thumb full
        if not local:
            local = url_to_local.get(full_image_url(thumb)) or url_to_local.get(thumb)
        item = {
            "src": src,
            "thumb": thumb,
            "alt": (img.get("alt") or img.get("name") or "").strip(),
        }
        if local:
            item["local"] = local
        out.append(item)
    return out


def load_url_local_map() -> dict:
    path = ROOT / "assets-live-manifest.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    m = {}
    for img in data.get("images") or []:
        url = img.get("url")
        local = img.get("localPath")
        if url and local:
            m[url] = local
            m[full_image_url(url)] = local
    return m


def price_of(p: dict):
    prices = p.get("prices") or {}
    minor = int(prices.get("currency_minor_unit") or 0)

    def num(v):
        if v is None or v == "":
            return None
        try:
            n = int(str(v))
        except ValueError:
            return None
        if minor:
            n = n // (10**minor)
        return n

    price = num(prices.get("price") or prices.get("sale_price"))
    regular = num(prices.get("regular_price"))
    old = regular if regular and price and regular > price else None
    return price, old


def sanitize_description_html(html: str) -> str:
    """Keep structure; drop scripts/styles/forms; neutralize inline handlers."""
    if not html:
        return ""
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", "", html)
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", "", s)
    s = re.sub(r"(?is)<form[^>]*>.*?</form>", "", s)
    s = re.sub(r"(?is)\son\w+\s*=\s*([\"']).*?\1", "", s)
    s = re.sub(r"(?is)\son\w+\s*=\s*[^\s>]+", "", s)
    # remove Woo add-to-cart fragments if any
    s = re.sub(r"(?is)<div[^>]*class=\"[^\"]*cart[^\"]*\"[^>]*>.*?</div>", "", s)
    return s.strip()


def enrich_product(raw: dict, url_to_local: dict, existing_thumb: str | None) -> tuple[dict, dict]:
    price, old = price_of(raw)
    cat = map_category(raw.get("categories") or [])
    cats = [c.get("name") for c in (raw.get("categories") or []) if c.get("name")]
    desc_html = sanitize_description_html(raw.get("description") or "")
    short_html = sanitize_description_html(raw.get("short_description") or "")
    text = strip_tags(desc_html)
    short_text = strip_tags(short_html)
    specs = dedupe_specs(
        attrs_to_specs(raw.get("attributes") or [])
        + parse_tables(desc_html)
        + parse_spec_lists(desc_html)
    )
    gallery = build_gallery(raw.get("images") or [], url_to_local)
    # listing gallery: prefer CDN thumbs (light), keep local thumb if curated
    gallery_listing = [g.get("thumb") or g["src"] for g in gallery][:8]
    thumb_local = gallery[0].get("local") if gallery else None
    if existing_thumb and str(existing_thumb).startswith("assets/display/"):
        thumb = existing_thumb
    else:
        # Keep listing light: CDN/API thumb first; local from-live only as fallback path
        thumb = None
        if gallery:
            thumb = gallery[0].get("thumb") or gallery[0]["src"]
        if existing_thumb and str(existing_thumb).startswith("http"):
            thumb = existing_thumb
        elif existing_thumb and str(existing_thumb).startswith("assets/display/"):
            thumb = existing_thumb

    # HITL flag preserved externally
    detail = {
        "id": raw["id"],
        "slug": raw.get("slug") or str(raw["id"]),
        "name": raw.get("name") or "",
        "cat": cat,
        "cats": cats,
        "price": price,
        "old": old,
        "source": raw.get("permalink")
        or f"{BASE}/product/{raw.get('slug') or raw['id']}/",
        "descriptionHtml": desc_html,
        "shortHtml": short_html,
        "descriptionText": text,
        "specs": specs,
        "gallery": gallery,
        "sku": raw.get("sku") or "",
        "fetchedFrom": "wc/store/v1/products",
    }

    listing = {
        "id": raw["id"],
        "name": raw.get("name") or "",
        "slug": raw.get("slug") or str(raw["id"]),
        "cat": cat,
        "cats": cats,
        "price": price,
        "old": old,
        "source": detail["source"],
        "note": note_for(raw.get("name") or "", cat),
        "facts": first_paragraph(short_text or text, 220),
        "thumb": thumb,
        "thumbLocal": thumb_local,
        "gallery": gallery_listing,
        "hasDesc": bool(desc_html.strip()),
        "hasSpecs": bool(specs),
        "descLen": len(desc_html),
        "specCount": len(specs),
        "hitl": False,
    }
    return listing, detail


def main():
    PDP_DIR.mkdir(parents=True, exist_ok=True)
    url_to_local = load_url_local_map()
    print(f"local url map: {len(url_to_local)}")

    # preserve curated thumbs / hitl from existing catalog
    existing = {}
    for path in (OUT_CATALOG_JSON, ROOT / "catalog-data.js"):
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".js":
            text = text.split("=", 1)[1]
            if text.endswith(";"):
                text = text[:-1]
        try:
            data = json.loads(text)
            for p in data.get("products") or []:
                existing[p["id"]] = p
            print(f"loaded existing thumbs from {path.name}: {len(existing)}")
            break
        except Exception as e:
            print("skip existing", path, e)

    products_raw = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        url = f"{API}?per_page=100&page={page}&orderby=id&order=asc"
        batch, headers = fetch_json(url)
        total_pages = int(headers.get("x-wp-totalpages") or total_pages)
        total = int(headers.get("x-wp-total") or 0)
        print(f"page {page}/{total_pages} (+{len(batch)}) total={total}")
        products_raw.extend(batch)
        page += 1
        time.sleep(0.15)

    listings = []
    categories: dict[str, int] = {}
    with_desc = 0
    with_specs = 0
    empty_desc = []
    empty_specs = []

    for raw in products_raw:
        prev = existing.get(raw["id"]) or {}
        listing, detail = enrich_product(raw, url_to_local, prev.get("thumb"))
        listing["hitl"] = bool(prev.get("hitl"))
        # write detail file
        (PDP_DIR / f"{raw['id']}.json").write_text(
            json.dumps(detail, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        listings.append(listing)
        categories[listing["cat"]] = categories.get(listing["cat"], 0) + 1
        if listing["hasDesc"]:
            with_desc += 1
        else:
            empty_desc.append(listing["id"])
        if listing["hasSpecs"]:
            with_specs += 1
        else:
            empty_specs.append(listing["id"])

    catalog = {
        "source": "WooCommerce Store API wc/store/v1/products + local data/pdp/{id}.json",
        "count": len(listings),
        "categories": categories,
        "products": listings,
        "pdp": {"pathTemplate": "data/pdp/{id}.json", "withDesc": with_desc, "withSpecs": with_specs},
    }

    OUT_CATALOG_JSON.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_CATALOG_JS.write_text(
        "window.MELO_CATALOG=" + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    meta = {
        "count": len(listings),
        "withDesc": with_desc,
        "withSpecs": with_specs,
        "emptyDescCount": len(empty_desc),
        "emptySpecsCount": len(empty_specs),
        "emptyDescSample": empty_desc[:30],
        "emptySpecsSample": empty_specs[:30],
        "pdpDir": "data/pdp",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print("wrote", OUT_CATALOG_JS, OUT_CATALOG_JSON, PDP_DIR)


if __name__ == "__main__":
    main()
