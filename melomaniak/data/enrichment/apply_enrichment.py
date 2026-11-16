#!/usr/bin/env python3
"""Apply researched enrichment batches into data/pdp/{id}.json + optional photos."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
ASSETS = ROOT / "assets" / "enriched"
ENRICH = ROOT / "data" / "enrichment"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-enrich/1.0; +https://melomaniak.example)"
GALLERY_TARGET = 4
GALLERY_MAX_ADD = 8
MIN_IMAGE_BYTES = 12_000  # skip logos / tiny thumbs


def load_batches(pattern: str = "batch-*-researched.json") -> dict:
    merged: dict = {}
    for f in sorted(ENRICH.glob(pattern)):
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
    s = re.sub(r"(?is)</(p|div|h[1-6]|li|aside)>", "\n", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def download_image(url: str, dest: Path) -> int:
    """Download image; return byte size on success, 0 on failure."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= MIN_IMAGE_BYTES:
        return dest.stat().st_size
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Referer": url.rsplit("/", 1)[0] + "/"}
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < MIN_IMAGE_BYTES:
            return 0
        if "svg" in ctype or data[:200].lstrip().startswith(b"<svg"):
            return 0
        if not (
            data[:3] == b"\xff\xd8\xff"
            or data[:8] == b"\x89PNG\r\n\x1a\n"
            or data[:4] == b"RIFF"
            or "image" in ctype
        ):
            return 0
        dest.write_bytes(data)
        return len(data)
    except Exception as e:
        print(f"  image fail {url}: {e}")
        return 0


def ext_from_url(url: str) -> str:
    path = url.split("?")[0].lower()
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(e):
            return e if e != ".jpeg" else ".jpg"
    return ".jpg"


def local_size(item: dict) -> int:
    rel = item.get("local") or ""
    if not rel:
        return 0
    p = ROOT / rel
    return p.stat().st_size if p.exists() else 0


def attach_local_lives(d: dict, paths: list[str], pid: str) -> int:
    """Copy already-local from-live/product frames into enriched gallery."""
    if not paths:
        return 0
    gallery = list(d.get("gallery") or [])
    if len(gallery) >= GALLERY_MAX_ADD:
        return 0
    asset_dir = ASSETS / pid
    asset_dir.mkdir(parents=True, exist_ok=True)
    used_names = {Path(g.get("local") or "").name for g in gallery}
    used_srcs = {g.get("src") or "" for g in gallery}
    added = 0
    new_frames: list[dict] = []
    for i, raw in enumerate(paths, start=1):
        src_path = Path(raw)
        if not src_path.is_absolute():
            src_path = ROOT / raw
        if not src_path.exists():
            continue
        size = src_path.stat().st_size
        if size < MIN_IMAGE_BYTES:
            continue
        if src_path.name in used_names:
            continue
        h = hashlib.sha1(str(src_path).encode()).hexdigest()[:10]
        ext = src_path.suffix.lower() or ".jpg"
        if ext == ".jpeg":
            ext = ".jpg"
        local_name = f"{h}_live{i}{ext}"
        dest = asset_dir / local_name
        if not dest.exists():
            shutil.copy2(src_path, dest)
        rel = f"assets/enriched/{pid}/{local_name}"
        src_key = f"local://{src_path.name}"
        if src_key in used_srcs or any(g.get("local") == rel for g in gallery + new_frames):
            continue
        new_frames.append(
            {
                "src": src_key,
                "thumb": rel,
                "alt": d.get("name") or pid,
                "local": rel,
                "enriched": True,
                "attribution": "from-live",
                "bytes": size,
            }
        )
        used_names.add(src_path.name)
        used_srcs.add(src_key)
        added += 1
        if len(gallery) + len(new_frames) >= GALLERY_MAX_ADD:
            break
    if not new_frames:
        return 0
    if len(gallery) < GALLERY_TARGET:
        d["gallery"] = (new_frames + gallery)[: max(GALLERY_TARGET, min(len(gallery) + len(new_frames), 10))]
    else:
        d["gallery"] = (gallery + new_frames)[:10]
    return added


def enrich_gallery(d: dict, urls: list[str], pid: str) -> int:
    """Append OEM/press photos until gallery meets target; promote strong frames first."""
    if not urls:
        return 0
    gallery = list(d.get("gallery") or [])
    need = max(0, GALLERY_TARGET - len(gallery))
    # Always try to add when below target OR when only low-res frames exist
    only_weak = len(gallery) > 0 and all(local_size(g) < 80_000 for g in gallery)
    if need == 0 and not only_weak and len(gallery) >= GALLERY_TARGET:
        # still allow topping up to GALLERY_MAX_ADD if caller provided urls and gal thin-ish
        if len(gallery) >= GALLERY_MAX_ADD:
            return 0

    asset_dir = ASSETS / pid
    attr_lines = [
        f"# Attribution — product {pid}",
        f"Enriched: {d.get('enrichedAt')}",
        "",
    ]
    added = 0
    new_frames: list[dict] = []
    for i, url in enumerate(urls[:GALLERY_MAX_ADD], start=1):
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
        size = download_image(url, dest)
        if size < MIN_IMAGE_BYTES:
            if dest.exists() and dest.stat().st_size < MIN_IMAGE_BYTES:
                dest.unlink(missing_ok=True)
            continue
        rel = f"assets/enriched/{pid}/{local_name}"
        if any(g.get("src") == url or g.get("local") == rel for g in gallery + new_frames):
            continue
        new_frames.append(
            {
                "src": url,
                "thumb": url,
                "alt": d.get("name") or pid,
                "local": rel,
                "enriched": True,
                "attribution": host,
                "bytes": size,
            }
        )
        attr_lines.append(f"- {local_name} ← {url} ({host}, {size} bytes)")
        added += 1

    if not new_frames:
        return 0

    # Prefer enriched high-res first when existing gallery is weak/single low-res
    if only_weak or len(gallery) < GALLERY_TARGET:
        # keep original frames after enriched (provenance), drop duplicate tiny hero if same product
        merged = new_frames + gallery
    else:
        merged = gallery + new_frames

    # Cap gallery length but keep ≥ target
    d["gallery"] = merged[: max(GALLERY_TARGET, min(len(merged), 10))]
    (asset_dir / "ATTRIBUTION.md").write_text(
        "\n".join(attr_lines) + "\n", encoding="utf-8"
    )
    return added


def apply_one(pid: str, payload: dict, provenance: dict) -> dict | None:
    path = PDP / f"{pid}.json"
    if not path.exists():
        print(f"missing PDP {pid}")
        return None
    d = json.loads(path.read_text(encoding="utf-8"))
    html = (payload.get("descriptionHtml") or "").strip()
    if not html:
        # images-only / specs-only top-up allowed when already has some copy
        if (
            not payload.get("specs")
            and not payload.get("imageUrls")
            and not payload.get("localLivePaths")
        ):
            print(f"skip {pid}: no html")
            return None
    else:
        d["descriptionHtml"] = html
        d["descriptionText"] = strip_tags(html)
    if payload.get("specs"):
        d["specs"] = payload["specs"]
    if payload.get("name") and not (d.get("name") or "").strip():
        d["name"] = payload["name"]
    d["enriched"] = True
    d["sources"] = payload.get("sources") or d.get("sources") or []
    d["enrichedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["enrichmentNote"] = (
        "HITL: описание и specs собраны с страниц производителя/официальных материалов; "
        "не выдуманные характеристики. Проверить тон и комплектность перед публикацией."
    )
    if payload.get("meagerWave"):
        d["meagerWave"] = payload["meagerWave"]
    if payload.get("galleryHitl"):
        d["galleryHitl"] = True
        note = d.get("enrichmentNote") or ""
        hitl_gal = (
            " HITL gallery: OEM/пресс дали <4 ракурса — добить съёмкой с витрины "
            "без водяных знаков; текст и specs уже elite-bar."
        )
        if "HITL gallery" not in note:
            d["enrichmentNote"] = (note + hitl_gal).strip()

    added = enrich_gallery(d, list(payload.get("imageUrls") or []), pid)
    added += attach_local_lives(d, list(payload.get("localLivePaths") or []), pid)
    # If still under gallery target after scrape attempt, keep/force galleryHitl
    if len(d.get("gallery") or []) < GALLERY_TARGET and (
        payload.get("galleryHitl")
        or payload.get("imageUrls") is not None
        or payload.get("localLivePaths") is not None
    ):
        if payload.get("galleryHitl") or (
            added == 0 and len(d.get("gallery") or []) < GALLERY_TARGET
        ):
            d["galleryHitl"] = True

    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    provenance[pid] = {
        "name": d.get("name"),
        "sources": d.get("sources"),
        "specsCount": len(d.get("specs") or []),
        "galleryCount": len(d.get("gallery") or []),
        "photosAdded": added,
        "descLen": len(d.get("descriptionText") or ""),
        "galleryHitl": bool(d.get("galleryHitl")),
        "enrichedAt": d["enrichedAt"],
    }
    print(
        f"OK {pid} specs={len(d.get('specs') or [])} "
        f"gal={len(d.get('gallery') or [])} +photos={added} "
        f"desc={len(d.get('descriptionText') or '')}"
    )
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--pattern",
        default="batch-*-researched.json",
        help="Glob under data/enrichment/",
    )
    ap.add_argument(
        "--only",
        default="",
        help="Comma-separated product ids to apply",
    )
    ap.add_argument(
        "--merge-provenance",
        action="store_true",
        help="Merge into existing provenance-batch.json instead of replace",
    )
    args = ap.parse_args()

    batches = load_batches(args.pattern)
    if args.only:
        want = {x.strip() for x in args.only.split(",") if x.strip()}
        batches = {k: v for k, v in batches.items() if k in want}

    provenance: dict = {}
    if args.merge_provenance:
        prev = ENRICH / "provenance-batch.json"
        if prev.exists():
            old = json.loads(prev.read_text(encoding="utf-8"))
            provenance = dict(old.get("products") or {})

    for pid, payload in sorted(batches.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0):
        apply_one(pid, payload, provenance)

    meta = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "enrichedCount": len(provenance),
        "products": provenance,
        "method": (
            "Manufacturer pages preferred. Research via Exa + Tavily + dealer OEM galleries. "
            "Meager bar: desc≥500 chars, gallery≥4, structured specs. No invented watts."
        ),
    }
    (ENRICH / "provenance-batch.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\nEnriched {len(batches)} this run / {len(provenance)} in provenance.")


if __name__ == "__main__":
    main()
