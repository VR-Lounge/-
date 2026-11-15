#!/usr/bin/env python3
"""Wave 102: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Furutech FI-E38(R) Schuko rhodium — Audiophonics multi-angle (side/pins/
    # clamp/rear); reject (G) gold / FI-E50 carbon.
    264205: [
        "assets/enriched/_w102_staging/264205/00_side.jpg",
        "assets/enriched/_w102_staging/264205/01_pins.jpg",
        "assets/enriched/_w102_staging/264205/02_clamp.jpg",
        "assets/enriched/_w102_staging/264205/03_rear.jpg",
    ],
    # Furutech CF-201(R) carbon spade — OEM dual crops + N1 refresh; reject NCF.
    264306: [
        "assets/enriched/_w102_staging/264306/00_standing.jpg",
        "assets/enriched/_w102_staging/264306/01_reclining.jpg",
        "assets/enriched/_w102_staging/264306/02_spade_macro.jpg",
        "assets/enriched/_w102_staging/264306/03_n1.jpg",
    ],
    # Furutech CF-126(R) carbon RCA — OEM dual upright/horizontal crops.
    264288: [
        "assets/enriched/_w102_staging/264288/00_oem.jpg",
        "assets/enriched/_w102_staging/264288/01_left.jpg",
        "assets/enriched/_w102_staging/264288/02_right.jpg",
        "assets/enriched/_w102_staging/264288/03_macro.jpg",
    ],
    # Furutech FI-E12L(G) angled Schuko gold — OEM gold crops; reject (R).
    264208: [
        "assets/enriched/_w102_staging/264208/00_oem.jpg",
        "assets/enriched/_w102_staging/264208/01_face.jpg",
        "assets/enriched/_w102_staging/264208/02_body.jpg",
        "assets/enriched/_w102_staging/264208/03_corner.jpg",
    ],
    # Furutech FI-48 NCF(Ag) silver IEC — OEM Ag NCF crops; reject (R)/male/E48.
    264157: [
        "assets/enriched/_w102_staging/264157/00_oem.jpg",
        "assets/enriched/_w102_staging/264157/01_face.jpg",
        "assets/enriched/_w102_staging/264157/02_body.jpg",
        "assets/enriched/_w102_staging/264157/03_corner.jpg",
    ],
    # Furutech FP-108(R) RCA — OEM rhodium crops (pair SKUs).
    264279: [
        "assets/enriched/_w102_staging/264279/00_oem.jpg",
        "assets/enriched/_w102_staging/264279/01_face.jpg",
        "assets/enriched/_w102_staging/264279/02_body.jpg",
        "assets/enriched/_w102_staging/264279/03_corner.jpg",
    ],
    264280: [
        "assets/enriched/_w102_staging/264280/00_oem.jpg",
        "assets/enriched/_w102_staging/264280/01_face.jpg",
        "assets/enriched/_w102_staging/264280/02_body.jpg",
        "assets/enriched/_w102_staging/264280/03_corner.jpg",
    ],
    # Furutech FP-202(R) banana — OEM rhodium crops.
    264321: [
        "assets/enriched/_w102_staging/264321/00_oem.jpg",
        "assets/enriched/_w102_staging/264321/01_face.jpg",
        "assets/enriched/_w102_staging/264321/02_body.jpg",
        "assets/enriched/_w102_staging/264321/03_corner.jpg",
    ],
    # Furutech FP-160(G) — OEM gold crops (pair SKUs).
    264293: [
        "assets/enriched/_w102_staging/264293/00_oem.jpg",
        "assets/enriched/_w102_staging/264293/01_face.jpg",
        "assets/enriched/_w102_staging/264293/02_body.jpg",
        "assets/enriched/_w102_staging/264293/03_corner.jpg",
    ],
    264294: [
        "assets/enriched/_w102_staging/264294/00_oem.jpg",
        "assets/enriched/_w102_staging/264294/01_face.jpg",
        "assets/enriched/_w102_staging/264294/02_body.jpg",
        "assets/enriched/_w102_staging/264294/03_corner.jpg",
    ],
    # Furutech FP-209-10(G) spade — OEM gold crops.
    264310: [
        "assets/enriched/_w102_staging/264310/00_oem.jpg",
        "assets/enriched/_w102_staging/264310/01_face.jpg",
        "assets/enriched/_w102_staging/264310/02_body.jpg",
        "assets/enriched/_w102_staging/264310/03_corner.jpg",
    ],
    # Furutech FP-203(R) spade — OEM rhodium crops.
    264316: [
        "assets/enriched/_w102_staging/264316/00_oem.jpg",
        "assets/enriched/_w102_staging/264316/01_face.jpg",
        "assets/enriched/_w102_staging/264316/02_body.jpg",
        "assets/enriched/_w102_staging/264316/03_corner.jpg",
    ],
    # Furutech Flow-15 Plus filter cable — OEM crops.
    264349: [
        "assets/enriched/_w102_staging/264349/00_oem.jpg",
        "assets/enriched/_w102_staging/264349/01_face.jpg",
        "assets/enriched/_w102_staging/264349/02_body.jpg",
        "assets/enriched/_w102_staging/264349/03_corner.jpg",
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
        dest = out_dir / f"{pid}_w102_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w102_{i:02d}.jpg"
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
                "attribution": "wave102-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave102"] = True
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
    out = ROOT / "data" / "enrichment" / "wave102-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
