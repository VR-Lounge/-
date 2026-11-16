#!/usr/bin/env python3
"""Wave 23: HITL padded→true multi (strict model match)."""
from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
ENR = ROOT / "assets" / "enriched"
SRC = Path("/tmp/w23")
HASH_SIZE = 8
DHASH_THRESH = 5
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Exact-model allowlists only (src under /tmp/w23/{pid}/)
PACKS: dict[int, list[str]] = {
    # Audio Physic Scorpio II — Choice Hifi live (NOT Scorpio 25 / concert junk)
    15606: [
        "DSC_0116.jpg",
        "DSC_0117.jpg",
        "DSC_0118.jpg",
        "DSC_0119.jpg",
        "DSC_0120.jpg",
        "ufe1zjasj47phykidthgpgksul4gqtzf_4c4f23edd2.jpg",
    ],
    # Soulnote sd2.0 — dealer + yoshidaen OEM detail (NOT D-2)
    268034: [
        "g1.jpeg",
        "g2.jpg",
        "sd20_top.jpg",
        "sd2.0_naibu.jpg",
        "sd20input.jpg",
    ],
    # Trigon Energy — OEM trigon-audio.de (strip wrong AE12 from gallery)
    16804: [
        "energy_si_front_weiss.jpg",
        "energy_back_weiss.jpg",
        "energy_si_bl_3d_weiss.jpg",
        "energy_bl_front_weiss.jpg",
        "energy_chr_front_weiss.jpg",
        "739b5c8534_integralnii_ysilitel_Trigon_Energy.jpg",
    ],
    # Triode TRV-88SER — StereoNET review + OEM (NOT 88SE/88XR)
    16822: [
        "_DSC7895.jpg",
        "_DSC7897.jpg",
        "_DSC7900.jpg",
        "_DSC7906.jpg",
        "TRV-88SER-Rear.jpg",
        "TRV-88SER-Remote.jpg",
        "Triode_TRV-88SER.jpg",
        "trv-88ser.jpg",
        "f6807fc040_integralnii_ysilitel_Triode_TRV_88SER.jpg",
    ],
    # ProAc Tablette Anniversary cherry — TMR + labeled rear (NOT Tablette 10 Signature / install guide)
    24490: [
        "59e196ca61_ccbf18d56ab1ad77fbe582508843be2d.jpg",
        "981e7ccb28_b927eb0eb40cb6af064433d91a828d82.jpg",
        "tmr_5.jpg",
        "tmr_6.jpg",
        "tmr_4.jpg",
    ],
    # Soulnote C1 — OEM soulnote.co.jp (NOT C-3 / A-1)
    262135: [
        "C-1_top800x693.jpg",
        "C-1_botom700x822.jpg",
        "C-1_trans_spike700x651.jpg",
        "C-1B_front980x341b.jpg",
        "C-1S_front980x341b.jpg",
        "c-1_furi_b980x341.jpg",
        "d456795186_Soulnote-C-1-b.jpg",
        "fa2131aa23_Soulnote-C-1-rear.jpg",
        "7f048c2edd_w13var.jpg",
    ],
    # Acoustic Energy AE509 — IL OEM + archive (NOT AE509² / AE500 / AE520)
    274568: [
        "AE509-Walnut-no-grille.jpg",
        "lifestyle.webp",
        "AE509-Bass-Driver_new-1.webp",
        "AE509-Rear_new-1.webp",
        "AE509-Spike_new-1-e1672681210712.webp",
    ],
    # Triode TRV-EQ3SE — Fujisawa live front/rear + from-live (NOT TRX / EQ7)
    15860: [
        "front.jpg",
        "rear.jpg",
        "d68ac90817_triode-trv-eq3se.jpg",
        "769358d99d_triode-trv-eq3se-1.jpg",
        "4544a8d6fb_lampovii_fonokorrektor_Triode_TRV_EQ3SE.jpg",
    ],
    # Audio Research DS450 — ARC flyer panels + live black (NOT DS450M)
    42427: [
        "pdf_0_43_600x300.png",
        "ds_silver_34.png",
        "ds_black_front.png",
        "ds_silver_rear.png",
        "live_front_black.jpg",
        "live_rear_black.jpg",
        "b4f2b8f617_684_DS450_3.jpg",
        "como.jpg",
    ],
}


def dhash(path: Path) -> int:
    with Image.open(path) as im:
        im = im.convert("L").resize((HASH_SIZE + 1, HASH_SIZE), Image.Resampling.BILINEAR)
        pixels = list(im.getdata())
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            if pixels[row * (HASH_SIZE + 1) + col] > pixels[row * (HASH_SIZE + 1) + col + 1]:
                bits |= 1 << (row * HASH_SIZE + col)
    return bits


def ham(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def is_image(path: Path) -> bool:
    if path.stat().st_size < 8000:
        return False
    head = path.read_bytes()[:60]
    if b"<html" in head.lower() or b"<!doc" in head.lower():
        return False
    try:
        with Image.open(path) as im:
            return min(im.size) >= 80
    except Exception:
        return False


def cluster(paths: list[Path]) -> list[Path]:
    reps: list[Path] = []
    hs: list[int] = []
    for f in sorted(paths, key=lambda p: (-p.stat().st_size, str(p))):
        if not is_image(f):
            continue
        try:
            h = dhash(f)
        except Exception:
            continue
        if any(ham(h, rh) <= DHASH_THRESH for rh in hs):
            continue
        hs.append(h)
        reps.append(f)
    return reps


def ingest(pid: int, names: list[str]) -> list[Path]:
    src_dir = SRC / str(pid)
    dest_dir = ENR / str(pid)
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    for name in names:
        src = src_dir / name
        if not src.exists() or not is_image(src):
            continue
        digest = hashlib.sha256(src.read_bytes()).hexdigest()[:10]
        dest = dest_dir / f"{digest}_w23{src.suffix.lower()}"
        if not dest.exists():
            shutil.copy2(src, dest)
        out.append(dest)
    return out


def promote(pid: int, files: list[str]) -> dict:
    pdp_path = PDP / f"{pid}.json"
    pdp = json.loads(pdp_path.read_text())
    before = len(pdp.get("gallery") or [])
    ingested = ingest(pid, files)
    unique = cluster(ingested)
    multi = len(unique) >= 4
    result = {
        "id": pid,
        "name": str(pdp.get("name", ""))[:70],
        "price": pdp.get("price"),
        "before": before,
        "after": len(unique),
        "multi": multi,
        "hitl": not multi,
        "files": [f.name for f in unique[:8]],
    }
    if not multi:
        return result
    pdp["gallery"] = [f"assets/enriched/{pid}/{f.name}" for f in unique[:8]]
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave23"] = True
    pdp_path.write_text(json.dumps(pdp, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> None:
    results = []
    for pid, files in PACKS.items():
        r = promote(pid, files)
        results.append(r)
        print(f"{pid}: after={r['after']} multi={r['multi']} p={r['price']} {r['name'][:50]}")
    cleared = [r["id"] for r in results if r["multi"]]
    out = {
        "wave": "wave23",
        "at": NOW,
        "paddedToTrue": len(cleared),
        "newlyMultiIds": cleared,
        "results": results,
    }
    path = ROOT / "data" / "enrichment" / "wave23-promote.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print("CLEARED", cleared)


if __name__ == "__main__":
    main()
