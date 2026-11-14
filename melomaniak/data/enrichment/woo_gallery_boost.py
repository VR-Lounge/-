#!/usr/bin/env python3
"""Fetch additional Woo Store API images for meager galleries (gal < 4)."""
from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
QUEUE = ROOT / "data" / "enrichment" / "meager-queue.json"
BASE = "https://xn--80aannlcfckh.xn--p1ai"
API = f"{BASE}/wp-json/wc/store/v1/products"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-gallery-boost/1.0)"


def encode_url(url: str) -> str:
    parts = urlsplit(url)
    path = quote(unquote(parts.path), safe="/':@!$&()*+,;=")
    return urlunsplit((parts.scheme, parts.netloc, path, parts.query, ""))


def fetch_product(pid: int) -> dict | None:
    url = f"{API}/{pid}"
    try:
        req = Request(
            encode_url(url),
            headers={"User-Agent": UA, "Accept": "application/json", "Referer": BASE + "/"},
        )
        with urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        print(f"fail {pid}: {e}")
        return None


def full_image_url(src: str) -> str:
    import re

    if not src:
        return src
    return re.sub(r"-(\d+)x(\d+)(\.(?:jpe?g|png|webp|gif))$", r"\3", src, flags=re.I)


def boost_one(pid: int) -> int:
    path = PDP / f"{pid}.json"
    if not path.exists():
        return 0
    d = json.loads(path.read_text(encoding="utf-8"))
    gallery = list(d.get("gallery") or [])
    if len(gallery) >= 4:
        return 0
    raw = fetch_product(pid)
    if not raw:
        return 0
    existing = {g.get("src") for g in gallery}
    added = 0
    for img in raw.get("images") or []:
        src = full_image_url(img.get("src") or "")
        if not src or src in existing:
            continue
        gallery.append(
            {
                "src": src,
                "thumb": img.get("thumbnail") or src,
                "alt": (img.get("alt") or img.get("name") or d.get("name") or "").strip(),
                "from": "woo-boost",
            }
        )
        existing.add(src)
        added += 1
        if len(gallery) >= 6:
            break
    if added:
        d["gallery"] = gallery
        d["galleryBoostedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"boost {pid} +{added} → gal={len(gallery)}")
    return added


def main() -> None:
    q = json.loads(QUEUE.read_text(encoding="utf-8"))
    # Prioritize: gal-only meager with price, skip tiny cables first wave optional
    items = [
        x
        for x in q["items"]
        if any(r.startswith("gal:") for r in x.get("reasons") or [])
        and (x.get("gallery") or 0) < 4
    ]
    # Prefer headphones / high price / already enriched desc
    items.sort(
        key=lambda x: (
            0 if (x.get("cat") or "") == "Наушники" else 1,
            0 if x.get("enriched") else 1,
            -(x.get("price") or 0),
        )
    )
    # Cap this run to keep network sane; focus top 120
    targets = items[:120]
    total = 0
    for i, it in enumerate(targets):
        total += boost_one(int(it["id"]))
        time.sleep(0.2)
        if (i + 1) % 20 == 0:
            print(f"... {i+1}/{len(targets)}")
    print(f"done boost photos added slots={total} products_tried={len(targets)}")


if __name__ == "__main__":
    main()
