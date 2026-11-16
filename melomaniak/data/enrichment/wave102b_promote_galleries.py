#!/usr/bin/env python3
"""Wave 102b: promote additional highest-price padded → true_multi_angle."""
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
    # Furutech FP-110(G) gold RCA — OEM dual standing/reclining crops.
    264286: [
        "assets/enriched/_w102b_staging/264286/00_oem.jpg",
        "assets/enriched/_w102b_staging/264286/01_standing.jpg",
        "assets/enriched/_w102b_staging/264286/02_reclining.jpg",
        "assets/enriched/_w102b_staging/264286/03_macro.jpg",
    ],
    264287: [
        "assets/enriched/_w102b_staging/264287/00_oem.jpg",
        "assets/enriched/_w102b_staging/264287/01_standing.jpg",
        "assets/enriched/_w102b_staging/264287/02_reclining.jpg",
        "assets/enriched/_w102b_staging/264287/03_macro.jpg",
    ],
    # Furutech FP-203(G) gold spade — Audiophonics multi + PartsConnexion.
    264315: [
        "assets/enriched/_w102b_staging/264315/00_kit.jpg",
        "assets/enriched/_w102b_staging/264315/01_pair.jpg",
        "assets/enriched/_w102b_staging/264315/02_single.jpg",
        "assets/enriched/_w102b_staging/264315/03_left_spade.jpg",
    ],
    # SAEC SUS-020 Stratosphere Type-C → USB-A female OTG — OEM exact config.
    264543: [
        "assets/enriched/_w102b_staging/264543/00_full.jpg",
        "assets/enriched/_w102b_staging/264543/01_afemale.jpg",
        "assets/enriched/_w102b_staging/264543/02_typec.jpg",
        "assets/enriched/_w102b_staging/264543/03_loop.jpg",
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
        if not src.exists() or src.stat().st_size < 400:
            raise FileNotFoundError(f"{pid}: missing {src}")
        ext = src.suffix.lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg"
        dest = out_dir / f"{pid}_w102b_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w102b_{i:02d}.jpg"
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
                "attribution": "wave102b-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave102b"] = True
    pdp_path.write_text(json.dumps(pdp, ensure_ascii=False, indent=2) + "\n")
    print(f"OK {pid} → {len(unique)} unique")
    return {
        "id": pid,
        "before": before,
        "after": len(gallery),
        "unique": len(unique),
        "files": [str(u.relative_to(ROOT)) for u in unique],
    }


def main() -> None:
    results = []
    for pid, files in PACKS.items():
        results.append(promote(pid, files))
    out = ROOT / "data" / "enrichment" / "wave102b-promote.json"
    out.write_text(
        json.dumps({"generatedAt": NOW, "results": results}, ensure_ascii=False, indent=2)
        + "\n"
    )
    print("wrote", out)


if __name__ == "__main__":
    main()
