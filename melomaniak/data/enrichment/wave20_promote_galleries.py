#!/usr/bin/env python3
"""Wave 20: HITL-first padded→true multi, then next-highest price.

Exact-model OEM / press / from-live / archive only. No scale/rotate inventing.
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
FROM_HERO = ROOT / "assets" / "from-live" / "hero"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-w20-promote/1.0)"
MIN_BYTES = 10_000
TARGET = 4
DHASH_MAX = 5
HASH_SIZE = 8

WB = "https://web.archive.org/web/20200301im_/https://www.monitoraudio.com/site/assets/files"
MA = "https://www.monitoraudio.com/site/assets/files"
FA = "https://futureaudiophile.com/wp-content/uploads/2023/03"
WP = "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads"
BC = "https://cdn11.bigcommerce.com/s-1jr7uauyna/images/stencil/2048w/products/126"
SQ = "https://images.squarespace-cdn.com/content/v1/65e77329872ef146bc8bfea1"
SS = "https://www.soundstageglobal.com/images/igallery/resized"

OEM_PACKS: dict[int, list[str]] = {
    # T+A SD 3100 HV (not SDV)
    274019: [
        f"{WP}/2025/sd_3100_hv1.jpg",
        f"{WP}/2025/sd_3100_hv2.jpg",
        f"{FA}/TA-SD3100HV-DAC-Reviewed-Front.jpg",
        f"{FA}/TA-SB3100HV-DAC-Rear.jpg",
        f"{WP}/2025/psd_3100_hv_174679554-1.jpg",
        f"{WP}/2025/psd_3100_hv2.jpg",
        "https://www.hifiverse.io/storage/media/2025/76/7611/cnv/67e8f8e6e1625-lg.webp",
    ],
    # Triode TRV-P845SE
    16832: [
        "https://musmag.com/images/stories/virtuemart/product/177/650x700-63403_1.jpg",
        "https://musmag.com/images/stories/virtuemart/product/177/650x700-63403_2.jpg",
        "https://im.nazarov-gallery.ru/pic/1200/1200/upload/iblock/b83/b835210f4d6794658ab13db66995e2d2.jpg",
        f"{WP}/2018/01/ysilitel_moshnosti_Triode_TRV_P845SE.jpg",
    ],
    # ARC SP20 + VS115 combo
    261114: [
        f"{WP}/2021/01/sp20vs115-1.jpg",
        f"{SS}/1701-1800/IMG_1436-1800-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1437-1801-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1441-1802-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1442-1803-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1444-1804-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1447-1805-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1449-1806-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
        f"{SS}/1801-1900/IMG_1452-1807-1200-800-90-wm-right_bottom-100-ssnwatermark2png.jpg",
    ],
    # Soulnote D-2 / D2 ver.2 (exclude D-3)
    262129: [
        f"{WP}/2021/10/Soulnote-D-2-SE.jpg",
        f"{WP}/2021/10/Soulnote-D-2-SE-rear-500x193-1.jpg",
        f"{SQ}/70d72ee3-a8b8-4bcb-82c8-2dd976d5d3aa/Walden+High-End+Audio+Soulnote+D2+ver2+Digital+to+Analogue+Converter+0.png",
        f"{SQ}/a69b43a0-7863-47dc-a32b-3e66cf12cd90/Walden+High-End+Audio+Soulnote+D2+ver2+Digital+to+Analogue+Converter+4.jpeg",
        f"{SQ}/c7df8289-4dc7-49b2-a412-c9459b2afeb6/Walden+High-End+Audio+Soulnote+D2+ver2+Digital+to+Analogue+Converter+5.jpeg",
        f"{SQ}/6c79ca65-6dd2-4108-b35c-00b0386ae22b/Walden+High-End+Audio+Soulnote+D-2+ver.2+Digital-to-Analogue+Converter?format=2500w",
        f"{SQ}/fc19c85c-0866-4853-b43b-80713c5b963f/Walden+High-End+Audio+Soulnote+D-2+ver.2+Digital-to-Analogue+Converter?format=2500w",
        f"{SQ}/9c47ab67-e30c-4e11-85fc-09a1d98b4274/Walden+High-End+Audio+Soulnote+D-2+Digital-to-Analogue+Converter?format=2500w",
    ],
    # Anthem Statement P2
    25156: [
        f"{WP}/2020/02/Anthem-P2-Back.jpg",
        f"{WP}/2018/01/ysilitel_moshnosti_Anthem_Statement_P_2_BL.jpg",
        f"{BC}/603/Statement-P2-Front__28789.1775505375.png",
        f"{BC}/458/Statement-P2-Frpnt-3qtr__09159.1762808621.png",
        f"{BC}/699/Statement-P2-Back__27978.1770155800.png",
        f"{BC}/698/Statement-P2-Back-3qtr__10931.1770155800.png",
        "https://cdn.shopify.com/s/files/1/0013/7412/6189/products/P2.jpg",
        "https://cdn.shopify.com/s/files/1/0013/7412/6189/products/P2_2.jpg",
        "https://cdn.shopify.com/s/files/1/0013/7412/6189/products/P2_3.jpg",
        "https://cdn.shopify.com/s/files/1/0013/7412/6189/products/P2_4.jpg",
    ],
    # Monitor Audio Gold 500 6G
    271070: [
        f"{MA}/54554/ma_gold6g_500_iso_gloss-black-1.jpg",
        f"{MA}/54555/ma_gold6g_500_iso_gloss-black_grille-1.jpg",
        f"{MA}/54556/ma_gold6g_500_iso_macassar-1.jpg",
        f"{MA}/54560/ma_gold6g_500_front_macassar-1.jpg",
        f"{MA}/54561/ma_gold6g_500_back_macassar-1.jpg",
        f"{MA}/54574/gold-500-life.2000x0.jpg",
        f"{WP}/2025/monitor_audio_gold_500_6g_4829953124-1.jpg",
        f"{WP}/2025/monitor_audio_gold_500_6g_4829953764-2.jpg",
        f"{WP}/2025/monitor_audio_gold_500_6g4.jpg",
    ],
    # Monitor Audio Gold 300 5G (exact 5G — wayback OEM)
    271065: [
        f"{WB}/26859/ma_gold_300_black_iso-1.jpg",
        f"{WB}/26863/ma_gold_300_black_front-1.jpg",
        f"{WB}/26865/ma_gold_300_white_back-1.jpg",
        f"{WB}/24954/ma_gold_300_lifestyle-1.jpg",
        f"{WB}/26860/ma_gold_300_walnut_iso-1.jpg",
        f"{WP}/2025/monitor_audio_gold_300_5g_11358644044-1.jpg",
        f"{WP}/2025/monitor_audio_gold_300_5g_11358707249-2.jpg",
        f"{WP}/2025/monitor_audio_gold_300_5g_11358729657-3.jpg",
        f"{WP}/2025/monitor_audio_gold_300_5g4.jpg",
    ],
    # Lawrence Audio Violin SE (no Acapella / no brand-only banners)
    4318: [
        f"{WP}/2018/01/napolnaia_akystika_Lawrence_Audio_Violin_SE.jpg",
        f"{WP}/2018/01/napolnaia_akystika_Lawrence_Audio_Violin.jpg",
        "http://www.lawrenceaudio.com/Uploads/ClinicService/36da77c3-0357-4bef-928a-e5013a9367f3.jpg",
        "https://web.hocom.tw/ckfinder/connector?command=Proxy&type=Images&currentFolder=%2f&fileName=violin(1).jpg",
        "https://cdn.shopify.com/s/files/1/0844/4225/1545/files/56628-3__93109.1705344556.1280.1280.jpg",
        "https://cdn.shopify.com/s/files/1/0844/4225/1545/files/56628-4__18345.1705344556.1280.1280.jpg",
        "https://cdn.shopify.com/s/files/1/0844/4225/1545/files/56628-5__91004.1705344557.1280.1280.jpg",
        "https://cdn.shopify.com/s/files/1/0844/4225/1545/files/56628-6__01961.1705344556.1280.1280.jpg",
        "https://cdn.shopify.com/s/files/1/0844/4225/1545/files/56628-8__93821.1705344557.1280.1280.jpg",
        "https://www.opus51.fr/images/phocagallery/articletest/Syst_HiFi/opus98/DSC00301_opus98.jpg",
        "https://www.opus51.fr/images/phocagallery/articletest/Syst_HiFi/opus98/DSC00303_opus98.jpg",
        "https://www.opus51.fr/images/phocagallery/articletest/Syst_HiFi/opus98/DSC00304_opus98.jpg",
        "https://www.opus51.fr/images/phocagallery/articletest/Syst_HiFi/opus98/DSC00305_opus98.jpg",
        "https://www.opus51.fr/images/phocagallery/articletest/Syst_HiFi/opus98/DSC00306_opus98.jpg",
    ],
    # Spec RSA-M1EX
    16798: [
        f"{WP}/2018/01/integralnii_ysilitel_Spec_RSA_M1EX.jpg",
        f"{WP}/2021/10/SPEC-RSA-M1-EX-rear.jpg",
        "http://www.metex.ru/images/2013/12/spec-nastojashhee-budushhee-japonskoj-audio.jpg",
        "http://www.metex.ru/images/2013/12/spec-nastojashhee-budushhee-japonskoj-audio_2.jpg",
    ],
    # Mid/high next: Gold 300 6G OEM
    271034: [
        f"{MA}/54352/ma_gold6g_300_iso_satin-white.jpg",
        f"{MA}/54354/ma_gold6g_300_iso_gloss-black-1.jpg",
        f"{MA}/54356/ma_gold6g_300_iso_macassar-1.jpg",
        f"{MA}/54358/ma_gold6g_300_front-1.jpg",
        f"{MA}/54359/ma_gold6g_300_back-1.jpg",
        f"{WP}/2025/monitor_audio_gold_300_6g_4805340370-1.jpg",
        f"{WP}/2025/monitor_audio_gold_300_6g_4805341042-2.jpg",
        f"{WP}/2025/monitor_audio_gold_300_6g3.jpg",
        f"{WP}/2025/monitor_audio_gold_300_6g4.jpg",
    ],
}

LOCAL_GLOBS: dict[int, list[str]] = {
    274019: ["sd_3100*", "psd_3100*"],
    16832: ["*P845SE*", "*p845se*", "*TRV_P845*"],
    261114: ["*sp20*", "*VS115*", "*vs115*", "*audio-research*"],
    262129: ["*Soulnote-D-2*", "*soulnote*d*2*", "*Soulnote*D2*"],
    25156: ["*Statement_P_2*", "*Anthem-P2*", "*Anthem_Statement_P_2*"],
    271070: ["*gold_500_6g*", "*gold6g_500*"],
    271065: ["*gold_300_5g*"],
    4318: ["*Lawrence*Violin*", "*Violin_SE*", "*violin*se*"],
    16798: ["*RSA_M1*", "*RSA-M1*", "*Spec_RSA*"],
    271034: ["*gold_300_6g*", "*gold6g_300*"],
}

WRONG_MODEL: dict[int, list[str]] = {
    4318: ["acapella", "Acapella"],
    274019: ["sdv_3100", "sdv-3100", "SDV"],
    262129: ["D-3", "D3", "Soulnote-D-3"],
    271065: ["gold_300_6g", "gold6g_300", "6G"],
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
    blob = f"{g.get('src') or ''} {g.get('local') or ''}"
    return any(t in blob for t in tokens)


def download(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size >= MIN_BYTES:
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
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
            ctype = (r.headers.get("Content-Type") or "").lower()
        if len(data) < MIN_BYTES:
            return 0
        if data[:200].lstrip().startswith(b"<") or b"<html" in data[:400].lower():
            return 0
        if not (
            data[:3] == b"\xff\xd8\xff"
            or data[:8] == b"\x89PNG\r\n\x1a\n"
            or data[:4] == b"RIFF"
            or data[:4] == b"RIFF"
            or data[:4] == b"\x00\x00\x00\x0c"  # avif-ish
            or "image" in ctype
            or data[:4] == b"RIFF"
        ):
            # allow webp
            if data[:4] != b"RIFF" and b"WEBP" not in data[:16] and not data.startswith(b"\x89PNG"):
                if not (data[:3] == b"\xff\xd8\xff" or "image" in ctype):
                    return 0
        dest.write_bytes(data)
        return len(data)
    except Exception as e:
        print(f"  fail {url[-80:]}: {type(e).__name__}")
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
    for root in (FROM_LIVE, FROM_HERO):
        if not root.exists():
            continue
        for pat in patterns:
            for p in root.glob(pat):
                if not p.is_file() or p.stat().st_size < MIN_BYTES:
                    continue
                low = p.name.lower()
                if pid == 274019 and "sdv" in low:
                    continue
                if pid == 4318 and "acapella" in low:
                    continue
                if pid == 262129 and ("d-3" in low or "d3" in low.replace("soulnote", "")):
                    if re.search(r"d[-_]?3\b", low):
                        continue
                if pid == 271065 and ("6g" in low or "gold_300_6g" in low):
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
                        "from": "from-live-w20",
                        "wave": "gallery-w20-2026-11",
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
        dest = asset / f"{hsh}_w20{ext_of(url)}"
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
                "from": "oem-w20",
                "wave": "gallery-w20-2026-11",
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
    note = (d.get("enrichmentNote") or "").rstrip()
    if multi:
        for tag in (
            "HITL gallery: <4 distinct perceptual angles after w19 OEM hunt.",
            "HITL gallery: <4 distinct perceptual angles after w20 OEM hunt.",
        ):
            note = note.replace(tag, "").strip()
        d["enrichmentNote"] = note
    else:
        tag = " HITL gallery: <4 distinct perceptual angles after w20 OEM hunt."
        if "after w20" not in note:
            d["enrichmentNote"] = (note + tag).strip()
    d["galleryDepaddedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["galleryWave20"] = True
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

    # HITL first (explicit order), then OEM packs by price
    hitl_order = [274019, 16832, 261114, 262129, 25156, 271070, 271065, 4318, 16798]
    other = [p for p in OEM_PACKS if p not in hitl_order]
    other.sort(key=lambda p: -(price.get(p) or 0))
    targets = hitl_order + other

    results = []
    for pid in targets:
        if not (PDP / f"{pid}.json").exists():
            continue
        urls = OEM_PACKS.get(pid, [])
        print(f"promote {pid} urls={len(urls)} …")
        r = rebuild_gallery(pid, urls)
        r["prevClass"] = prev_class.get(pid)
        results.append(r)
        print(" ", {k: r[k] for k in ("id", "after", "multi", "hitl", "prevClass", "price")})

    newly = [
        r["id"]
        for r in results
        if r["multi"] and r.get("prevClass") in ("padded", "single_real")
    ]
    out = {
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tried": len(results),
        "nowMulti": sum(1 for r in results if r["multi"]),
        "newlyMultiIds": newly,
        "paddedToTrue": len(newly),
        "results": results,
    }
    (ROOT / "data/enrichment/wave20-promote.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wave20 promote multi={out['nowMulti']}/{out['tried']} newly={len(newly)}")
    print("newly:", newly)


if __name__ == "__main__":
    main()
