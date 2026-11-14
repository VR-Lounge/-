#!/usr/bin/env python3
"""Apply researched enrichment batches into data/pdp/{id}.json + optional photos."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
ASSETS = ROOT / "assets" / "enriched"
ENRICH = ROOT / "data" / "enrichment"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-enrich/1.0; +https://melomaniak.example)"


def load_batches() -> dict:
    merged: dict = {}
    for f in sorted(ENRICH.glob("batch-*-researched.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for pid, payload in data.items():
            merged[str(pid)] = payload
    extra = ENRICH / "extra-images.json"
    if extra.exists():
        imgs = json.loads(extra.read_text(encoding="utf-8"))
        for pid, urls in imgs.items():
            merged.setdefault(str(pid), {})
            existing = merged[str(pid)].setdefault("imageUrls", [])
            for u in urls:
                if u not in existing:
                    existing.append(u)
    return merged


def strip_tags(html: str) -> str:
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html or "")
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</(p|div|h[1-6]|li)>", "\n", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def download_image(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 2000:
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": url})
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < 2000:
            return False
        if "svg" in ctype or data[:200].lstrip().startswith(b"<svg"):
            return False
        # Skip tiny/logo-ish
        if len(data) < 8000 and ("logo" in url.lower()):
            return False
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"  image fail {url}: {e}")
        return False


def ext_from_url(url: str) -> str:
    path = url.split("?")[0].lower()
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(e):
            return e if e != ".jpeg" else ".jpg"
    return ".jpg"


def apply_one(pid: str, payload: dict, provenance: dict) -> dict | None:
    path = PDP / f"{pid}.json"
    if not path.exists():
        print(f"missing PDP {pid}")
        return None
    d = json.loads(path.read_text(encoding="utf-8"))
    html = (payload.get("descriptionHtml") or "").strip()
    if not html:
        print(f"skip {pid}: no html")
        return None

    d["descriptionHtml"] = html
    d["descriptionText"] = strip_tags(html)
    if payload.get("specs"):
        # Prefer researched specs when empty or mark enriched overwrite
        d["specs"] = payload["specs"]
    if payload.get("name") and not (d.get("name") or "").strip():
        d["name"] = payload["name"]
    d["enriched"] = True
    d["sources"] = payload.get("sources") or []
    d["enrichedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["enrichmentNote"] = (
        "HITL: описание и specs собраны с страниц производителя/официальных материалов; "
        "не выдуманные характеристики. Проверить тон и комплектность перед публикацией."
    )

    # Photos: keep existing from-live; append official downloads if gallery weak or imageUrls provided
    gallery = list(d.get("gallery") or [])
    urls = list(payload.get("imageUrls") or [])
    added = 0
    if urls and len(gallery) < 4:
        asset_dir = ASSETS / pid
        attr_lines = [
            f"# Attribution — product {pid}",
            f"Enriched: {d['enrichedAt']}",
            "",
        ]
        for i, url in enumerate(urls[:6], start=1):
            # Prefer manufacturer / official CDN hosts
            host = url.split("/")[2] if "://" in url else ""
            junk = any(
                x in host
                for x in ("avito", "ebay", "aliexpress", "wildberries", "ozon.ru")
            )
            if junk:
                continue
            h = hashlib.sha1(url.encode()).hexdigest()[:10]
            ext = ext_from_url(url)
            local_name = f"{h}_{i}{ext}"
            dest = asset_dir / local_name
            if download_image(url, dest):
                rel = f"assets/enriched/{pid}/{local_name}"
                # Avoid duplicates by src
                if any(g.get("src") == url or g.get("local") == rel for g in gallery):
                    continue
                gallery.append(
                    {
                        "src": url,
                        "thumb": url,
                        "alt": d.get("name") or pid,
                        "local": rel,
                        "enriched": True,
                        "attribution": host,
                    }
                )
                attr_lines.append(f"- {local_name} ← {url} ({host})")
                added += 1
        if added:
            (asset_dir / "ATTRIBUTION.md").write_text(
                "\n".join(attr_lines) + "\n", encoding="utf-8"
            )
            d["gallery"] = gallery

    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    provenance[pid] = {
        "name": d.get("name"),
        "sources": d.get("sources"),
        "specsCount": len(d.get("specs") or []),
        "galleryCount": len(d.get("gallery") or []),
        "photosAdded": added,
        "enrichedAt": d["enrichedAt"],
    }
    print(f"OK {pid} specs={len(d['specs'])} gal={len(d.get('gallery') or [])} +photos={added}")
    return d


def main():
    batches = load_batches()
    provenance: dict = {}
    for pid, payload in sorted(batches.items(), key=lambda x: int(x[0])):
        apply_one(pid, payload, provenance)

    meta = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "enrichedCount": len(provenance),
        "products": provenance,
        "method": (
            "Manufacturer pages preferred (Hegel, PS Audio, T+A, Aurender, Clearaudio, "
            "Parasound, Naim, Marantz, Emotiva). Research via Exa + Tavily. No invented watts."
        ),
    }
    (ENRICH / "provenance-batch.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nEnriched {len(provenance)} products. Provenance → data/enrichment/provenance-batch.json")


if __name__ == "__main__":
    main()
