#!/usr/bin/env python3
"""Wave 10: clear meager galleries for Усилители / Акустика / Источники.

Strict SKU/model match only. Sources:
  - Woo Store API + wp/v2 media search (product ID / exact tokens)
  - from-live exact brand+model filename tokens
  - Manufacturer page <img> scrape from PDP sources (exact model in URL/name)
  - Press/OEM PDF embedded images (pymupdf) when page text labels the model
  - OEM CDN absolute images linked from manufacturer pages

melomaniak.рф is DNS-dead; melomaniak.ru is unrelated — skipped.
"""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
LIVE = ROOT / "assets" / "from-live" / "products"
ASSETS = ROOT / "assets" / "enriched"
ENRICH = ROOT / "data" / "enrichment"
QUEUE = ENRICH / "meager-queue.json"
CACHE = ENRICH / "woo-cache"
MEDIA_CACHE = ENRICH / "media-search-cache"
PDF_DIR = ENRICH / "wave10-pdfs"
PDF_EXTRACT = ASSETS / "_pdf_extract"
BATCH_OUT = ENRICH / "batch-meager-46-wave10.json"
SHOP = "https://xn--80aannlcfckh.xn--p1ai"
API = f"{SHOP}/wp-json/wc/store/v1/products"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-wave10/1.0)"
CTX = ssl.create_default_context()
MIN_BYTES = 12_000
PRIO_CATS = ("Усилители", "Акустика", "Источники")
GALLERY_TARGET = 4

# Known OEM product-page templates / catalog PDFs (exact model in path)
OEM_PDFS = [
    "https://triode.co.jp/cp-bin/wordpress/wp-content/uploads/2020/04/%E7%B7%8F%E5%90%88%E3%82%AB%E3%82%BF%E3%83%AD%E3%82%AF%E3%82%99Ver42%E6%9C%80%E7%B5%82%E7%89%88-210208.pdf",
    "https://triode.co.jp/cp-bin/wordpress/wp-content/uploads/2020/04/%E7%B7%8F%E5%90%88%E3%82%AB%E3%82%BF%E3%83%AD%E3%82%AF%E3%82%99Ver43%E6%9C%80%E7%B5%82%E7%89%88220124.pdf",
]
OEM_PAGE_HINTS = {
    "triode": [
        "https://triode.co.jp/english/{MODEL}/index.html",
        "https://triode.co.jp/brand/triode/{MODEL}/index.html",
    ],
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def brand_of(name: str) -> str:
    m = re.search(r"[A-Za-z][A-Za-z0-9&\.]+", name or "")
    return (m.group(0).lower() if m else "")


def full_image_url(src: str) -> str:
    if not src:
        return src
    return re.sub(r"-(\d+)x(\d+)(\.(?:jpe?g|png|webp|gif))$", r"\3", src, flags=re.I)


def live_body(fn: str) -> str:
    m = re.match(r"^[0-9a-f]{8,12}_(.+)$", fn, re.I)
    return (m.group(1) if m else fn).lower()


def strong_models(name: str, sku: str = "") -> list[str]:
    cleaned = re.sub(r"[А-Яа-яЁё]+", " ", name or "")
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    strong: list[str] = []
    if sku and len(norm(sku)) >= 4:
        strong.append(sku.lower())
    for t in re.findall(
        r"[A-Za-z]{2,}\d[\w.\-/]*|\d+[A-Za-z][\w.\-/]*|[A-Za-z]+-\d[\w.\-/]*",
        cleaned,
    ):
        if len(norm(t)) >= 4 and any(c.isdigit() for c in t):
            strong.append(t.lower())
    latin = re.findall(r"[A-Za-z0-9][A-Za-z0-9.\-/]*", cleaned)
    for i, t in enumerate(latin):
        if not any(c.isdigit() for c in t):
            continue
        prevs = []
        j = i - 1
        while j >= 0 and latin[j].isalpha() and len(prevs) < 2:
            prevs.insert(0, latin[j].lower())
            j -= 1
        if prevs:
            strong.append("-".join(prevs + [t.lower()]))
            strong.append("_".join(prevs + [t.lower()]))
            strong.append("".join(prevs + [t.lower()]))
        if i + 1 < len(latin) and latin[i + 1].isalpha() and len(latin[i + 1]) <= 5 and prevs:
            strong.append("-".join(prevs + [t.lower(), latin[i + 1].lower()]))
            strong.append("_".join(prevs + [t.lower(), latin[i + 1].lower()]))
    # paren models
    for p in re.findall(r"\(([^)]+)\)", name or ""):
        for t in re.findall(
            r"[a-z0-9]+(?:[.\-/][a-z0-9]+)+|[a-z]+\d[\w]*|\d+[a-z][\w]*", p.lower()
        ):
            if len(norm(t)) >= 4 and any(c.isdigit() for c in t):
                strong.append(t)
    out: list[str] = []
    seen: set[str] = set()
    for s in sorted(strong, key=lambda x: len(norm(x)), reverse=True):
        s = s.strip(".-_")
        n = norm(s)
        if len(n) < 4 or n in seen:
            continue
        if n in {"mk2", "mkii", "7g", "3d", "2tb", "4tb"}:
            continue
        seen.add(n)
        out.append(s)
    return out


def token_in(bn: str, token: str) -> bool:
    mn = norm(token)
    if len(mn) < 4 or mn not in bn:
        return False
    idx = bn.find(mn)
    while idx >= 0:
        before = bn[idx - 1] if idx > 0 else ""
        after = bn[idx + len(mn)] if idx + len(mn) < len(bn) else ""
        if not before.isdigit() and not after.isdigit():
            return True
        idx = bn.find(mn, idx + 1)
    return False


def accepts(filename: str, brand: str, strong: list[str]) -> bool:
    fl = filename.lower()
    if fl.endswith((".mp4", ".webm", ".mov", ".svg", ".gif")):
        return False
    bn = norm(fl)
    brand_n = norm(brand) if brand else ""
    if brand_n and len(brand_n) >= 3 and brand_n not in bn:
        if not any(len(norm(s)) >= 8 and token_in(bn, s) for s in strong[:3]):
            return False
    if not strong:
        return False
    max_l = len(norm(strong[0]))
    floor = max(5, max_l - 3)
    for s in strong:
        if len(norm(s)) < floor and len(norm(s)) < 5:
            continue
        if token_in(bn, s):
            return True
    for s in strong:
        if len(norm(s)) >= 5 and token_in(bn, s):
            return True
    return False


def http_bytes(url: str, timeout: int = 45) -> tuple[bytes, str]:
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Referer": url.rsplit("/", 1)[0] + "/", "Accept": "*/*"}
    )
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read(), (r.headers.get("Content-Type") or "")


def http_json(url: str):
    try:
        data, _ = http_bytes(url, timeout=40)
        return json.loads(data.decode("utf-8", "replace"))
    except Exception:
        return None


def http_text(url: str) -> str:
    try:
        data, ct = http_bytes(url, timeout=40)
        return data.decode("utf-8", "replace")
    except Exception:
        return ""


def existing_names(gal: list) -> set[str]:
    names: set[str] = set()
    for g in gal:
        for k in ("src", "thumb", "local"):
            v = g.get(k) or ""
            if not v:
                continue
            names.add(Path(urllib.parse.unquote(v.split("?")[0])).name.lower())
            if v.startswith("local://"):
                names.add(v[8:].lower())
    return names


def build_live_index() -> dict[str, list[str]]:
    inv: dict[str, list[str]] = defaultdict(list)
    for f in LIVE.iterdir():
        if not f.is_file():
            continue
        body = live_body(f.name)
        n = norm(body)
        for t in re.findall(r"[a-z]*\d[a-z0-9]*", n):
            if len(t) >= 3:
                inv[t].append(f.name)
        if len(n) >= 6:
            inv[n].append(f.name)
    return inv


def match_live(brand: str, strong: list[str], inv: dict[str, list[str]]) -> list[str]:
    cands: set[str] = set()
    for s in strong[:10]:
        mn = norm(s)
        if len(mn) < 3:
            continue
        cands.update(inv.get(mn, []))
        for t in re.findall(r"[a-z]*\d[a-z0-9]*", mn):
            if len(t) >= 3:
                cands.update(inv.get(t, []))
    hits = []
    for fn in cands:
        if accepts(live_body(fn), brand, strong):
            hits.append(fn)
    return hits


def fetch_media_search(token: str) -> list[dict]:
    MEDIA_CACHE.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", token)[:80] or "x"
    cache = MEDIA_CACHE / f"{safe}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except Exception:
            pass
    q = urllib.parse.quote(token)
    data = http_json(f"{SHOP}/wp-json/wp/v2/media?search={q}&per_page=40")
    rows = data if isinstance(data, list) else []
    cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.05)
    return rows


def fetch_woo(pid: int) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    c = CACHE / f"{pid}.json"
    if c.exists():
        try:
            return json.loads(c.read_text(encoding="utf-8"))
        except Exception:
            pass
    data = http_json(f"{API}/{pid}") or {}
    c.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def scrape_page_images(url: str, brand: str, strong: list[str]) -> list[str]:
    html = http_text(url)
    if not html:
        return []
    found: list[str] = []
    for m in re.findall(
        r"(?:src|data-src|data-lazy-src|href)=[\"']([^\"']+\.(?:jpe?g|png|webp)[^\"']*)[\"']",
        html,
        re.I,
    ):
        src = m.strip()
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            parts = urllib.parse.urlsplit(url)
            src = f"{parts.scheme}://{parts.netloc}{src}"
        elif not src.startswith("http"):
            src = urllib.parse.urljoin(url, src)
        src = full_image_url(src)
        fn = Path(urllib.parse.unquote(src.split("?")[0])).name
        if accepts(fn, brand, strong) or accepts(src, brand, strong):
            found.append(src)
    return list(dict.fromkeys(found))


def ensure_pdfs() -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    for u in OEM_PDFS:
        name = Path(urllib.parse.unquote(urllib.parse.urlsplit(u).path)).name
        dest = PDF_DIR / name
        if dest.exists() and dest.stat().st_size > 10_000:
            continue
        try:
            data, _ = http_bytes(u, timeout=90)
            dest.write_bytes(data)
            print(f"  pdf {name} {len(data)}")
        except Exception as e:
            print(f"  pdf fail {name}: {e}")


def index_pdf_images() -> dict[str, list[str]]:
    """Map normalized model token → local extracted image paths."""
    PDF_EXTRACT.mkdir(parents=True, exist_ok=True)
    by_model: dict[str, list[str]] = defaultdict(list)
    for pdf in PDF_DIR.glob("*.pdf"):
        try:
            doc = pymupdf.open(pdf)
        except Exception as e:
            print(f"  open fail {pdf.name}: {e}")
            continue
        for pi, page in enumerate(doc):
            text = page.get_text("text")
            models = set(
                re.findall(
                    r"TRX-?[A-Z0-9]+(?:SE|XR|SER)?|TRV-?[A-Z0-9]+(?:SE|XR|SER)?|"
                    r"Signature\s*50[357]|Signature\s*70[357]|PA\s*1000\s*E|"
                    r"RSA-?M\d\w*|AP-?505|NT-?505|Kube\s*12|Oberon\s*7",
                    text,
                    re.I,
                )
            )
            models_n = {norm(m) for m in models}
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    pix = pymupdf.Pixmap(doc, xref)
                    if pix.n >= 5:
                        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                    if pix.width < 220 or pix.height < 220:
                        continue
                    if pix.width * pix.height < 90_000:
                        continue
                    h = hashlib.sha1(pix.tobytes()).hexdigest()[:12]
                    out = PDF_EXTRACT / f"{pdf.stem[:20]}_p{pi}_{h}.png"
                    if not out.exists():
                        pix.save(out)
                    rel = str(out.relative_to(ROOT))
                    for mn in models_n:
                        if len(mn) >= 4:
                            by_model[mn].append(rel)
                    if not models_n:
                        by_model["unlabeled"].append(rel)
                except Exception:
                    continue
        doc.close()
    # dedup
    for k in list(by_model):
        by_model[k] = list(dict.fromkeys(by_model[k]))
    print(f"pdf index models={len(by_model)} imgs={sum(len(v) for v in by_model.values())}")
    return by_model


def download_to_gallery(pid: str, url: str, gal: list, names: set[str], tag: str) -> bool:
    src = full_image_url(url)
    fn = Path(urllib.parse.unquote(src.split("?")[0])).name.lower()
    if fn in names or fn.endswith((".mp4", ".webm", ".svg")):
        return False
    try:
        data, ctype = http_bytes(src, timeout=45)
    except Exception:
        return False
    if len(data) < MIN_BYTES:
        return False
    if not (
        data[:3] == b"\xff\xd8\xff"
        or data[:8] == b"\x89PNG\r\n\x1a\n"
        or data[:4] == b"RIFF"
        or "image" in (ctype or "").lower()
    ):
        return False
    h = hashlib.sha1(src.encode()).hexdigest()[:10]
    ext = ".jpg"
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if fn.endswith(e):
            ext = ".jpg" if e == ".jpeg" else e
            break
    asset = ASSETS / pid
    asset.mkdir(parents=True, exist_ok=True)
    dest = asset / f"{h}_w10{ext}"
    if not dest.exists():
        dest.write_bytes(data)
    rel = f"assets/enriched/{pid}/{dest.name}"
    gal.append(
        {
            "src": src,
            "thumb": rel,
            "alt": pid,
            "local": rel,
            "enriched": True,
            "attribution": tag,
            "bytes": len(data),
        }
    )
    names.add(fn)
    return True


def attach_local(pid: str, path: str, gal: list, names: set[str], tag: str) -> bool:
    src_path = ROOT / path if not Path(path).is_absolute() else Path(path)
    if not src_path.exists() or src_path.stat().st_size < MIN_BYTES:
        return False
    if src_path.name.lower() in names:
        return False
    # also skip if local:// already present
    if f"local://{src_path.name}" in {g.get("src") for g in gal}:
        return False
    h = hashlib.sha1(str(src_path).encode()).hexdigest()[:10]
    ext = src_path.suffix.lower() or ".jpg"
    if ext == ".jpeg":
        ext = ".jpg"
    asset = ASSETS / pid
    asset.mkdir(parents=True, exist_ok=True)
    dest = asset / f"{h}_w10{ext}"
    if not dest.exists():
        dest.write_bytes(src_path.read_bytes())
    rel = f"assets/enriched/{pid}/{dest.name}"
    gal.append(
        {
            "src": f"local://{src_path.name}",
            "thumb": rel,
            "alt": pid,
            "local": rel,
            "enriched": True,
            "attribution": tag,
            "bytes": src_path.stat().st_size,
        }
    )
    names.add(src_path.name.lower())
    return True


def triode_model_slug(strong: list[str]) -> str | None:
    for s in strong:
        m = re.search(r"(trx-?[a-z0-9]+|trv-?[a-z0-9]+)", s, re.I)
        if m:
            slug = m.group(1).upper().replace("_", "-")
            # normalize TRXM845 → TRX-M845
            slug = re.sub(r"^(TRX|TRV)([A-Z])", r"\1-\2", slug)
            return slug
    return None


def main() -> None:
    q = json.loads(QUEUE.read_text(encoding="utf-8"))["items"]
    items = [
        i
        for i in q
        if i.get("cat") in PRIO_CATS and (i.get("gallery") or 0) < GALLERY_TARGET
    ]
    items.sort(
        key=lambda x: (
            PRIO_CATS.index(x["cat"]),
            -(x.get("gallery") or 0),
            -(x.get("price") or 0),
        )
    )
    print(f"wave10 targets={len(items)}")
    inv = build_live_index()
    print("live indexed")
    print("ensuring PDFs…")
    ensure_pdfs()
    pdf_index = index_pdf_images()

    cleared = 0
    partial = 0
    hitl_candidates = []
    batch_meta: dict[str, dict] = {}

    for i, it in enumerate(items):
        pid = str(it["id"])
        pdp = json.loads((PDP / f"{pid}.json").read_text(encoding="utf-8"))
        gal = list(pdp.get("gallery") or [])
        gal0 = len(gal)
        if gal0 >= GALLERY_TARGET:
            continue
        brand = brand_of(it["name"]) or brand_of(pdp.get("name") or "")
        raw = fetch_woo(int(pid)) if (CACHE / f"{pid}.json").exists() or True else {}
        # use cache without refetch storm — fetch_woo reads cache first
        strong = strong_models(it["name"], (raw.get("sku") or "") or (pdp.get("sku") or ""))
        names = existing_names(gal)
        added = 0

        # 1) Woo images by product ID
        for im in raw.get("images") or []:
            src = full_image_url(im.get("src") or "")
            if not src:
                continue
            fn = Path(src.split("?")[0]).name.lower()
            if fn in names or fn.endswith((".mp4", ".webm")):
                continue
            if download_to_gallery(pid, src, gal, names, "woo-store-id"):
                added += 1
            if len(gal) >= 8:
                break

        # 2) Media search exact tokens
        if len(gal) < GALLERY_TARGET and strong:
            for tok in strong[:3]:
                if len(norm(tok)) < 5:
                    continue
                for m in fetch_media_search(tok):
                    src = full_image_url(m.get("source_url") or "")
                    if not src:
                        continue
                    fn = Path(src.split("?")[0]).name
                    if not accepts(fn, brand, strong):
                        continue
                    if download_to_gallery(pid, src, gal, names, "woo-media-exact"):
                        added += 1
                    if len(gal) >= GALLERY_TARGET + 2:
                        break
                if len(gal) >= GALLERY_TARGET + 2:
                    break

        # 3) from-live exact
        if len(gal) < GALLERY_TARGET and strong:
            for fn in match_live(brand, strong, inv):
                if attach_local(pid, f"assets/from-live/products/{fn}", gal, names, "from-live-exact"):
                    added += 1
                if len(gal) >= GALLERY_TARGET + 2:
                    break

        # 4) Manufacturer pages from PDP sources
        if len(gal) < GALLERY_TARGET:
            for src_url in pdp.get("sources") or []:
                if not isinstance(src_url, str) or not src_url.startswith("http"):
                    continue
                if "xn--80aannlcfckh" in src_url or "wikipedia" in src_url:
                    continue
                if ".pdf" in src_url.lower():
                    continue
                for img_url in scrape_page_images(src_url, brand, strong)[:8]:
                    if download_to_gallery(pid, img_url, gal, names, "oem-page"):
                        added += 1
                    if len(gal) >= GALLERY_TARGET + 2:
                        break
                if len(gal) >= GALLERY_TARGET + 2:
                    break
                time.sleep(0.08)

        # 5) Triode OEM page templates
        if len(gal) < GALLERY_TARGET and brand == "triode":
            slug = triode_model_slug(strong)
            if slug:
                for tmpl in OEM_PAGE_HINTS["triode"]:
                    url = tmpl.format(MODEL=slug)
                    for img_url in scrape_page_images(url, brand, strong)[:6]:
                        # resolve relative triode paths
                        if "image/" in img_url and not img_url.startswith("http"):
                            img_url = urllib.parse.urljoin("https://triode.co.jp/", img_url)
                        if download_to_gallery(pid, img_url, gal, names, "oem-triode"):
                            added += 1
                        if len(gal) >= GALLERY_TARGET + 2:
                            break
                    time.sleep(0.1)

        # 6) PDF extracts labeled with this model
        if len(gal) < GALLERY_TARGET and strong:
            for s in strong[:5]:
                for rel in pdf_index.get(norm(s), [])[:4]:
                    if attach_local(pid, rel, gal, names, "press-pdf"):
                        added += 1
                    if len(gal) >= GALLERY_TARGET + 2:
                        break

        # 7) PDF manuals linked from PDP sources
        if len(gal) < GALLERY_TARGET:
            for src_url in pdp.get("sources") or []:
                if not isinstance(src_url, str) or ".pdf" not in src_url.lower():
                    continue
                try:
                    data, _ = http_bytes(src_url, timeout=60)
                except Exception:
                    continue
                PDF_DIR.mkdir(parents=True, exist_ok=True)
                pdf_path = PDF_DIR / f"{pid}_{hashlib.sha1(src_url.encode()).hexdigest()[:8]}.pdf"
                pdf_path.write_bytes(data)
                try:
                    doc = pymupdf.open(pdf_path)
                    for page in doc:
                        for img in page.get_images(full=True):
                            xref = img[0]
                            try:
                                pix = pymupdf.Pixmap(doc, xref)
                                if pix.n >= 5:
                                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                                if pix.width * pix.height < 120_000:
                                    continue
                                h = hashlib.sha1(pix.tobytes()).hexdigest()[:10]
                                out = PDF_EXTRACT / f"manual_{pid}_{h}.png"
                                if not out.exists():
                                    pix.save(out)
                                # Only accept if strong model appears in surrounding page text OR filename path
                                text = page.get_text("text")
                                if strong and not any(
                                    token_in(norm(text), s) for s in strong[:4]
                                ):
                                    # still allow large product-shot-like images from this model's manual
                                    if brand and norm(brand) not in norm(text):
                                        continue
                                if attach_local(
                                    pid, str(out.relative_to(ROOT)), gal, names, "manual-pdf"
                                ):
                                    added += 1
                                if len(gal) >= GALLERY_TARGET + 2:
                                    break
                            except Exception:
                                continue
                        if len(gal) >= GALLERY_TARGET + 2:
                            break
                    doc.close()
                except Exception as e:
                    print(f"  manual fail {pid}: {e}")

        if added:
            pdp["gallery"] = gal[:10]
            pdp["meagerWave"] = "meager-w10-2026-11"
            note = pdp.get("enrichmentNote") or ""
            if len(gal) < GALLERY_TARGET:
                if "HITL gallery" not in note:
                    pdp["enrichmentNote"] = (
                        note
                        + " HITL gallery: OEM/пресс/Woo дали <4 ракурса — салонная съёмка."
                    ).strip()
                pdp["galleryHitl"] = True
            (PDP / f"{pid}.json").write_text(
                json.dumps(pdp, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            batch_meta[pid] = {
                "meagerWave": "meager-w10-2026-11",
                "added": added,
                "gal": len(pdp["gallery"]),
                "matchKeys": strong[:8],
                "matchBrand": brand,
            }
            if len(pdp["gallery"]) >= GALLERY_TARGET:
                cleared += 1
                print(
                    f"CLEAR {pid} {it['cat']} {it['name'][:42]} gal{gal0}+{added}→{len(pdp['gallery'])} keys={strong[:3]}"
                )
            else:
                partial += 1
                print(
                    f"partial {pid} {it['cat']} gal{gal0}+{added}→{len(pdp['gallery'])} keys={strong[:3]}"
                )
        else:
            # track stuck near-clear for HITL list
            if gal0 >= 2:
                hitl_candidates.append(
                    {
                        "id": pid,
                        "cat": it["cat"],
                        "name": it["name"],
                        "gal": gal0,
                        "price": it.get("price") or 0,
                        "keys": strong[:4],
                        "brand": brand,
                    }
                )

        if (i + 1) % 40 == 0:
            print(f"… {i+1}/{len(items)} cleared={cleared} partial={partial}")

    BATCH_OUT.write_text(
        json.dumps(
            {"cleared": cleared, "partial": partial, "products": batch_meta},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    # HITL top 30: gal=3 first, then gal=2, by price
    hitl_candidates.sort(key=lambda x: (-(x["gal"]), -(x["price"] or 0)))
    hitl_path = ENRICH / "wave10-hitl-top30.json"
    hitl_path.write_text(
        json.dumps(hitl_candidates[:30], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"done cleared={cleared} partial={partial} hitl_stuck={len(hitl_candidates)}")
    print(f"wrote {BATCH_OUT.name} {hitl_path.name}")


if __name__ == "__main__":
    main()
