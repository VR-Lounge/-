#!/usr/bin/env python3
"""Wave 33: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
HASH_SIZE = 8
DHASH_THRESH = 5
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Exact-model allowlists only (absolute or repo-relative paths).
PACKS: dict[int, list[str]] = {
    # Mission LX-5 MKII walnut — live pair/grille/rear + Hashstar walnut single
    273358: [
        "assets/from-live/products/2e00f29ddc_mission_lx-5_mkii_10921302726-1.jpg",
        "assets/from-live/products/339cc1ae66_mission_lx-5_mkii_10921304322-2.jpg",
        "assets/from-live/products/841df055ac_mission_lx-5_mkii_10921336536-3.jpg",
        "/tmp/w33/273358/h29818.jpg",
    ],
    # Mission LX-C2 MKII walnut — live front/grille/labeled rear + Hashstar walnut angles
    273424: [
        "assets/from-live/products/de38ea5d3d_mission_lx-c2_mkii_10928046751-1.jpg",
        "assets/from-live/products/0cfb9710a8_mission_lx-c2_mkii_10928048579-2.jpg",
        "assets/from-live/products/2f486625ca_mission_lx-c2_mkii_10928077833-3.jpg",
        "/tmp/w33/273424/h29836.jpg",
        "/tmp/w33/273424/h29835.jpg",
    ],
    # Mission LX-6 MKII walnut — live pair + rear + Hashstar walnut + Electricshop grille pair
    273330: [
        "assets/from-live/products/4c68d5b8f1_mission_lx-6_mkii1.jpg",
        "assets/from-live/products/ce6ef6a701_mission_lx-6_mkii3.jpg",
        "/tmp/w33/273330/h29824.jpg",
        "/tmp/w33/273330/es_a.jpg",
    ],
    # Davis Atmosphere MK2 — live pair + labeled MK2 rear + HCS front/grille/high-angle
    # (reject live rear with wrong Atmosphere specs: 88dB/60W/2-driver)
    274498: [
        "assets/from-live/hero/da7a033c07_atmosphere-mk2-par.png",
        "assets/enriched/274498/239aeb937c_w13var.jpg",
        "/tmp/w33/274498/hcs1.jpg",
        "/tmp/w33/274498/hcs2.jpg",
        "/tmp/w33/274498/hcs3.jpg",
    ],
    # Tonewinner AT-2000 — labeled front + rear + 3/4 + OEM straight front
    # (reject lifestyle/PCB/logo tinymce; reject Advance Paris alioss poison)
    274403: [
        "assets/from-live/products/eb17bc8993_tonewinner-at-2000-724-dolby-atmos-dts-x-av-resiver_id17_1.jpg",
        "assets/from-live/products/8c3822191c_tonewinner-at-2000-724-dolby-atmos-dts-x-av-resiver_id17_3.jpg",
        "assets/enriched/274403/3b518932fe_1.jpg",
        "/tmp/w33/274403/alioss_2026031210223596200.png",
    ],
}


def _pixels(path: Path, size: tuple[int, int]) -> list[int] | None:
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize(size, Image.Resampling.BILINEAR)
            return list(im.getdata())
    except Exception:
        return None


def dhash_bits(path: Path) -> int | None:
    pixels = _pixels(path, (HASH_SIZE + 1, HASH_SIZE))
    if not pixels:
        return None
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            left = pixels[row * (HASH_SIZE + 1) + col]
            right = pixels[row * (HASH_SIZE + 1) + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def resolve(p: str) -> Path:
    path = Path(p)
    if path.is_absolute():
        return path
    return ROOT / path


def promote(pid: int, files: list[str]) -> dict:
    out_dir = ENR / str(pid)
    out_dir.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    for i, src_s in enumerate(files):
        src = resolve(src_s)
        if not src.exists() or src.stat().st_size < 800:
            raise FileNotFoundError(f"{pid}: missing {src}")
        ext = src.suffix.lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"
        dest = out_dir / f"{pid}_w33_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w33_{i:02d}.jpg"
            with Image.open(dest) as im:
                im.convert("RGB").save(jpg, "JPEG", quality=92)
            if dest != jpg and dest.exists():
                dest.unlink()
            dest = jpg
        copied.append(dest)

    unique: list[Path] = []
    hashes: list[int] = []
    shas: set[str] = set()
    for f in copied:
        digest = sha256(f)
        if digest in shas:
            continue
        dh = dhash_bits(f)
        if dh is None:
            continue
        if any(hamming(dh, h) <= DHASH_THRESH for h in hashes):
            continue
        shas.add(digest)
        hashes.append(dh)
        unique.append(f)

    if len(unique) < 4:
        raise RuntimeError(f"{pid}: only {len(unique)} unique after dhash filter")

    pdp_path = PDP / f"{pid}.json"
    pdp = json.loads(pdp_path.read_text())
    before = len(pdp.get("gallery") or [])
    gallery = []
    for f in unique[:8]:
        gallery.append(
            {
                "src": f"local://{f.name}",
                "thumb": str(f.relative_to(ROOT)),
                "alt": pdp.get("name") or pdp.get("title") or str(pid),
                "local": str(f.relative_to(ROOT)),
                "enriched": True,
                "attribution": "wave33-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave33"] = True
    pdp_path.write_text(json.dumps(pdp, ensure_ascii=False, indent=2) + "\n")
    return {
        "id": pid,
        "before": before,
        "after": len(gallery),
        "unique": len(unique),
        "files": [str(f.relative_to(ROOT)) for f in unique[:8]],
    }


def main() -> None:
    results = []
    for pid, files in PACKS.items():
        results.append(promote(pid, files))
        print(f"OK {pid} → {results[-1]['unique']} unique")
    out = ROOT / "data" / "enrichment" / "wave33-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
