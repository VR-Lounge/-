#!/usr/bin/env python3
"""Wave 18: promote highest-price padded galleries to true multi-angle.

Exact-model OEM / from-live / press only. No scale/rotate inventing.
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
FROM_LIVE = ROOT / "assets" / "from-live" / "products"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-w18-promote/1.0)"
MIN_BYTES = 10_000
TARGET = 4
DHASH_MAX = 5
HASH_SIZE = 8

# Verified exact-model packs (OEM / from-live CDN)
OEM_PACKS: dict[int, list[str]] = {
    34454: [  # Persona 3F — official gallery + confirmed rear iso 2391
        "https://www.paradigm.com/2397-large_default/persona-3f.jpg",
        "https://www.paradigm.com/2398-large_default/persona-3f.jpg",
        "https://www.paradigm.com/2401-large_default/persona-3f.jpg",
        "https://www.paradigm.com/2391-large_default/persona-3f.jpg",  # rear/iso white
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/PHOTO-2022-05-04-14-45-30.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2018/03/Paradigm_Persona_3F_Vanta_High_Gloss_Black__b3Qk5Hk1Sy8T.jpg",
    ],
    267300: [  # Platinum 200 3G — OEM + from-live extras
        "https://www.monitoraudio.com/site/assets/files/53809/ma_platinum_200_iso_white-1.jpg",
        "https://www.monitoraudio.com/site/assets/files/53810/ma_platinum_200_iso_black-1.jpg",
        "https://www.monitoraudio.com/site/assets/files/53812/ma_platinum_200_front_ebony-1.jpg",
        "https://www.monitoraudio.com/site/assets/files/53813/ma_platinum_200_back_ebony-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5270.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5271.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5272.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5273.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5268.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5269.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5279.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/03/5280.jpg",
    ],
    274431: [  # Davis Acoustics Stellar — OEM gallery
        "https://davis-acoustics.com/wp-content/uploads/2022/05/2-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/10-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/11-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/12-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/13-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/14-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/15-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/16-site.jpg",
        "https://davis-acoustics.com/wp-content/uploads/2022/05/Davis-Acoustic_035-moins-lourds-1200x1799.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/stellar-noir-par.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/stellar-noir-site-1.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/stellar-color.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/15-site.jpg",
    ],
    274316: [],  # Aurender — rebuild from local from-live globs
    274264: [],  # Aurender N200 2Tb
    270665: [  # Elysian 4 — keep exact from-live
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4-1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_7969537-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_7985470-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_7986918-4.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_8010614-5.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_8012087-6.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_8018594-7.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/wharfedale_elysian_4_8022417-8.jpg",
    ],
    261878: [  # Founder 80F — full official PrestaShop gallery IDs
        *[
            f"https://www.paradigm.com/{i}-large_default/founder-80f.jpg"
            for i in list(range(2831, 2862)) + [3583, 3584, 3585]
        ],
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2021/09/1508631d0ea3c877ddddb8c605463471-1.jpg",
    ],
    271508: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/kef_reference_3_meta1.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/kef_reference_3_meta_11888289949-2.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/kef_reference_3_meta_11888291475-3.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/kef_reference_3_meta4.jpg",
        "https://international.kef.com/cdn/shop/files/reference-3-floorstanding-speaker_sp4049a_product__front_1200x1200.jpg",
        "https://international.kef.com/cdn/shop/files/reference-3-floorstanding-speaker_sp4049a_product__front-side_1200x1200.jpg",
        "https://international.kef.com/cdn/shop/files/reference-3-floorstanding-speaker_sp4049e_product__front-side_1200x1200.jpg",
        "http://images.salsify.com/image/upload/s--2v0G5yG2--/w49jwzt5jda8cntdistt.jpg",
        "http://images.salsify.com/image/upload/s--ce63Wwbs--/zjncninvbqfuzfcmtahx.jpg",
        "http://images.salsify.com/image/upload/s--Sz3PRZIg--/whclb4ejplhjhw66tnt6.jpg",
        "http://images.salsify.com/image/upload/s--wPSG3RTF--/fvgpmesevwp9rfh7il6r.jpg",
        "http://images.salsify.com/image/upload/s--hIXIokjp--/8685e6c831844a8551f0cd2ac5722b4a28d94a94.jpg",
        "http://images.salsify.com/image/upload/s--BEemZ4zC--/595bfd1670ab002913d087c4dc1120bcbe1aef2d.jpg",
        "http://images.salsify.com/image/upload/s--yYcXpIvd--/b4c322aff6009fd5e0746882789dfd6425578e85.jpg",
    ],
    274552: [
        "https://www.acoustic-energy.co.uk/wp-content/uploads/Corinium-Silver-Lifestyle-scaled.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/Corinium-Silver-Lifestyle.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-corinium-w950-ae-mpic-0-1699033044.jpg",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2025/04/ae-corinium-w400-ae-mpic-0-1698653142.jpg",
    ],
    266938: [
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-1.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-2.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-3.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-4.png",
        "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads/2023/02/xr-13-5.png",
    ],
}

# Local from-live filename globs to merge into gallery
LOCAL_GLOBS: dict[int, list[str]] = {
    274316: ["*aurender_n200*"],
    274264: ["*aurender_n200*"],
    34454: ["*Persona_3F*", "*persona*3f*", "*PHOTO-2022-05-04*"],
    271508: ["*kef_reference_3*"],
    # Exact SD 3100 only — do NOT glob *sd_3100* (matches sdv_3100 wrong model)
    274019: ["sd_3100*", "psd_3100*"],
    270665: ["*elysian_4*"],
    271065: ["*gold_300_5g*"],
    271034: ["*gold_300_6g*"],
    270743: ["*elysian_2*"],
    266938: ["*xr-13*", "*xr_13*"],
    274552: ["*corinium*"],
    261114: ["*sp20*"],
    16832: ["*P845SE*", "*p845se*", "*TRV_P845*"],
}

WRONG_MODEL: dict[int, list[str]] = {
    15612: ["virgo_v", "virgo-v", "virgo_25.jpg", "virgo-25.jpg", "virgo_25_4510", "Virgo_25.jpg", "Virgo_V"],
    15610: ["virgo_v", "virgo-v", "virgo_25_plus", "virgo-25-plus", "Virgo_25_plus", "Virgo_V"],
    16222: ["virgo_25", "virgo-25", "plus", "Virgo_25"],
    261114: [],  # kit listing — keep SP20+VS115 frames; dedupe only
}

PAD_RE = re.compile(
    r"local-variant://|_w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)\b|_w1[3-6]var\b",
    re.I,
)


def dhash(path: Path) -> int | None:
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.BILINEAR)
            pixels = list(im.getdata())
    except Exception:
        return None
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            if pixels[row * (HASH_SIZE + 1) + col] > pixels[row * (HASH_SIZE + 1) + col + 1]:
                bits |= 1 << (row * HASH_SIZE + col)
    return bits


def is_pad(g: dict) -> bool:
    blob = f"{g.get('src') or ''} {g.get('local') or ''}"
    if PAD_RE.search(blob):
        return True
    src = (g.get("src") or "").split("?")[0]
    if re.search(r"-(?:1280x|2048x)(?=\.|$)", src, re.I):
        return True
    m = re.search(r"-(\d+)x(\d+)\.(?:jpe?g|png|webp|gif)$", src, re.I)
    if m and max(int(m.group(1)), int(m.group(2))) <= 600:
        return True
    return False


def wrong_model(g: dict, pid: int) -> bool:
    tokens = WRONG_MODEL.get(pid) or []
    if not tokens:
        return False
    blob = f"{g.get('src') or ''} {g.get('local') or ''}".lower()
    return any(t.lower() in blob for t in tokens)


def download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= MIN_BYTES:
        # re-validate not HTML
        head = dest.read_bytes()[:200]
        if head.lstrip().startswith(b"<"):
            dest.unlink(missing_ok=True)
        else:
            return dest.stat().st_size
    try:
        host = urlparse(url).netloc
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Referer": f"https://{host}/", "Accept": "image/*,*/*"},
        )
        with urllib.request.urlopen(req, timeout=45) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < MIN_BYTES:
            return 0
        if data[:200].lstrip().startswith(b"<") or b"html" in data[:400].lower():
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
        print(f"  fail {url[-70:]}: {e}")
        return 0


def ext_of(url: str) -> str:
    p = url.split("?")[0].lower()
    for e in (".png", ".webp", ".jpg", ".jpeg"):
        if p.endswith(e):
            return ".jpg" if e == ".jpeg" else e
    return ".jpg"


def local_glob_slots(pid: int, name: str) -> list[dict]:
    patterns = LOCAL_GLOBS.get(pid) or []
    out: list[dict] = []
    seen: set[str] = set()
    for pat in patterns:
        for p in FROM_LIVE.glob(pat):
            if not p.is_file() or p.stat().st_size < MIN_BYTES:
                continue
            key = str(p.resolve())
            if key in seen:
                continue
            seen.add(key)
            out.append(
                {
                    "src": f"from-live://{p.name}",
                    "thumb": f"from-live://{p.name}",
                    "alt": name,
                    "local": str(p.relative_to(ROOT)),
                    "bytes": p.stat().st_size,
                    "from": "from-live-w18",
                    "wave": "gallery-w18-2026-11",
                }
            )
    return out


def rebuild_gallery(pid: int, extra_urls: list[str] | None = None) -> dict:
    path = PDP / f"{pid}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    before = list(d.get("gallery") or [])
    before_n = len(before)
    name = d.get("name") or ""

    candidates: list[dict] = []
    for g in before:
        if not isinstance(g, dict):
            continue
        if is_pad(g) or wrong_model(g, pid):
            continue
        candidates.append(g)

    asset = ASSETS / str(pid)
    asset.mkdir(parents=True, exist_ok=True)

    for url in extra_urls or []:
        hsh = hashlib.sha1(url.encode()).hexdigest()[:10]
        dest = asset / f"{hsh}_w18{ext_of(url)}"
        size = download(url, dest)
        if size < MIN_BYTES:
            continue
        candidates.append(
            {
                "src": url.split("?")[0],
                "thumb": url,
                "alt": name,
                "local": str(dest.relative_to(ROOT)),
                "bytes": size,
                "from": "oem-w18",
                "wave": "gallery-w18-2026-11",
            }
        )

    candidates.extend(local_glob_slots(pid, name))

    scored: list[tuple[int, str, dict, int | None]] = []
    for g in candidates:
        loc = g.get("local") or ""
        lp = ROOT / loc if loc else None
        if not lp or not lp.exists():
            continue
        size = lp.stat().st_size
        h = dhash(lp)
        scored.append((size, loc, g, h))
    scored.sort(key=lambda t: (-t[0], t[1]))

    kept: list[dict] = []
    hashes: list[int] = []
    seen_src: set[str] = set()
    for size, _, g, h in scored:
        src = g.get("src") or ""
        if src in seen_src:
            continue
        if h is not None and any((h ^ eh).bit_count() <= DHASH_MAX for eh in hashes):
            continue
        if h is not None:
            hashes.append(h)
        kept.append(g)
        if src:
            seen_src.add(src)
        if len(kept) >= 8:
            break

    d["gallery"] = kept
    multi = len(kept) >= TARGET
    d["galleryHitl"] = not multi
    if not multi:
        note = (d.get("enrichmentNote") or "").rstrip()
        tag = " HITL gallery: <4 distinct perceptual angles after w18 OEM hunt."
        if "after w18" not in note:
            d["enrichmentNote"] = (note + tag).strip()
    else:
        # clear stale HITL note fragments about w18 if promoted
        note = d.get("enrichmentNote") or ""
        if "after w18 OEM hunt" in note:
            d["enrichmentNote"] = note.replace(
                "HITL gallery: <4 distinct perceptual angles after w18 OEM hunt.", ""
            ).strip()
    d["galleryDepaddedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["galleryWave18"] = True
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "id": pid,
        "name": name,
        "price": d.get("price"),
        "before": before_n,
        "after": len(kept),
        "multi": multi,
        "hitl": bool(d.get("galleryHitl")),
    }


def main() -> None:
    audit_path = ROOT / "data/enrichment/gallery-padding-audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    price = {i["id"]: i.get("price") or 0 for i in audit.get("items") or []}
    prev_class = {i["id"]: i.get("class") for i in audit.get("items") or []}

    # Priority: OEM packs + high-price padded/oneshot for strip+dedupe
    padded_ids = [
        i["id"]
        for i in audit["items"]
        if i["class"] in ("padded", "single_real") and (i.get("price") or 0) >= 500_000
    ]
    # Always include Virgo wrong-model cleanup
    virgo = [15612, 15610, 16222]
    targets = sorted(
        set(list(OEM_PACKS.keys()) + list(LOCAL_GLOBS.keys()) + padded_ids[:100] + virgo),
        key=lambda p: -(price.get(p) or 0),
    )

    results = []
    for pid in targets:
        if not (PDP / f"{pid}.json").exists():
            continue
        urls = OEM_PACKS.get(pid, [])
        print(f"promote {pid} urls={len(urls)} …")
        r = rebuild_gallery(pid, urls)
        r["prevClass"] = prev_class.get(pid)
        results.append(r)
        print(" ", r)

    out = {
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tried": len(results),
        "nowMulti": sum(1 for r in results if r["multi"]),
        "results": results,
        "newlyMultiIds": [
            r["id"]
            for r in results
            if r["multi"] and r.get("prevClass") in ("padded", "single_real")
        ],
    }
    (ROOT / "data/enrichment/wave18-promote.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wave18 promote multi={out['nowMulti']}/{out['tried']} newly={len(out['newlyMultiIds'])}")


if __name__ == "__main__":
    main()
