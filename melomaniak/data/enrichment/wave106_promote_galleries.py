#!/usr/bin/env python3
"""Wave 106: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
STAGING = ENR / "_w106_staging"
HASH_SIZE = 8
DHASH_THRESH = 5
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# Skip Jadeitte/MTP-2; OPS-1≠OPS-1S; GS size-identical; B120 4.4mm mismatch.
PACK_IDS = [
    264152,  # Furutech FI-50(G) IEC gold
    264151,  # Furutech FI-E50(G) Schuko gold
    264269,  # Furutech FP-602 F(G) gold
    264155,  # Furutech FI-E48(R)
    264455,  # Furutech FP-681M(R)
    264454,  # Furutech FP-681M(G)
    264555,  # SAEC SHC-U300FSH
    264557,  # SAEC SHC-U300FH80
    264556,  # SAEC SHC-U300FH65
    264553,  # SAEC SHC-2B300FH65
    264552,  # SAEC SHC-2B300FSH
    264549,  # SAEC SHC-120FF
    264548,  # SAEC SHC-120FS
    264509,  # SAEC SL-1980
    264535,  # SAEC AC-6000
    264446,  # Furutech FS-SPC 216
    269834,  # Wireworld Nova Toslink
    269827,  # Wireworld Oasis 8
]


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


def pack_files(pid: int) -> list[Path]:
    d = STAGING / str(pid)
    files = sorted(d.glob("*.jpg"))
    if len(files) < 4:
        raise FileNotFoundError(f"{pid}: need ≥4 staging jpgs in {d}")
    return files


def promote(pid: int) -> dict:
    files = pack_files(pid)
    out_dir = ENR / str(pid)
    out_dir.mkdir(parents=True, exist_ok=True)
    copied: list[Path] = []
    for i, src in enumerate(files):
        if src.stat().st_size < 400:
            raise FileNotFoundError(f"{pid}: tiny {src}")
        dest = out_dir / f"{pid}_w106_{i:02d}.jpg"
        shutil.copy2(src, dest)
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
                "attribution": "wave106-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave106"] = True
    pdp_path.write_text(json.dumps(pdp, ensure_ascii=False, indent=2) + "\n")
    print(f"OK {pid} → {len(unique)} unique")
    return {
        "id": pid,
        "before": before,
        "after": len(gallery),
        "unique": len(unique),
        "files": [str(f.relative_to(ROOT)) for f in unique[:8]],
    }


def main() -> None:
    results = []
    for pid in PACK_IDS:
        results.append(promote(pid))
    out = ROOT / "data" / "enrichment" / "wave106-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
