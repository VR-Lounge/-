#!/usr/bin/env python3
"""Wave 48: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Furutech e-TP80ES NCF Schuko 8-outlet (reject G-314 included cord / e-TP60E 6-socket)
    264249: [
        "assets/enriched/_w48_staging/264249/00_map_hero.jpg",
        "assets/enriched/_w48_staging/264249/01_map_hero2.jpg",
        "assets/enriched/_w48_staging/264249/02_map_inlet.jpg",
        "assets/enriched/_w48_staging/264249/03_map_outlets_nf.jpg",
        "assets/enriched/_w48_staging/264249/04_map_outlets_f.jpg",
        "assets/enriched/_w48_staging/264249/05_map_brand.jpg",
        "assets/enriched/_w48_staging/264249/06_map_zones.jpg",
        "assets/enriched/_w48_staging/264249/07_ap_hero.jpg",
    ],
    # AudioQuest Carbon digital coax RCA (reject USB/HDMI/optical Carbon, turntable poison)
    272824: [
        "assets/enriched/_w48_staging/272824/00_live.jpg",
        "assets/enriched/_w48_staging/272824/01_md_pair.jpg",
        "assets/enriched/_w48_staging/272824/02_aq_pair.jpg",
        "assets/enriched/_w48_staging/272824/03_aq_alt.jpg",
        "assets/enriched/_w48_staging/272824/04_ds_single.jpg",
        "assets/enriched/_w48_staging/272824/05_ds_angle.jpg",
    ],
    # Furutech FI-E48 NCF(R) Schuko (reject FI-E50 / black-band non-NCF / FI-48 IEC)
    264153: [
        "assets/enriched/_w48_staging/264153/00_hcs_face.jpg",
        "assets/enriched/_w48_staging/264153/01_hcs_dual.jpg",
        "assets/enriched/_w48_staging/264153/02_oem_dual.jpg",
        "assets/enriched/_w48_staging/264153/03_ap_inpage.jpg",
    ],
    # Furutech G-314 Ag-15 Plus E Schuko (reject NEMA Absolute/G-314 US OEM)
    264360: [
        "assets/enriched/_w48_staging/264360/00_live_schuko.jpg",
        "assets/enriched/_w48_staging/264360/01_map_bundle.jpg",
        "assets/enriched/_w48_staging/264360/02_map_schuko.jpg",
        "assets/enriched/_w48_staging/264360/03_ap_coil.jpg",
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
        dest = out_dir / f"{pid}_w48_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w48_{i:02d}.jpg"
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
                "attribution": "wave48-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave48"] = True
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
    out = ROOT / "data" / "enrichment" / "wave48-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
