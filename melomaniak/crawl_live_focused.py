#!/usr/bin/env python3
"""Focused crawl: homepage + theme + demo products + recent editorial — not all 31k media."""
from __future__ import annotations

import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse, urlunparse, unquote, quote
from urllib.request import Request, urlopen

BASE = "https://xn--80aannlcfckh.xn--p1ai/"
HOST = "xn--80aannlcfckh.xn--p1ai"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "from-live"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-focused-crawler/1.1)"
IMG_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"}
SIZE_SUFFIX = re.compile(r"-(\d+)x(\d+)(?=\.(?:jpe?g|png|gif|webp|avif)$)", re.I)

PRODUCT_SLUGS = [
    "advance-acoustic-x-a220-x-p700",
    "advance-paris-dx1-px1",
    "usilitel-moshhnosti-anthem-pva-5-black",
    "usilitel-dlya-naushnikov-mcintosh-mha50",
    "komplekt-2-1-psb-alpha-ps1-subseries-100-black",
    "napolnaya-akustika-audio-physic-yara",
]

THEME_FORCE = [
    "wp-content/themes/NEW2021/imgi/divan.png",
    "wp-content/themes/NEW2021/imgi/left_kolonka.png",
    "wp-content/themes/NEW2021/imgi/right_kolonka.png",
    "wp-content/themes/NEW2021/imgi/logo_max.gif",
    "wp-content/themes/NEW2021/imgi/logo_min.gif",
    "wp-content/themes/NEW1/imgi/logo.png",
    "wp-content/uploads/1.jpg",
]


def fetch(url: str, timeout: int = 40, binary: bool = False):
    req = Request(url, headers={"User-Agent": UA, "Referer": BASE, "Accept": "*/*"})
    with urlopen(req, timeout=timeout) as resp:
        data = resp.read()
        ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        final = resp.geturl()
    if binary:
        return data, ctype, final
    return data.decode("utf-8", errors="replace"), ctype, final


def abs_url(url: str, base: str = BASE) -> str | None:
    if not url or url.startswith(("data:", "blob:", "javascript:")):
        return None
    url = url.strip().strip("\"'")
    if url.startswith("//"):
        url = "https:" + url
    full = urljoin(base, url)
    p = urlparse(full)
    if p.scheme not in ("http", "https"):
        return None
    if HOST not in p.netloc.lower() and "i0.wp.com" not in p.netloc.lower():
        return None
    return urlunparse((p.scheme, p.netloc, p.path, "", "", ""))


def fullsize(url: str) -> str:
    return SIZE_SUFFIX.sub("", url)


def looks_image(url: str) -> bool:
    path = urlparse(url).path.lower()
    if any(x in path for x in (".js", ".css", ".mp4", ".webm", "yandex", "wp-emoji", "smilies")):
        return False
    ext = Path(path).suffix
    return ext in IMG_EXT or "/uploads/" in path or "/imgi/" in path


def extract_imgs(html: str, page: str) -> set[str]:
    found: set[str] = set()
    for attr in ("src", "data-src", "data-lazy-src", "data-large_image", "data-src-retina"):
        for u in re.findall(rf'{attr}=["\']([^"\']+)["\']', html, re.I):
            a = abs_url(u, page)
            if a and looks_image(a):
                found.add(fullsize(a))
    for m in re.findall(r'(?:srcset|data-srcset)=["\']([^"\']+)["\']', html, re.I):
        for part in m.split(","):
            u = part.strip().split()[0] if part.strip() else ""
            a = abs_url(u, page)
            if a and looks_image(a):
                found.add(fullsize(a))
    for u in re.findall(r'url\(\s*[\'"]?([^)\'"]+)[\'"]?\s*\)', html, re.I):
        a = abs_url(u, page)
        if a and looks_image(a):
            found.add(fullsize(a))
    for tag in re.findall(r'<meta[^>]+(?:og:image|twitter:image)[^>]*>', html, re.I):
        m = re.search(r'content=["\']([^"\']+)["\']', tag, re.I)
        if m:
            a = abs_url(m.group(1), page)
            if a and looks_image(a):
                found.add(fullsize(a))
    return found


def classify(url: str, page: str = "") -> str:
    u = unquote(url).lower()
    p = page.lower()
    if any(x in u for x in ("logo", "favicon", "whatsapp", "viber", "mail.png", "phone", "profile.png")):
        return "brand"
    if any(x in u for x in ("divan", "kolonka", "/uploads/1.jpg", "banner", "slider", "dianno", "di-anno")):
        return "hero"
    if "/product/" in p or "/uploads/" in u:
        if any(x in u for x in ("advance", "anthem", "mcintosh", "psb", "physic", "yara", "dx1", "xa220", "mha50", "pva")):
            return "products"
        if "/product/" in p:
            return "products"
    if any(x in p for x in ("/blog", "/news", "/category", "post")) or any(
        x in u for x in ("kef", "aurender", "tonewinner", "ls50")
    ):
        return "editorial"
    if any(x in u for x in ("themes/", "imgi/")):
        return "hero" if any(x in u for x in ("divan", "kolonka", "1.jpg")) else "brand"
    return "misc"


def safe_name(url: str, digest: str) -> str:
    path = unquote(urlparse(url).path)
    base = Path(path).name or "img"
    base = re.sub(r"[^\w.\-]+", "_", base)[:80]
    stem = Path(base).stem[:60]
    ext = Path(base).suffix.lower() or ".jpg"
    if ext not in IMG_EXT:
        ext = ".jpg"
    return f"{stem}_{digest[:10]}{ext}"


def download(url: str, use: str) -> dict:
    try:
        data, ctype, final = fetch(url, binary=True)
    except Exception as e:
        return {"url": url, "error": str(e)}
    if not data or len(data) < 200:
        return {"url": url, "error": "too small"}
    if ctype and not ctype.startswith("image/") and ctype not in ("application/octet-stream",):
        if Path(urlparse(final).path).suffix.lower() not in IMG_EXT:
            return {"url": url, "error": f"ctype {ctype}"}
    digest = hashlib.sha256(data).hexdigest()
    folder = use if use in ("hero", "products", "editorial", "brand", "misc") else "misc"
    dest = OUT / folder / safe_name(final, digest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        dest.write_bytes(data)
    w = h = None
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        w = int.from_bytes(data[16:20], "big")
        h = int.from_bytes(data[20:24], "big")
    return {
        "url": url,
        "finalUrl": final,
        "localPath": str(dest.relative_to(ROOT)).replace("\\", "/"),
        "sha256": digest,
        "bytes": len(data),
        "width": w,
        "height": h,
        "suggestedUse": folder,
    }


def wp_json(path: str):
    text, _, _ = fetch(urljoin(BASE, path))
    return json.loads(text)


def collect_urls() -> dict[str, dict]:
    bag: dict[str, dict] = {}

    def add(url: str | None, page: str, kind: str = ""):
        if not url:
            return
        u = fullsize(url)
        if not looks_image(u):
            return
        # skip tiny thumbs by path hint
        if re.search(r"-150x150\.", u):
            u = fullsize(u)
        entry = bag.setdefault(u, {"pages": set(), "kinds": set()})
        entry["pages"].add(page)
        if kind:
            entry["kinds"].add(kind)

    print("1) homepage + theme force…")
    html, _, _ = fetch(BASE)
    for u in extract_imgs(html, BASE):
        add(u, BASE, "home")
    for rel in THEME_FORCE:
        add(abs_url(rel), BASE, "theme-force")

    # homepage category tiles often 150x150 — also take fullsize variants already via fullsize()

    print("2) demo product pages…")
    for slug in PRODUCT_SLUGS:
        url = urljoin(BASE, f"product/{slug}/")
        try:
            ph, _, final = fetch(url)
            for u in extract_imgs(ph, final):
                add(u, final, "product-page")
            print(f"   ok {slug} imgs={len(extract_imgs(ph, final))}")
        except Exception as e:
            print(f"   fail {slug}: {e}")
            # search fallback
            try:
                q = slug.replace("-", "+")
                sh, _, _ = fetch(urljoin(BASE, f"?s={q}&post_type=product"))
                for u in extract_imgs(sh, BASE):
                    add(u, url, "product-search")
            except Exception as e2:
                print(f"   search fail: {e2}")

    print("3) Woo Store API featured products sample…")
    try:
        products = wp_json("wp-json/wc/store/v1/products?per_page=20")
        for p in products:
            page = p.get("permalink") or BASE
            for img in p.get("images") or []:
                add(abs_url(img.get("src") or "", page), page, "store-api")
                for sz in (img.get("sizes") or {}).values() if isinstance(img.get("sizes"), dict) else []:
                    if isinstance(sz, dict) and sz.get("source_url"):
                        add(abs_url(sz["source_url"], page), page, "store-api")
            # also thumbnail
            if p.get("images"):
                add(abs_url(p["images"][0].get("src"), page), page, "store-api")
        print(f"   store products {len(products)}")
    except Exception as e:
        print("   store api fail", e)

    print("4) recent posts featured media…")
    try:
        posts = wp_json("wp-json/wp/v2/posts?per_page=12&_embed=1")
        for post in posts:
            link = post.get("link") or BASE
            emb = post.get("_embedded") or {}
            for media in emb.get("wp:featuredmedia") or []:
                add(abs_url(media.get("source_url"), link), link, "post-featured")
                details = (media.get("media_details") or {}).get("sizes") or {}
                for key in ("full", "large", "medium_large"):
                    if key in details and details[key].get("source_url"):
                        add(abs_url(details[key]["source_url"], link), link, "post-featured")
            # scrape post HTML lightly for inline imgs
            try:
                ph, _, final = fetch(link)
                for u in list(extract_imgs(ph, final))[:12]:
                    add(u, final, "post-html")
            except Exception:
                pass
        print(f"   posts {len(posts)}")
    except Exception as e:
        print("   posts fail", e)

    print("5) about / contacts if exist…")
    for path in ("o-nas/", "kontakty/", "shop/"):
        url = urljoin(BASE, path)
        try:
            ph, _, final = fetch(url)
            for u in extract_imgs(ph, final):
                add(u, final, path)
            print(f"   ok {path}")
        except Exception as e:
            print(f"   skip {path}: {e}")

    # Prefer fullsize only — drop remaining tiny
    cleaned = {}
    for u, meta in bag.items():
        if re.search(r"-\d{2,4}x\d{2,4}\.", u):
            u2 = fullsize(u)
            cleaned.setdefault(u2, {"pages": set(), "kinds": set()})
            cleaned[u2]["pages"] |= meta["pages"]
            cleaned[u2]["kinds"] |= meta["kinds"]
        else:
            cleaned.setdefault(u, {"pages": set(), "kinds": set()})
            cleaned[u]["pages"] |= meta["pages"]
            cleaned[u]["kinds"] |= meta["kinds"]
    return cleaned


def main():
    for sub in ("hero", "products", "editorial", "brand", "misc"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    bag = collect_urls()
    print(f"Unique image URLs: {len(bag)}")

    jobs = []
    for url, meta in bag.items():
        page = next(iter(meta["pages"]), BASE)
        use = classify(url, page)
        jobs.append((url, use, sorted(meta["pages"])[:8], sorted(meta["kinds"])))

    downloads = []
    errors = []
    by_hash: dict[str, dict] = {}

    print("Downloading…")
    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = {pool.submit(download, url, use): (url, use, pages, kinds) for url, use, pages, kinds in jobs}
        done = 0
        for fut in as_completed(futs):
            url, use, pages, kinds = futs[fut]
            done += 1
            if done % 20 == 0:
                print(f"  {done}/{len(jobs)}")
            result = fut.result()
            if "error" in result:
                errors.append(result)
                continue
            sha = result["sha256"]
            if sha in by_hash:
                by_hash[sha]["pages"] = sorted(set(by_hash[sha].get("pages") or []) | set(pages))
                continue
            rec = {
                **{k: result[k] for k in ("url", "localPath", "sha256", "bytes", "width", "height", "suggestedUse")},
                "pages": pages,
                "kinds": kinds,
            }
            by_hash[sha] = rec
            downloads.append(rec)

    # hero ranking
    def hero_score(d: dict) -> float:
        blob = unquote(d["url"]).lower() + " " + " ".join(d.get("pages") or []).lower()
        s = min((d.get("bytes") or 0) / 40000, 35)
        for kw, pts in (
            ("divan", 60),
            ("kolonka", 50),
            ("/uploads/1.jpg", 55),
            ("dianno", 45),
            ("di-anno", 45),
            ("paul", 20),
            ("logo", -50),
            ("whatsapp", -80),
            ("150x150", -40),
        ):
            if kw in blob:
                s += pts
        if d["suggestedUse"] == "hero":
            s += 15
        return s

    heroes = sorted(downloads, key=hero_score, reverse=True)[:12]

    existing = []
    for p in (ROOT / "assets").iterdir():
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            existing.append(
                {
                    "localPath": str(p.relative_to(ROOT)).replace("\\", "/"),
                    "bytes": p.stat().st_size,
                    "suggestedUse": "brand" if "logo" in p.name else "product",
                }
            )

    manifest = {
        "source": BASE,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "focused",
        "stats": {
            "uniqueUrlsQueued": len(bag),
            "uniqueImagesDownloaded": len(downloads),
            "downloadErrors": len(errors),
            "existingAssetsPreserved": len(existing),
            "byFolder": {
                k: sum(1 for d in downloads if d["suggestedUse"] == k)
                for k in ("hero", "products", "editorial", "brand", "misc")
            },
        },
        "topHeroCandidates": [
            {**h, "heroScore": round(hero_score(h), 1)} for h in heroes
        ],
        "existingAssets": existing,
        "images": sorted(downloads, key=lambda x: (x["suggestedUse"], x["localPath"])),
        "errorsSample": errors[:40],
    }
    (ROOT / "assets-live-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("DONE", json.dumps(manifest["stats"], ensure_ascii=False, indent=2))
    print("Top hero:")
    for h in heroes[:8]:
        print(f"  {hero_score(h):5.1f} {h['localPath']}")


if __name__ == "__main__":
    main()
