#!/usr/bin/env python3
"""Wave 55: promote highest-price padded → true_multi_angle (strict model/finish)."""
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

PACKS: dict[int, list[str]] = {
    # Paradigm Premier 500C Gloss Black — Crutchfield F/B/o1/o2 + Gibbys Main.
    41449: [
        "assets/enriched/_w55_staging/41449/00_cf_front.jpg",
        "assets/enriched/_w55_staging/41449/01_cf_rear.jpg",
        "assets/enriched/_w55_staging/41449/02_cf_o1.jpg",
        "assets/enriched/_w55_staging/41449/03_cf_o2.jpg",
        "assets/enriched/_w55_staging/41449/04_gib_main.png",
    ],
    # Paradigm Premier 500C Gloss White — CF rear/o2 + OEM cropped front/grille + Gibbys rear.
    41451: [
        "assets/enriched/_w55_staging/41451/00_cf_rear.jpg",
        "assets/enriched/_w55_staging/41451/01_cf_o2.jpg",
        "assets/enriched/_w55_staging/41451/02_pd_front.jpg",
        "assets/enriched/_w55_staging/41451/03_pd_grille.jpg",
        "assets/enriched/_w55_staging/41451/04_gib_rear.png",
    ],
    # Paradigm Premier 200B Espresso — CF drivers + rear (200B badge) + OEM grille.
    41435: [
        "assets/enriched/_w55_staging/41435/00_cf_drivers_o2.jpg",
        "assets/enriched/_w55_staging/41435/01_cf_drivers_o3.jpg",
        "assets/enriched/_w55_staging/41435/02_cf_rear.jpg",
        "assets/enriched/_w55_staging/41435/03_pd_grille.jpg",
    ],
    # Paradigm Premier 200B Gloss White — CF front/stand/drivers + OEM grille.
    41433: [
        "assets/enriched/_w55_staging/41433/00_cf_front.jpg",
        "assets/enriched/_w55_staging/41433/01_cf_stand.jpg",
        "assets/enriched/_w55_staging/41433/02_cf_drivers.jpg",
        "assets/enriched/_w55_staging/41433/03_pd_grille.jpg",
    ],
    # Paradigm Premier 200B Gloss Black — CF front/drivers/stand + OEM grille/drivers (no 100B rear).
    41431: [
        "assets/enriched/_w55_staging/41431/00_cf_front.jpg",
        "assets/enriched/_w55_staging/41431/01_cf_drivers.jpg",
        "assets/enriched/_w55_staging/41431/02_cf_stand.jpg",
        "assets/enriched/_w55_staging/41431/03_pd_grille.jpg",
        "assets/enriched/_w55_staging/41431/04_pd_drivers.jpg",
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
        dest = out_dir / f"{pid}_w55_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w55_{i:02d}.jpg"
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
                "attribution": "wave55-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave55"] = True
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
    out = ROOT / "data" / "enrichment" / "wave55-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
