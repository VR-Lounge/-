#!/usr/bin/env python3
"""Wave 21: highest-price padded→true multi. Exact-model only."""
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
UA = "Mozilla/5.0 (compatible; MELOMANIAK-w21-promote/1.0)"
MIN_BYTES = 10_000
TARGET = 4
DHASH_MAX = 5
HASH_SIZE = 8

WP = "https://xn--80aannlcfckh.xn--p1ai/wp-content/uploads"
BC = "https://cdn11.bigcommerce.com/s-1jr7uauyna/images/stencil/2048w/products"
CA = "https://media.canvayo.com/uploads/sites/d4fd7a65cf63ff4ae78c61cfd8aa64ef/2026/05"
TF = "https://www.technologyfactory.eu/data/articles/images/lightbox/big"
HH = "https://cdn.shopify.com/s/files/1/2197/6387/files"
WH = "https://www.wharfedale.co.uk/cdn/shop/files"
AP = "https://www.advanceparis.com/wp-content/uploads/2022/05"
AR = "https://www.arcam.co.uk/ugc-1"

OEM_PACKS: dict[int, list[str]] = {
    # Audio Physic Scorpio 25
    34699: [
        f"{WP}/2018/03/Audio_Physic_Scorpio_25-1.jpg",
        "https://coolstuff.com.ua/image/data/old_product/15054/15054.jpg",
        "https://coolstuff.com.ua/image/data/old_product/15055/15055.jpg",
        "https://coolstuff.com.ua/image/data/old_product/15056/15056.jpg",
        "https://coolstuff.com.ua/image/data/old_product/15058/15058.jpg",
    ],
    # Clearaudio Emotion SE Package II + I (same chassis)
    272560: [
        f"{CA}/Hero-Product-LW-Emotion.jpg",
        f"{CA}/LW-Emotion-SE-Det1-11-11.jpg",
        f"{CA}/LW-Emotion-SE-Det2-11-11-LR.jpg",
        f"{CA}/LW-Emotion-SE-Det3-11-11-LR.jpg",
        f"{CA}/LW-Emotion-SE-TAB-Artist-det4-2017-08.jpg",
        f"{CA}/teaser-emotion-se.jpg",
        f"{TF}/clearaudio-emotion-se_18750_0.jpg",
        f"{TF}/clearaudio-emotion-se_18750_1.jpg",
        f"{TF}/clearaudio-emotion-se_18750_2.jpg",
        f"{TF}/clearaudio-emotion-se_18750_3.jpg",
        f"{WP}/2025/clearaudio_emotion_se_packet_i_2925707696-1.jpg",
    ],
    272558: [
        f"{CA}/Hero-Product-LW-Emotion.jpg",
        f"{CA}/LW-Emotion-SE-Det1-11-11.jpg",
        f"{CA}/LW-Emotion-SE-Det2-11-11-LR.jpg",
        f"{CA}/LW-Emotion-SE-Det3-11-11-LR.jpg",
        f"{CA}/LW-Emotion-SE-TAB-Artist-det4-2017-08.jpg",
        f"{TF}/clearaudio-emotion-se_18750_0.jpg",
        f"{TF}/clearaudio-emotion-se_18750_1.jpg",
        f"{TF}/clearaudio-emotion-se_18750_2.jpg",
        f"{TF}/clearaudio-emotion-se_18750_3.jpg",
        f"{WP}/2025/clearaudio_emotion_se_packet_i_2925707696-1.jpg",
    ],
    # Acoustic Energy AE 520 (not AE520²)
    274575: [
        f"{WP}/2025/04/ae-520-new-w950-ae-mpic-0-1597953317.jpg",
        f"{WP}/2025/04/ae-520-new-w950-ae-mpic-0-1597953323.jpg",
        f"{WP}/2025/04/ae-520-new-w950-ae-mpic-0-1597953329.jpg",
        f"{WP}/2025/04/ae-520-new-w950-ae-mpic-0-1597953334.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/2020/08/520-Web-Banner-Walnut-Front.jpg",
        f"{HH}/AE520-Walnut_800x_4c415351-2e85-4c29-a525-760de1408a83.jpg",
        f"{HH}/AE520-Walnut-Grille_800x_654f9ee5-0e55-41fe-a470-27594d7ff709.jpg",
        f"{HH}/AE520-Black_800x_8506907b-c91d-4a9a-bcb1-47a8672c8e63.jpg",
        f"{HH}/AE520-Black-Grille_800x_d71fd3f3-f01c-41a8-82f6-0201a52204f9.jpg",
        f"{HH}/AE520-White_800x_430a7356-09f2-4b7c-8687-4704b6e45295.jpg",
        f"{HH}/AE520-Black_800x_791b676c-6d5a-425d-bcee-0522df5ec891.jpg",
        f"{HH}/AE520-Walnut_800x_2fb3c232-c26d-4c7d-b0ef-5dee3e3edf61.jpg",
    ],
    # Arcam PA720
    270778: [
        f"{AR}/product/197/526_large.jpg",
        f"{AR}/product/197/563_large.jpg",
        f"{AR}/productalternate/197/39_main.jpg",
        f"{WP}/2025/arcam_pa720_10392255257-1.jpg",
        f"{WP}/2025/arcam_pa720_10392263454-2.jpg",
        f"{WP}/2025/arcam_pa720-3.jpg",
    ],
    # Anthem MCA 525 Gen 2
    261835: [
        f"{BC}/123/640/MCA-525-Gen-2_-_FRONT__70418.1765835573.png",
        f"{BC}/123/639/MCA-525-Gen-2_-_FRONT-3qtr__36824.1765835573.png",
        f"{BC}/123/705/MCA-525-Gen2-BACK__66669.1770155932.png",
        f"{BC}/123/704/MCA-525-Gen2-BACK-3qtr__17157.1770155932.png",
    ],
    # Wharfedale Aura 4
    270652: [
        f"{WH}/AURA4_Standard_Black_1_c607bb00-81f5-45e8-a603-4e5579e91a8b.jpg",
        f"{WH}/AURA4_Standard_Black_2_1b1acaed-5eda-44e8-a494-704aa354cfe9.jpg",
        f"{WH}/AURA4_Standard_Walnut_1.jpg",
        f"{WH}/AURA4_Standard_White_1.jpg",
        f"{WH}/AURA_4_Black_Lifestyle-2_1.jpg",
        f"{WH}/AURA_4_Cabinet.jpg",
        f"{WH}/20231130122914_2023-11-11_WharfedaleAura4_Lifestyle03.jpg",
        f"{WP}/2025/wharfedale_aura_4_1226911419-1.jpg",
        f"{WP}/2025/wharfedale_aura_4_1226911975-2.jpg",
        f"{WP}/2025/wharfedale_aura_4-8.jpg",
    ],
    # Advance Paris X-i1100
    267642: [
        f"{AP}/ADP-A-1000x1000-X_i1100-1.png",
        f"{AP}/ADP-A-1000x1000-X_i1100-2.png",
        f"{AP}/ADP-A-1000x1000-X_i1100-4.png",
        f"{AP}/ADP-A-1000x1000-X_i1100-5.png",
    ],
    # Acoustic Energy AE 509 (exact, not ²)
    274568: [
        f"{WP}/2025/04/ae-509-w950-ae-mpic-0-1561806904.jpg",
        f"{WP}/2025/04/ae-509-w950-ae-mpic-0-1561806935.jpg",
        "https://www.acoustic-energy.co.uk/wp-content/uploads/AE509-Walnut.jpg",
        "https://web.archive.org/web/20210601im_/https://www.acoustic-energy.co.uk/wp-content/uploads/AE509-Walnut.jpg",
    ],
    # Paradigm Founder 90C finishes
    261873: [f"https://www.paradigm.com/{i}-large_default/founder-90c.jpg" for i in list(range(2924, 2941)) + list(range(3586, 3591))],
    261875: [f"https://www.paradigm.com/{i}-large_default/founder-90c.jpg" for i in list(range(2924, 2941)) + list(range(3586, 3591))],
    261876: [f"https://www.paradigm.com/{i}-large_default/founder-90c.jpg" for i in list(range(2924, 2941)) + list(range(3586, 3591))],
    261877: [f"https://www.paradigm.com/{i}-large_default/founder-90c.jpg" for i in list(range(2924, 2941)) + list(range(3586, 3591))],
    # Parasound ZoneMaster 12 — keep existing + try OEM
    269782: [
        "https://images.squarespace-cdn.com/content/v1/5e9ae6aefbbac82692909731/1603712274707-0474P107J0CGS4GU1ALS/zm12-front.jpg",
        "https://images.squarespace-cdn.com/content/v1/5e9ae6aefbbac82692909731/1603712275875-D9T13TC48N8PKQX248IN/zm12-rear.jpg",
        "https://images.squarespace-cdn.com/content/v1/5e9ae6aefbbac82692909731/1603712274165-M1GT9Q6TXHZO326JGQOU/zm12-angle.jpg",
    ],
}

LOCAL_GLOBS: dict[int, list[str]] = {
    34699: ["*Scorpio*25*", "*scorpio*25*"],
    272560: ["*Emotion*SE*", "*emotion*se*", "*clearaudio*emotion*"],
    272558: ["*Emotion*SE*", "*emotion*se*", "*clearaudio*emotion*"],
    274575: ["*ae-520*", "*AE520*", "*ae_520*"],
    270778: ["*pa720*", "*PA720*", "*arcam_pa720*"],
    261835: ["*MCA*525*", "*MCS525*", "*mca*525*"],
    270652: ["*aura_4*", "*Aura*4*", "*AURA4*"],
    267642: ["*X-i1100*", "*Xi1100*", "*xi1100*"],
    274568: ["*ae-509*", "*AE509*", "*ae_509*"],
    261873: ["*founder*90c*", "*Founder*90C*"],
    261875: ["*founder*90c*", "*Founder*90C*"],
    261876: ["*founder*90c*", "*Founder*90C*"],
    261877: ["*founder*90c*", "*Founder*90C*"],
    269782: ["*ZoneMaster*", "*zm12*", "*zonemaster*"],
}

WRONG_MODEL: dict[int, list[str]] = {
    274575: ["AE520²", "AE520%C2%B2", "ae5202", "AE509", "ae-509"],
    274568: ["AE509²", "AE509%C2%B2", "ae5092", "AE520", "ae-520"],
    34699: ["Scorpio II", "scorpio_ii", "Scorpio_II", "25 Plus", "25+"],
    32248: ["moon", "sim-audio", "760a"],  # strip wrong Moon image if present
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
        ok = (
            data[:3] == b"\xff\xd8\xff"
            or data[:8] == b"\x89PNG\r\n\x1a\n"
            or b"WEBP" in data[:16]
            or "image" in ctype
        )
        if not ok:
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
                if pid == 274575 and ("ae509" in low or "ae-509" in low or "5202" in low):
                    continue
                if pid == 274568 and ("ae520" in low or "ae-520" in low or "5092" in low):
                    continue
                if pid == 34699 and ("scorpio_ii" in low or "scorpio ii" in low):
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
                        "from": "from-live-w21",
                        "wave": "gallery-w21-2026-11",
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
        dest = asset / f"{hsh}_w21{ext_of(url)}"
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
                "from": "oem-w21",
                "wave": "gallery-w21-2026-11",
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
            "HITL gallery: <4 distinct perceptual angles after w21 OEM hunt.",
        ):
            note = note.replace(tag, "").strip()
        d["enrichmentNote"] = note
    else:
        tag = " HITL gallery: <4 distinct perceptual angles after w21 OEM hunt."
        if "after w21" not in note:
            d["enrichmentNote"] = (note + tag).strip()
    d["galleryDepaddedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    d["galleryWave21"] = True
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

    targets = sorted(OEM_PACKS.keys(), key=lambda p: -(price.get(p) or 0))
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
    (ROOT / "data/enrichment/wave21-promote.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wave21 promote multi={out['nowMulti']}/{out['tried']} newly={len(newly)}")
    print("newly:", newly)


if __name__ == "__main__":
    main()
