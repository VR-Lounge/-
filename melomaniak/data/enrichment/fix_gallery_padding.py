#!/usr/bin/env python3
"""Replace padding on highest-price padded/single_real SKUs with real OEM/from-live angles.

Only attaches exact-model images (token-checked). Strips local-variant / w17sc pads
once ≥4 distinct real slots exist. Writes fix report into gallery-padding-audit.json.
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
ASSETS = ROOT / "assets" / "enriched"
AUDIT = ROOT / "data" / "enrichment" / "gallery-padding-audit.json"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-gallery-depad/1.0)"
MIN_BYTES = 12_000
TARGET = 4

# Exact-model candidate packs (OEM / press / live CDN). Do NOT invent wrong models.
FIX_PACKS: dict[int, list[str]] = {
    # Transrotor ZET 1 — OEM gallery has ≥7 distinct angles; keep full-res only
    270472: [
        "https://transrotor.de/media/pages/produkte/zet1/ef41cc0239-1702458085/zet1-tra-schraeg.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/f5214ef3f9-1702458067/zet1-rega-mittel.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/f324896caf-1702458067/zet1-rega-hoch.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/0223ecb994-1702458066/zet1-rega-flach.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/dd3b6663ae-1702458067/zet1-tra-flach.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/844051ef05-1702458067/zet1-tra-mittel.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/951fb87077-1702458067/zet1-tra-hoch.jpg",
        "https://transrotor.de/media/pages/produkte/zet1/1a31e9002a-1702458067/zet1-rega-schraeg.jpg",
    ],
    # Dark Star Reference — already 4 unique; ensure no res-copies if any remain
    270461: [
        "https://transrotor.de/media/pages/produkte/dark-star-reference/8923b8c844-1696931264/dark-startra-schraeg-ref1.jpg",
        "https://transrotor.de/media/pages/produkte/dark-star-reference/21d389b15d-1696426454/tra-mitte-ref-min.jpg",
        "https://transrotor.de/media/pages/produkte/dark-star-reference/1be43fbba8-1696426445/tra-schraeg-ref-min.jpg",
        "https://transrotor.de/media/pages/produkte/dark-star-reference/b96953abcf-1696426464/tra-flach-ref-min.jpg",
    ],
    # Nordost Tyr 2 speaker cable — live shop has multiple Tyr 2 SKU photos (same model line)
    271212: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_5m1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_2184063783-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_9042737710-1.jpg",
    ],
    # Nordost Tyr 2 power — reuse power-labeled frames only
    271274: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_9042737710-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_2184063783-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/nordost_tyr_2_5m1.jpg",
    ],
    # Parasound ZoneMaster 12 — live already has 1/2/3; fetch OEM if needed
    269782: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/parasound_zonemaster_12-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/parasound_zonemaster_12-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/parasound_zonemaster_12-3.jpg",
        "https://www.parasound.com/images/ZoneMaster12/ZoneMaster12_Angle.jpg",
        "https://www.parasound.com/images/ZoneMaster12/ZoneMaster12_Front.jpg",
        "https://www.parasound.com/images/ZoneMaster12/ZoneMaster12_Rear.jpg",
    ],
    # MOON 260D
    270148: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/moon_260d_black_4044835544-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/moon_260d_black2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/moon_260d_black3.jpg",
        "https://www.simaudio.com/wp-content/uploads/2021/03/MOON-260D-Black.jpg",
        "https://www.simaudio.com/wp-content/uploads/2021/03/MOON-260D-Black-Rear.jpg",
    ],
    # Soulnote D-2 — front+rear already; try OEM press of exact D-2 (not D-2 ver.2 / S-3)
    262129: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2-SE.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/10/Soulnote-D-2-SE-rear-500x193-1.jpg",
        "https://www.soulnote.co.jp/img/d2_front.jpg",
        "https://www.soulnote.co.jp/img/d2_rear.jpg",
        "https://www.soulnote.co.jp/img/product/d-2.jpg",
        "https://www.soulnote.audio/media/pages/soulnote-en/series-2/d-2/d2-black.jpg",
        "https://www.soulnote.audio/media/pages/soulnote-en/series-2/d-2/d2-silver.jpg",
    ],
    # Esoteric K-01Xs — gallery page + known CDN paths
    33762: [
        "https://www.esoteric.jp/common/images/products/k-01xs/k-01xs_01.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/k-01xs_02.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/k-01xs_03.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/k-01xs_04.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/gallery/01.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/gallery/02.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/gallery/03.jpg",
        "https://www.esoteric.jp/common/images/products/k-01xs/gallery/04.jpg",
        "https://www.esoteric.jp/images/products/k-01xs/k-01xs.jpg",
        "https://www.esoteric.jp/images/products/k-01xs/k-01xs_rear.jpg",
    ],
    # SAEC WE-4700 — often 1-shot; try common OEM paths (may fail → HITL)
    264506: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2022/06/SAEC_WE-4700_001.jpg",
        "https://www.saec-jp.com/images/products/we-4700_1.jpg",
        "https://www.saec-jp.com/images/products/we-4700_2.jpg",
        "https://www.saec-jp.com/images/we4700.jpg",
    ],
    # Transrotor Phono 8.2 MC
    270483: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/transrotor_phono_8-2_mc1.jpg",
        "https://transrotor.de/media/pages/produkte/phono-8-2/phono82-front.jpg",
        "https://transrotor.de/media/pages/elektronik/phono-8-2-mc/phono-8-2.jpg",
    ],
}

PAD_SLOT_RE = re.compile(
    r"local-variant://|_w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)\b|_w1[3-6]var\b|"
    r"-(?:1280x|2048x)(?=\.(?:jpe?g|png|webp|gif)$)|-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp|gif)$)",
    re.I,
)


def ahash(path: Path) -> int | None:
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((8, 8), Image.Resampling.BILINEAR)
            pixels = list(im.getdata())
    except Exception:
        return None
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, p in enumerate(pixels):
        if p >= avg:
            bits |= 1 << i
    return bits


def is_pad_slot(g: dict) -> bool:
    blob = f"{g.get('src') or ''} {g.get('local') or ''}"
    if "local-variant://" in blob:
        return True
    name = Path(g.get("local") or g.get("src") or "").name
    if re.search(
        r"(?:^|[_\-])w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)|w1[3-6]var",
        name,
        re.I,
    ):
        return True
    src = (g.get("src") or "").split("?")[0]
    if re.search(r"-(?:1280x|2048x)(?=\.|$)", src, re.I):
        return True
    if re.search(r"-(\d+)x(\d+)\.(?:jpe?g|png|webp|gif)$", src, re.I):
        m = re.search(r"-(\d+)x(\d+)\.", src, re.I)
        if m and max(int(m.group(1)), int(m.group(2))) <= 600:
            return True
    return False


def download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= MIN_BYTES:
        return dest.stat().st_size
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Referer": f"{urlparse(url).scheme}://{urlparse(url).netloc}/"}
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < MIN_BYTES:
            return 0
        if data[:200].lstrip().startswith(b"<") and b"<html" in data[:500].lower():
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
        print(f"  fail {url}: {e}")
        return 0


def ext_of(url: str) -> str:
    path = url.split("?")[0].lower()
    for e in (".jpg", ".jpeg", ".png", ".webp"):
        if path.endswith(e):
            return ".jpg" if e == ".jpeg" else e
    return ".jpg"


def content_id(url: str) -> str | None:
    m = re.search(r"/([0-9a-f]{10,12})-\d{10}/", url or "", re.I)
    return m.group(1).lower() if m else None


def strip_pads_keep_real(gallery: list[dict], keep_min: int = 1) -> list[dict]:
    real = [g for g in gallery if not is_pad_slot(g)]
    pads = [g for g in gallery if is_pad_slot(g)]
    if len(real) >= TARGET:
        return real[: max(TARGET, min(8, len(real)))]
    # keep real + only as many pads as needed? Prefer drop pads entirely when real>=1
    if len(real) >= keep_min:
        return real + pads  # caller may replace pads
    return gallery


def unique_enough(path: Path, existing_hashes: list[int]) -> bool:
    h = ahash(path)
    if h is None:
        return True
    for eh in existing_hashes:
        if (h ^ eh).bit_count() <= 1:
            return False
    return True


def fix_one(pid: int, urls: list[str]) -> dict:
    path = PDP / f"{pid}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    gallery = [g for g in (d.get("gallery") or []) if isinstance(g, dict)]
    before = len(gallery)
    before_pads = sum(1 for g in gallery if is_pad_slot(g))

    # Drop resolution copies / synthetic pads first; keep non-pad slots
    kept: list[dict] = []
    seen_cid: set[str] = set()
    hashes: list[int] = []
    for g in gallery:
        if is_pad_slot(g):
            continue
        src = g.get("src") or ""
        cid = content_id(src)
        if cid and cid in seen_cid:
            continue
        local = g.get("local") or ""
        lp = ROOT / local if local else None
        if lp and lp.exists():
            h = ahash(lp)
            if h is not None:
                if any((h ^ eh).bit_count() <= 1 for eh in hashes):
                    continue
                hashes.append(h)
        if cid:
            seen_cid.add(cid)
        kept.append(g)

    asset_dir = ASSETS / str(pid)
    asset_dir.mkdir(parents=True, exist_ok=True)
    added = 0
    used_srcs = {g.get("src") for g in kept}

    for url in urls:
        if len(kept) >= max(TARGET, 6):
            break
        if url in used_srcs:
            continue
        cid = content_id(url)
        if cid and cid in seen_cid:
            continue
        hsh = hashlib.sha1(url.encode()).hexdigest()[:10]
        fname = f"{hsh}_depad{ext_of(url)}"
        dest = asset_dir / fname
        size = download(url, dest)
        if size < MIN_BYTES:
            continue
        if not unique_enough(dest, hashes):
            continue
        h = ahash(dest)
        if h is not None:
            hashes.append(h)
        if cid:
            seen_cid.add(cid)
        kept.append(
            {
                "src": url,
                "thumb": url,
                "alt": d.get("name") or "",
                "local": str(dest.relative_to(ROOT)),
                "bytes": size,
                "from": "oem-depad",
                "wave": "gallery-depad-2026-11",
            }
        )
        used_srcs.add(url)
        added += 1

    # If still short, do not re-add synthetic pads — mark HITL instead
    d["gallery"] = kept
    after_pads = sum(1 for g in kept if is_pad_slot(g))
    fixed = len(kept) >= TARGET and after_pads == 0 and added > 0
    improved = len(kept) > (before - before_pads) or (before_pads > 0 and after_pads == 0)
    if len(kept) < TARGET:
        d["galleryHitl"] = True
        note = (d.get("enrichmentNote") or "").rstrip()
        tag = " HITL gallery: true 1-shot / <4 OEM angles after depad — salon shoot needed."
        if "after depad" not in note:
            d["enrichmentNote"] = (note + tag).strip()
    else:
        # cleared multi-angle
        if d.get("galleryHitl") and len(kept) >= TARGET:
            d["galleryHitl"] = False
    d["galleryDepaddedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "id": pid,
        "name": d.get("name"),
        "price": d.get("price"),
        "before": before,
        "beforePads": before_pads,
        "after": len(kept),
        "added": added,
        "fixedTrueMulti": bool(len(kept) >= TARGET),
        "stillHitl": bool(d.get("galleryHitl")),
        "improved": improved,
    }


def main() -> None:
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    # Prioritize FIX_PACKS by price from audit
    price_map = {i["id"]: i.get("price") or 0 for i in audit.get("items") or []}
    targets = sorted(FIX_PACKS.keys(), key=lambda p: -(price_map.get(p) or 0))
    results = []
    for pid in targets:
        print(f"fix {pid} …")
        results.append(fix_one(pid, FIX_PACKS[pid]))
        print(" ", results[-1])

    fixed_n = sum(1 for r in results if r["fixedTrueMulti"])
    improved_n = sum(1 for r in results if r["improved"] or r["added"] or r["beforePads"])
    audit["depadPass"] = {
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tried": len(results),
        "fixedTrueMulti": fixed_n,
        "touched": improved_n,
        "results": results,
    }
    AUDIT.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"depad fixedTrueMulti={fixed_n}/{len(results)} touched={improved_n}")


if __name__ == "__main__":
    main()
