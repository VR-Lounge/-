#!/usr/bin/env python3
"""Crawl MELOMANIAK live site and download unique images for elite redesign."""
from __future__ import annotations

import hashlib
import json
import re
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse, urlunparse, unquote, quote
from urllib.request import Request, urlopen

BASE = "https://xn--80aannlcfckh.xn--p1ai/"
HOST = "xn--80aannlcfckh.xn--p1ai"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "from-live"
CHECKPOINT = ROOT / "assets-live-urls.json"
MANIFEST = ROOT / "assets-live-manifest.json"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-redesign-asset-crawler/1.0)"
IMG_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp"}
SKIP_PARTS = (
    "wp-includes/images/smilies",
    "wp-emoji",
    "gravatar.com",
    "fonts.gstatic",
    "pixel.",
    "analytics",
    "facebook.com",
    "doubleclick",
)
SIZE_SUFFIX = re.compile(r"-(\d+)x(\d+)(?=\.(?:jpe?g|png|gif|webp|avif)$)", re.I)
SRCSET_SPLIT = re.compile(r",\s*(?![^(]*\))")
BG_URL = re.compile(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", re.I)


def encode_url(url: str) -> str:
    """Percent-encode non-ASCII path segments for urllib."""
    parts = urlparse(url)
    path = quote(unquote(parts.path), safe="/:@!$&'()*+,;=-._~")
    return urlunparse((parts.scheme, parts.netloc, path, parts.params, parts.query, parts.fragment))


def fetch(url: str, timeout: int = 40, binary: bool = False):
    req = Request(encode_url(url), headers={"User-Agent": UA, "Referer": BASE, "Accept": "*/*"})
    with urlopen(req, timeout=timeout) as resp:
        data = resp.read()
        ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        final = resp.geturl()
    if binary:
        return data, ctype, final
    return data.decode("utf-8", errors="replace"), ctype, final


def fetch_json(url: str):
    text, _, _ = fetch(url)
    return json.loads(text)


def abs_url(url: str, base: str = BASE) -> str | None:
    if not url or url.startswith(("data:", "blob:")):
        return None
    url = url.strip().strip("\"'")
    if url.startswith("//"):
        url = "https:" + url
    full = urljoin(base, url)
    parsed = urlparse(full)
    if parsed.scheme not in ("http", "https"):
        return None
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, ""))


def should_skip(url: str) -> bool:
    low = url.lower()
    return any(p in low for p in SKIP_PARTS)


def strip_size_suffix(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, SIZE_SUFFIX.sub("", parsed.path), "", "", ""))


def parse_srcset(srcset: str, base: str) -> list[tuple[str, int]]:
    out = []
    if not srcset:
        return out
    for part in SRCSET_SPLIT.split(srcset):
        part = part.strip()
        if not part:
            continue
        bits = part.rsplit(" ", 1)
        u = bits[0]
        w = 0
        if len(bits) == 2 and bits[1].endswith("w"):
            try:
                w = int(bits[1][:-1])
            except ValueError:
                w = 0
        absu = abs_url(u, base)
        if absu:
            out.append((absu, w))
    return out


def pick_largest(urls_with_w: list[tuple[str | None, int]]) -> str | None:
    clean = [(u, w) for u, w in urls_with_w if u]
    if not clean:
        return None
    return max(clean, key=lambda x: (x[1], len(x[0])))[0]


class PageExtractor(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__()
        self.page_url = page_url
        self.images: list[dict] = []
        self.links: set[str] = set()
        self.css_hrefs: set[str] = set()

    def _add(self, src: str, meta: dict | None = None):
        u = abs_url(src, self.page_url)
        if not u or should_skip(u):
            return
        item = {"url": u, "pageSource": self.page_url}
        if meta:
            item.update(meta)
        self.images.append(item)

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "a" and d.get("href"):
            u = abs_url(d["href"], self.page_url)
            if u and HOST in urlparse(u).netloc:
                self.links.add(u.split("#")[0])
        if tag == "link":
            rel = (d.get("rel") or "").lower()
            href = d.get("href") or ""
            if "stylesheet" in rel and href:
                cu = abs_url(href, self.page_url)
                if cu:
                    self.css_hrefs.add(cu)
            if any(x in rel for x in ("icon", "apple-touch-icon", "mask-icon")) and href:
                self._add(href, {"kind": "icon"})
        if tag == "meta":
            prop = (d.get("property") or d.get("name") or "").lower()
            if prop in ("og:image", "twitter:image", "twitter:image:src") and d.get("content"):
                self._add(d["content"], {"kind": "og"})
        if tag == "img":
            candidates = []
            for key in ("src", "data-src", "data-lazy-src", "data-original", "data-large_image", "data-full-url"):
                if d.get(key):
                    candidates.append((d[key], 0))
            for key in ("srcset", "data-srcset", "data-lazy-srcset"):
                candidates.extend(parse_srcset(d.get(key, ""), self.page_url))
            best = pick_largest([(abs_url(u, self.page_url), w) for u, w in candidates])
            if best:
                self._add(
                    best,
                    {
                        "kind": "img",
                        "alt": d.get("alt") or "",
                        "width": d.get("width") or d.get("data-large_image_width") or "",
                        "height": d.get("height") or d.get("data-large_image_height") or "",
                    },
                )
        style = d.get("style") or ""
        if "url(" in style.lower():
            for m in BG_URL.findall(style):
                self._add(m, {"kind": "background"})


def extract_html(html: str, page_url: str) -> PageExtractor:
    p = PageExtractor(page_url)
    try:
        p.feed(html)
    except Exception:
        pass
    for m in BG_URL.findall(html):
        if any(m.lower().endswith(ext) for ext in IMG_EXT) or "/uploads/" in m or "/imgi/" in m:
            u = abs_url(m, page_url)
            if u and not should_skip(u):
                p.images.append({"url": u, "pageSource": page_url, "kind": "css-bg", "alt": ""})
    return p


def extract_css_images(css: str, css_url: str) -> list[dict]:
    out = []
    for m in BG_URL.findall(css):
        if m.startswith("data:"):
            continue
        u = abs_url(m, css_url)
        if not u or should_skip(u):
            continue
        path = urlparse(u).path.lower()
        if any(path.endswith(ext) for ext in IMG_EXT) or "/uploads/" in path or "/imgi/" in path:
            out.append({"url": u, "pageSource": css_url, "kind": "css", "alt": ""})
    return out


def suggest_use(url: str, meta: dict) -> str:
    path = unquote(urlparse(url).path).lower()
    alt = (meta.get("alt") or "").lower()
    page = (meta.get("pageSource") or "").lower()
    kinds = (meta.get("kind") or "").lower()
    blob = f"{path} {alt} {page} {kinds}"
    if any(x in blob for x in ("logo", "favicon", "apple-touch", "imgi/logo", "/brand")):
        return "brand"
    if any(
        x in blob
        for x in (
            "hero",
            "banner",
            "slider",
            "slide",
            "dianno",
            "di-anno",
            "дианно",
            "vinyl",
            "divan",
            "kolonka",
            "atmosphere",
            "scene",
            "stage",
            "concert",
            "live",
            "rock",
            "guitar",
            "uploads/1.jpg",
        )
    ):
        return "hero"
    if "/product/" in page or "product-api" in kinds:
        return "product"
    if any(x in page for x in ("/20", "/blog", "/category/", "/tag/")) or "editorial" in blob:
        return "editorial"
    if any(x in path for x in ("/themes/", "/imgi/", "background", "bg-")):
        return "atmosphere"
    return "misc"


def folder_for(use: str) -> str:
    return {
        "hero": "hero",
        "product": "products",
        "editorial": "editorial",
        "brand": "brand",
        "atmosphere": "misc",
        "misc": "misc",
    }.get(use, "misc")


def safe_name(url: str, digest: str) -> str:
    path = unquote(urlparse(url).path)
    name = Path(path).name or "image"
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.U)
    if len(name) > 120:
        name = Path(name).stem[:80] + (Path(name).suffix or ".img")
    return f"{digest[:10]}_{name}"


def paginate_wp(endpoint: str, per_page: int = 100):
    page = 1
    while True:
        url = f"{BASE}wp-json/{endpoint}?per_page={per_page}&page={page}"
        req = Request(url, headers={"User-Agent": UA, "Referer": BASE})
        try:
            with urlopen(req, timeout=90) as resp:
                total_pages = int(resp.headers.get("X-WP-TotalPages") or "1")
                data = json.loads(resp.read().decode("utf-8", errors="replace"))
        except HTTPError as e:
            if e.code in (400, 404):
                break
            raise
        if not data:
            break
        yield data, page, total_pages
        if page >= total_pages:
            break
        page += 1
        time.sleep(0.05)


def add_image(reg: dict, url: str, meta: dict):
    url = abs_url(url)
    if not url or should_skip(url):
        return
    entry = reg["images"].setdefault(
        url,
        {
            "url": url,
            "canonicalUrl": strip_size_suffix(url),
            "pageSources": [],
            "alts": [],
            "kinds": [],
            "width": meta.get("width") or "",
            "height": meta.get("height") or "",
        },
    )
    ps = meta.get("pageSource") or ""
    if ps and ps not in entry["pageSources"]:
        entry["pageSources"].append(ps)
    alt = meta.get("alt") or ""
    if alt and alt not in entry["alts"]:
        entry["alts"].append(alt)
    kind = meta.get("kind") or ""
    if kind and kind not in entry["kinds"]:
        entry["kinds"].append(kind)
    if meta.get("width") and not entry["width"]:
        entry["width"] = meta["width"]
    if meta.get("height") and not entry["height"]:
        entry["height"] = meta["height"]


def prefer_fullsize(reg: dict):
    by_canon: dict[str, list[str]] = defaultdict(list)
    for url in list(reg["images"]):
        by_canon[strip_size_suffix(url)].append(url)
    drop = []
    for urls in by_canon.values():
        if len(urls) == 1:
            continue
        scored = []
        for u in urls:
            m = SIZE_SUFFIX.search(urlparse(u).path)
            area = int(m.group(1)) * int(m.group(2)) if m else 10_000_000
            scored.append((area, u))
        best = max(scored)[1]
        for u in urls:
            if u == best:
                continue
            for ps in reg["images"][u]["pageSources"]:
                if ps not in reg["images"][best]["pageSources"]:
                    reg["images"][best]["pageSources"].append(ps)
            drop.append(u)
    for u in drop:
        reg["images"].pop(u, None)


def collect_products(reg: dict):
    print("Collecting product images via WC Store API...", flush=True)
    for batch, page, total in paginate_wp("wc/store/products", per_page=100):
        for prod in batch:
            page_url = prod.get("permalink") or BASE
            reg["pages"].append(page_url)
            for img in prod.get("images") or []:
                candidates = []
                if img.get("src"):
                    candidates.append((img["src"], 0))
                candidates.extend(parse_srcset(img.get("srcset") or "", page_url))
                if img.get("thumbnail"):
                    candidates.append((img["thumbnail"], 1))
                best = pick_largest([(abs_url(u, page_url), w) for u, w in candidates])
                if best:
                    add_image(
                        reg,
                        best,
                        {
                            "pageSource": page_url,
                            "alt": prod.get("name") or "",
                            "kind": "product-api",
                        },
                    )
        print(f"  products {page}/{total} images={len(reg['images'])}", flush=True)


def collect_posts_pages(reg: dict):
    print("Collecting posts/pages content images...", flush=True)
    for endpoint, label in (("wp/v2/posts", "posts"), ("wp/v2/pages", "pages")):
        for batch, page, total in paginate_wp(endpoint, per_page=100):
            for item in batch:
                link = item.get("link")
                if link:
                    reg["pages"].append(link)
                    if label == "pages":
                        reg["to_scrape"].append(link)
                for field in ("content", "excerpt"):
                    html = (item.get(field) or {}).get("rendered") or ""
                    if not html:
                        continue
                    ex = extract_html(html, link or BASE)
                    for img in ex.images:
                        add_image(reg, img["url"], {**img, "pageSource": link or BASE})
                yoast = item.get("yoast_head_json") or {}
                for o in yoast.get("og_image") or []:
                    if isinstance(o, dict) and o.get("url"):
                        add_image(
                            reg,
                            o["url"],
                            {
                                "pageSource": link or BASE,
                                "kind": "og",
                                "width": o.get("width") or "",
                                "height": o.get("height") or "",
                            },
                        )
                fm = item.get("featured_media")
                if fm:
                    reg["featured_media_ids"].append(int(fm))
            print(f"  {label} {page}/{total} images={len(reg['images'])}", flush=True)


def resolve_featured(reg: dict):
    ids = sorted(set(reg["featured_media_ids"]))
    print(f"Resolving {len(ids)} featured_media...", flush=True)
    for i in range(0, len(ids), 100):
        chunk = ",".join(str(x) for x in ids[i : i + 100])
        url = f"{BASE}wp-json/wp/v2/media?per_page=100&include={chunk}"
        try:
            batch = fetch_json(url)
        except Exception as e:
            reg["errors"].append({"url": url, "error": str(e)})
            continue
        if not isinstance(batch, list):
            continue
        for item in batch:
            src = item.get("source_url")
            if src:
                add_image(
                    reg,
                    src,
                    {
                        "pageSource": f"{BASE}wp-json/wp/v2/media/{item.get('id')}",
                        "kind": "featured-media",
                        "alt": item.get("alt_text") or "",
                        "width": (item.get("media_details") or {}).get("width") or "",
                        "height": (item.get("media_details") or {}).get("height") or "",
                    },
                )


def collect_tax(reg: dict):
    print("Collecting taxonomies...", flush=True)
    for endpoint in ("wp/v2/product_cat", "wp/v2/categories", "wc/store/products/categories"):
        try:
            for batch, page, total in paginate_wp(endpoint, per_page=100):
                for item in batch:
                    link = item.get("link") or item.get("permalink")
                    if link:
                        reg["pages"].append(link)
                        reg["to_scrape"].append(link)
                    img = item.get("image")
                    if isinstance(img, dict) and img.get("src"):
                        add_image(
                            reg,
                            img["src"],
                            {"pageSource": link or BASE, "kind": "cat-image", "alt": item.get("name") or ""},
                        )
                print(f"  {endpoint} {page}/{total}", flush=True)
        except Exception as e:
            reg["errors"].append({"url": endpoint, "error": str(e)})


def scrape_page(reg: dict, url: str, also_css: bool = False):
    try:
        html, _, final = fetch(url, timeout=35)
    except Exception as e:
        reg["errors"].append({"url": url, "error": str(e)})
        return
    reg["scraped"].append(final)
    ex = extract_html(html, final)
    for img in ex.images:
        add_image(reg, img["url"], img)
    for link in ex.links:
        path = urlparse(link).path.lower()
        if any(x in path for x in ("/product-brands/", "/product-category/", "/shop/", "/brand/")):
            if link not in reg["to_scrape"]:
                reg["to_scrape"].append(link)
    if also_css:
        for css in list(ex.css_hrefs)[:30]:
            if HOST not in urlparse(css).netloc or css in reg["css_done"]:
                continue
            reg["css_done"].append(css)
            try:
                css_text, _, css_final = fetch(css, timeout=30)
                for img in extract_css_images(css_text, css_final):
                    add_image(reg, img["url"], img)
            except Exception as e:
                reg["errors"].append({"url": css, "error": str(e)})


def collect_media_extra(reg: dict, max_new: int = 2500):
    print(f"Collecting extra media-library originals (cap {max_new})...", flush=True)
    already = {strip_size_suffix(u) for u in reg["images"]}
    seen = 0
    for batch, page, total in paginate_wp("wp/v2/media", per_page=100):
        for item in batch:
            src = item.get("source_url")
            if not src:
                continue
            mime = (item.get("mime_type") or "").lower()
            if not mime.startswith("image/"):
                continue
            au = abs_url(src)
            if not au:
                continue
            if strip_size_suffix(au) in already:
                continue
            add_image(
                reg,
                au,
                {
                    "pageSource": f"{BASE}wp-json/wp/v2/media/{item.get('id')}",
                    "kind": "media-library",
                    "alt": item.get("alt_text") or "",
                    "width": (item.get("media_details") or {}).get("width") or "",
                    "height": (item.get("media_details") or {}).get("height") or "",
                },
            )
            already.add(strip_size_suffix(au))
            seen += 1
            if seen >= max_new:
                print(f"  media capped new={seen}", flush=True)
                return
        print(f"  media {page}/{total} new={seen}", flush=True)
        if page >= 100:
            break


def save_checkpoint(reg: dict):
    serializable = {
        "images": reg["images"],
        "pages": sorted(set(reg["pages"])),
        "scraped": sorted(set(reg["scraped"])),
        "errors": reg["errors"][-100:],
        "statsNote": {
            "imageCount": len(reg["images"]),
            "pageCount": len(set(reg["pages"])),
            "scrapedCount": len(set(reg["scraped"])),
        },
    }
    CHECKPOINT.write_text(json.dumps(serializable, ensure_ascii=False), encoding="utf-8")
    print(f"Checkpoint saved: {CHECKPOINT} ({len(reg['images'])} urls)", flush=True)


def load_checkpoint() -> dict | None:
    if not CHECKPOINT.exists():
        return None
    data = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
    return data


def _index_existing_files() -> dict[str, Path]:
    """Map sanitized original filename -> local path (first wins; used for resume)."""
    index: dict[str, list[Path]] = defaultdict(list)
    if not OUT.exists():
        return {}
    for p in OUT.rglob("*"):
        if not p.is_file():
            continue
        name = p.name
        # {10-hex}_{original}
        if len(name) > 11 and name[10] == "_":
            original = name[11:]
            index[original].append(p)
    # Prefer single unambiguous matches
    return {k: v[0] for k, v in index.items() if len(v) == 1}


def download_one(url: str, use: str, existing_by_name: dict[str, Path] | None = None):
    existing_by_name = existing_by_name or {}
    parsed_name = Path(unquote(urlparse(url).path)).name
    sanitized = re.sub(r"[^\w.\-]+", "_", parsed_name or "image", flags=re.U)
    if len(sanitized) > 120:
        sanitized = Path(sanitized).stem[:80] + (Path(sanitized).suffix or ".img")

    cached = existing_by_name.get(sanitized)
    if cached and cached.exists():
        data = cached.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        # Move into suggested folder if needed
        folder = folder_for(use)
        dest = OUT / folder / safe_name(url, digest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.resolve() != cached.resolve():
            if not dest.exists():
                dest.write_bytes(data)
        width = height = None
        if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
        return {
            "url": url,
            "finalUrl": url,
            "localPath": str(dest.relative_to(ROOT)).replace("\\", "/"),
            "sha256": digest,
            "bytes": len(data),
            "contentType": "",
            "width": width,
            "height": height,
            "suggestedUse": use,
            "fromCache": True,
        }

    try:
        data, ctype, final = fetch(url, timeout=60, binary=True)
    except Exception as e:
        return {"url": url, "error": str(e)}
    if not data:
        return {"url": url, "error": "empty"}
    path_ext = Path(urlparse(final).path).suffix.lower()
    if ctype and not ctype.startswith("image/") and ctype not in ("application/octet-stream", ""):
        if path_ext not in IMG_EXT:
            return {"url": url, "error": f"not image: {ctype}"}
    digest = hashlib.sha256(data).hexdigest()
    folder = folder_for(use)
    dest = OUT / folder / safe_name(final, digest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        dest.write_bytes(data)
    width = height = None
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
    return {
        "url": url,
        "finalUrl": final,
        "localPath": str(dest.relative_to(ROOT)).replace("\\", "/"),
        "sha256": digest,
        "bytes": len(data),
        "contentType": ctype,
        "width": width,
        "height": height,
        "suggestedUse": use,
    }


def _as_int(val) -> int:
    try:
        if val is None or val == "":
            return 0
        return int(float(str(val).strip()))
    except (TypeError, ValueError):
        return 0


def hero_score(entry: dict, dl: dict) -> float:
    path = unquote(entry["url"]).lower()
    alts = " ".join(entry.get("alts") or []).lower()
    kinds = " ".join(entry.get("kinds") or []).lower()
    pages = " ".join(entry.get("pageSources") or []).lower()
    blob = f"{path} {alts} {kinds} {pages}"
    score = min((_as_int(dl.get("bytes")) or 0) / 50_000, 40)
    w = _as_int(dl.get("width"))
    h = _as_int(dl.get("height"))
    if w and h:
        score += min((w * h) / 100_000, 30)
        if w >= 1200:
            score += 10
        if w / max(h, 1) >= 1.3:
            score += 8
    for kw, pts in (
        ("dianno", 50),
        ("дианно", 50),
        ("hero", 25),
        ("banner", 20),
        ("slider", 15),
        ("divan", 30),
        ("kolonka", 25),
        ("vinyl", 15),
        ("uploads/1.jpg", 40),
        ("logo", -40),
        ("icon", -30),
        ("whatsapp", -50),
        ("viber", -50),
        ("favicon", -50),
        ("concert", 25),
        ("stage", 20),
        ("guitar", 15),
        ("salon", 10),
        ("listening", 15),
        ("atmosphere", 20),
    ):
        if kw in blob:
            score += pts
    if entry.get("suggestedUse") == "hero":
        score += 20
    if path.endswith((".svg", ".ico")):
        score -= 20
    return score


def existing_assets():
    out = []
    assets = ROOT / "assets"
    for p in assets.iterdir():
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            data = p.read_bytes()
            out.append(
                {
                    "url": f"local://existing/{p.name}",
                    "localPath": str(p.relative_to(ROOT)).replace("\\", "/"),
                    "pageSource": ["pre-imported"],
                    "suggestedUse": "brand" if "logo" in p.name else "product",
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                    "fromExisting": True,
                }
            )
    return out


def phase_collect():
    reg = {
        "images": {},
        "pages": [],
        "scraped": [],
        "to_scrape": [],
        "css_done": [],
        "featured_media_ids": [],
        "errors": [],
    }
    seeds = [
        BASE,
        urljoin(BASE, "shop/"),
        urljoin(BASE, "o-nas/"),
        urljoin(BASE, "kontakty/"),
        urljoin(BASE, "dostavka/"),
        urljoin(BASE, "oplata/"),
        urljoin(BASE, "blog/"),
        urljoin(BASE, "cart/"),
        urljoin(BASE, "wishlist/"),
    ]
    reg["to_scrape"].extend(seeds)

    collect_products(reg)
    save_checkpoint(reg)
    collect_posts_pages(reg)
    resolve_featured(reg)
    collect_tax(reg)
    save_checkpoint(reg)

    print("Scraping key HTML pages + theme CSS...", flush=True)
    scrape_page(reg, BASE, also_css=True)

    # brand pages from home, category archives, static pages, shop pagination sample
    for n in range(2, 21):
        reg["to_scrape"].append(urljoin(BASE, f"shop/page/{n}/"))
    # sample product detail pages for galleries beyond API
    for u in sorted(set(p for p in reg["pages"] if "/product/" in p))[:30]:
        reg["to_scrape"].append(u)

    # de-dupe scrape queue; cap brands to keep runtime bounded
    seen = set()
    queue = []
    brands = 0
    for u in reg["to_scrape"]:
        if u in seen or "add-to-cart=" in u:
            continue
        seen.add(u)
        if "/product-brands/" in u:
            brands += 1
            if brands > 80:
                continue
        queue.append(u)

    print(f"HTML scrape queue: {len(queue)}", flush=True)
    for i, url in enumerate(queue, 1):
        scrape_page(reg, url, also_css=(i <= 5))
        if i % 20 == 0:
            print(f"  scraped {i}/{len(queue)} images={len(reg['images'])}", flush=True)
            save_checkpoint(reg)
        time.sleep(0.04)

    collect_media_extra(reg, max_new=2500)
    prefer_fullsize(reg)
    # classify
    for url, entry in reg["images"].items():
        meta = {
            "alt": (entry["alts"] or [""])[0],
            "pageSource": " ".join(entry["pageSources"]),
            "kind": " ".join(entry["kinds"]),
        }
        entry["suggestedUse"] = suggest_use(url, meta)
    save_checkpoint(reg)
    print(f"Collect done: {len(reg['images'])} unique urls, {len(set(reg['scraped']))} HTML pages", flush=True)
    return reg


def phase_download(reg_images: dict, pages: list, scraped: list):
    for sub in ("hero", "products", "editorial", "brand", "misc"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    items = []
    for url, entry in reg_images.items():
        use = entry.get("suggestedUse") or suggest_use(
            url,
            {
                "alt": (entry.get("alts") or [""])[0],
                "pageSource": " ".join(entry.get("pageSources") or []),
                "kind": " ".join(entry.get("kinds") or []),
            },
        )
        entry["suggestedUse"] = use
        items.append((url, entry, use))

    print(f"Downloading {len(items)} images...", flush=True)
    downloads = []
    hash_index: dict[str, dict] = {}
    errors = []
    existing_by_name = _index_existing_files()
    print(f"Resume index: {len(existing_by_name)} unambiguous local files", flush=True)

    def work(item):
        url, entry, use = item
        return entry, download_one(url, use, existing_by_name)

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = [pool.submit(work, it) for it in items]
        done = 0
        for fut in as_completed(futs):
            entry, result = fut.result()
            done += 1
            if done % 100 == 0 or done == len(items):
                print(f"  downloaded {done}/{len(items)} unique={len(downloads)} err={len(errors)}", flush=True)
            if "error" in result:
                errors.append(result)
                continue
            sha = result["sha256"]
            if sha in hash_index:
                prev = hash_index[sha]
                prev["pageSources"] = sorted(
                    set(prev.get("pageSources") or []) | set(entry.get("pageSources") or [])
                )
                prev.setdefault("duplicateUrls", [])
                if result["url"] not in prev["duplicateUrls"]:
                    prev["duplicateUrls"].append(result["url"])
                continue
            record = {
                "url": result["url"],
                "localPath": result["localPath"],
                "pageSource": (entry.get("pageSources") or [])[:20],
                "width": result.get("width") or entry.get("width") or None,
                "height": result.get("height") or entry.get("height") or None,
                "bytes": result["bytes"],
                "sha256": sha,
                "suggestedUse": result["suggestedUse"],
                "kinds": entry.get("kinds") or [],
                "alts": (entry.get("alts") or [])[:5],
            }
            hash_index[sha] = record
            downloads.append(record)

    # hero ranking
    by_url = {d["url"]: d for d in downloads}
    hero_candidates = []
    for url, entry, use in items:
        dl = by_url.get(url)
        if not dl:
            continue
        score = hero_score(entry, dl)
        hero_candidates.append({**dl, "heroScore": round(score, 2)})
    hero_candidates.sort(key=lambda x: x["heroScore"], reverse=True)
    top_hero = hero_candidates[:10]
    top_urls = {h["url"] for h in top_hero}
    for d in downloads:
        d["heroCandidate"] = d["url"] in top_urls

    existing = existing_assets()
    manifest = {
        "source": BASE,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stats": {
            "pagesDiscovered": len(set(pages)),
            "pagesScrapedHtml": len(set(scraped)),
            "imageUrlsFound": len(reg_images),
            "uniqueImagesDownloaded": len(downloads),
            "downloadErrors": len(errors),
            "existingAssetsPreserved": len(existing),
            "toolingNotes": [
                "Firecrawl MCP: needsAuth (unavailable in cloud agent)",
                "Bright Data: invalid API token",
                "Context MCP: needsAuth",
                "Tavily map empty / crawl timeout",
                "Primary: WP REST API (wc/store/products, posts, pages, media) + HTML/CSS scrape",
            ],
        },
        "folders": {
            "hero": "assets/from-live/hero/",
            "products": "assets/from-live/products/",
            "editorial": "assets/from-live/editorial/",
            "brand": "assets/from-live/brand/",
            "misc": "assets/from-live/misc/",
            "existing": "assets/",
        },
        "topHeroCandidates": top_hero,
        "existingAssets": existing,
        "images": sorted(downloads, key=lambda x: (x["suggestedUse"], x["localPath"])),
        "errorsSample": errors[:80],
        "pagesScrapedSample": sorted(set(scraped))[:120],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    readme = ROOT / "README.md"
    section = """
## Live asset crawl (from-live)

Источник: родной сайт [MELOMANIAK](https://xn--80aannlcfckh.xn--p1ai/).

- Манифест: `assets-live-manifest.json`
- URL-чекпоинт: `assets-live-urls.json`
- Скачанные файлы: `assets/from-live/{hero,products,editorial,brand,misc}/`
- Уже импортированные ассеты в `assets/` сохранены (`existingAssets` в манифесте)
- Запуск: `python3 crawl_live_assets.py`

Дедуп по SHA-256; `topHeroCandidates` — приоритет для элитного hero (чёрное+золото).
"""
    if readme.exists():
        text = readme.read_text(encoding="utf-8")
        if "Live asset crawl" not in text:
            readme.write_text(text.rstrip() + "\n" + section, encoding="utf-8")
    else:
        readme.write_text("# MELOMANIAK\n" + section, encoding="utf-8")

    print("DONE", flush=True)
    print(json.dumps(manifest["stats"], ensure_ascii=False, indent=2), flush=True)
    print("Top hero:", flush=True)
    for h in top_hero:
        print(f"  {h['heroScore']:>6} {h['localPath']} | {h['url'][:90]}", flush=True)
    return manifest


def main():
    import sys

    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("all", "collect"):
        reg = phase_collect()
        if mode == "collect":
            return
        phase_download(reg["images"], reg["pages"], reg["scraped"])
    elif mode == "download":
        data = load_checkpoint()
        if not data:
            raise SystemExit("No checkpoint; run collect first")
        phase_download(data["images"], data.get("pages") or [], data.get("scraped") or [])
    else:
        raise SystemExit("Usage: crawl_live_assets.py [all|collect|download]")


if __name__ == "__main__":
    main()
