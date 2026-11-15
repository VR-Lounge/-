#!/usr/bin/env python3
"""Wave 22: promote HITL high-price padded galleries to true multi-angle (strict model)."""
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
SRC = Path("/tmp/w22")
HASH_SIZE = 8
DHASH_THRESH = 5
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Per-PID allowlists of source filenames under /tmp/w22/{pid}/ (exact-model only)
PACKS: dict[int, list[str]] = {
    # McIntosh RS100 — OEM mcintoshlabs productimages
    32248: [
        "rs100-angle-left-no-grille.jpg",
        "rs100-angle-right-grille-j.jpg",
        "rs100-back-angle.jpg",
        "rs100-pair-grille-no-grille-phone.jpg",
        "rs100-m1-6828.jpg",
        "wom-rs100.jpg",
        "rs100-lifestyle-chairs.jpg",
    ],
    # Anthem Statement D2v 3D — review OEM + from-live
    24768: [
        "fig1.jpg",
        "fig2-lg.jpg",
        "fig3-lg.jpg",
        "fig4-lg.jpg",
        "featured.jpg",
        "82cfa6a8ae_anthem_d2v_3d_4.jpg",
        "AV_protsessor_Anthem_Statement_D2v_3D_ea482768a7.jpg",
    ],
    # Parasound ZoneMaster 12 — official parasound.com + from-live
    269782: [
        "zm12-front_black.jpg",
        "zm12-rear_black.jpg",
        "zm12-high_angle_black.jpg",
        "alt_front.jpg",
        "bc_zm12.jpg",
        "07f10c05c4_depad.jpg",
        "66491dc6df_depad.jpg",
        "721ec20dbb_w21.jpg",
    ],
    # MOON 260D Black — dealer + from-live + confirmed rear (no North Collection)
    270148: [
        "ss_1.jpg",
        "ss_2.jpg",
        "ss_3.jpg",
        "f552429c5a_w17sc95.jpg",
        "599ed62cbd_moon_260d_black3.jpg",
        "a58c189db6_moon_260d_black_4044835544-1.jpg",
        "7d144305c1_moon_260d_black2.jpg",
    ],
    # Leben CS-300F — lebenhifi OEM cs300f_* only (not CS300X)
    15916: [
        "cs300f_1.jpg",
        "cs300f_2.jpg",
        "cs300f_3.jpg",
        "cs300f_4.jpg",
        "cs300f_5.jpg",
    ],
    # Audionet SAM v2 / G2 / 20 SE — exclude MAX/ART/AMP
    26626: [
        "sam_g2_front.jpg",
        "sam_g2_back.jpg",
        "sam_g2_b_b.png",
        "sam_g2_s_b.png",
        "2210ed7c3e_Audionet-SAM-v2-back-500x300-1.jpg",
        "05d9517578_integralnii_ysilitel_AudioNet_SAM_v-2-0_.jpg",
        "07fa7e565e_integralnii_ysilitel_Audionet_Sam_G2.jpg",
        "sam-20-se.png",
    ],
    # Soulnote A-1 — dealer OEM labeled A-1
    262133: [
        "2000_63c009041f608.jpg",
        "2000_63c0090e7e64c.jpg",
        "2000_63c0090e84a1e.jpg",
        "2000_63c0090e82974.jpg",
        "59255b7454_soulnote_a1.jpg",
        "gal2.jpg",
        "a1_audionation.jpg",
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
            w, h = im.size
        return min(w, h) >= 80
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
        dest = dest_dir / f"{digest}_w22{src.suffix.lower()}"
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
    gallery = [f"assets/enriched/{pid}/{f.name}" for f in unique[:8]]
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave22"] = True
    pdp_path.write_text(json.dumps(pdp, ensure_ascii=False, indent=2) + "\n")
    return result


def main() -> None:
    results = []
    for pid, files in PACKS.items():
        r = promote(pid, files)
        results.append(r)
        print(
            f"{pid}: after={r['after']} multi={r['multi']} "
            f"p={r['price']} {r['name'][:50]}"
        )
    cleared = [r["id"] for r in results if r["multi"]]
    out = {
        "wave": "wave22",
        "at": NOW,
        "paddedToTrue": len(cleared),
        "newlyMultiIds": cleared,
        "results": results,
    }
    path = ROOT / "data" / "enrichment" / "wave22-promote.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print("CLEARED", cleared)
    print("wrote", path)


if __name__ == "__main__":
    main()
