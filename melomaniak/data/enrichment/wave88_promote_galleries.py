#!/usr/bin/env python3
"""Wave 88: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Paradigm Decor 1C (75–89in) — center-only custom length.
    # Flickr OEM FRONT no-grille size band 65–84.9in + shopaudiodesign
    # 1C driver/terminal/mount details + OEM cable-management channel.
    # Reject lifestyle TV rooms, Decor 2S/2SC multi-array, grille composites.
    40251: [
        "assets/enriched/_w88_staging/40251/00_53526479622.jpg",
        "assets/enriched/_w88_staging/40251/01_d1c_05.jpg",
        "assets/enriched/_w88_staging/40251/02_d1c_07.jpg",
        "assets/enriched/_w88_staging/40251/03_d1c_08.jpg",
        "assets/enriched/_w88_staging/40251/04_0cf67dc969.jpg",
    ],
    # Paradigm Decor 2SC (75–89in) — LCR multi-array bar.
    # shopaudiodesign LCR 3/4 no-grille + terminal/mount/cable/driver details.
    # Reject Decor 1C single-array heroes, lifestyle TV composites.
    40266: [
        "assets/enriched/_w88_staging/40266/00_d1c_03.jpg",
        "assets/enriched/_w88_staging/40266/01_d1c_07.jpg",
        "assets/enriched/_w88_staging/40266/02_d1c_08.jpg",
        "assets/enriched/_w88_staging/40266/03_0cf67dc969.jpg",
        "assets/enriched/_w88_staging/40266/04_d1c_05.jpg",
    ],
    # Paradigm Decor 1C (≤74in) — center-only shorter band.
    # Flickr OEM FRONT no-grille 43–64.9in + same 1C platform details.
    40249: [
        "assets/enriched/_w88_staging/40249/00_53527693079.jpg",
        "assets/enriched/_w88_staging/40249/01_d1c_05.jpg",
        "assets/enriched/_w88_staging/40249/02_d1c_07.jpg",
        "assets/enriched/_w88_staging/40249/03_d1c_08.jpg",
        "assets/enriched/_w88_staging/40249/04_0cf67dc969.jpg",
    ],
    # Paradigm Decor 2SC (≤74in) — LCR multi-array shorter band.
    40265: [
        "assets/enriched/_w88_staging/40265/00_d1c_03.jpg",
        "assets/enriched/_w88_staging/40265/01_d1c_07.jpg",
        "assets/enriched/_w88_staging/40265/02_d1c_08.jpg",
        "assets/enriched/_w88_staging/40265/03_0cf67dc969.jpg",
        "assets/enriched/_w88_staging/40265/04_d1c_05.jpg",
    ],
    # Acoustic Energy AE107-2 — black finish only.
    # Gallery black 3/4 + OEM grille-on angles. Reject walnut/dual-finish/towers.
    274613: [
        "assets/enriched/_w88_staging/274613/00_gal_black_3q.jpg",
        "assets/enriched/_w88_staging/274613/01_grille_a.jpg",
        "assets/enriched/_w88_staging/274613/02_grille_b.jpg",
        "assets/enriched/_w88_staging/274613/03_thumb_black.jpg",
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
        dest = out_dir / f"{pid}_w88_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w88_{i:02d}.jpg"
            with Image.open(dest) as im:
                im.convert("RGB").save(jpg, "JPEG", quality=92)
            if dest != jpg and dest.exists():
                dest.unlink()
            dest = jpg
        if dest.stat().st_size > 1_800_000:
            with Image.open(dest) as im:
                im = im.convert("RGB")
                im.thumbnail((2000, 2000))
                im.save(dest, "JPEG", quality=90)
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
                "attribution": "wave88-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave88"] = True
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
    out = ROOT / "data" / "enrichment" / "wave88-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
