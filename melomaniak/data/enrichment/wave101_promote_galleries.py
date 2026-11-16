#!/usr/bin/env python3
"""Wave 101: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Furutech FI-12L(R) angled IEC — OEM composite 0/90/180/270° rotations.
    264172: [
        "assets/enriched/_w101_staging/264172/00_0deg.jpg",
        "assets/enriched/_w101_staging/264172/01_90deg.jpg",
        "assets/enriched/_w101_staging/264172/02_180deg.jpg",
        "assets/enriched/_w101_staging/264172/03_270deg.jpg",
    ],
    # Furutech FI-12L(G) gold — OEM hero + face/body/corner crops; reject (R).
    264171: [
        "assets/enriched/_w101_staging/264171/00_full.jpg",
        "assets/enriched/_w101_staging/264171/01_face.jpg",
        "assets/enriched/_w101_staging/264171/02_body.jpg",
        "assets/enriched/_w101_staging/264171/03_corner.jpg",
    ],
    # Furutech FI-C15 NCF(R) slim IEC — standing + horizontal + socket + inner.
    264183: [
        "assets/enriched/_w101_staging/264183/00_standing.jpg",
        "assets/enriched/_w101_staging/264183/01_horizontal.jpg",
        "assets/enriched/_w101_staging/264183/02_socket_macro.jpg",
        "assets/enriched/_w101_staging/264183/03_inner.jpg",
    ],
    # Furutech FI-C15(G) gold — OEM dual crops; reject NCF / (R).
    264182: [
        "assets/enriched/_w101_staging/264182/00_standing.jpg",
        "assets/enriched/_w101_staging/264182/01_horizontal.jpg",
        "assets/enriched/_w101_staging/264182/02_socket.jpg",
        "assets/enriched/_w101_staging/264182/03_full.jpg",
    ],
    # Audio Replas SG-4HR/3P φ12×10mm — individual cylinder crops (no overlays).
    264079: [
        "assets/enriched/_w101_staging/264079/00_tilted.jpg",
        "assets/enriched/_w101_staging/264079/01_mid_left.jpg",
        "assets/enriched/_w101_staging/264079/02_mid_right.jpg",
        "assets/enriched/_w101_staging/264079/03_far_right.jpg",
    ],
    # Audio Replas CPP-2SZ SE outlet plate — OEM angle + thick + live + catalog.
    264119: [
        "assets/enriched/_w101_staging/264119/00_oem_angle.jpg",
        "assets/enriched/_w101_staging/264119/01_oem_thick.jpg",
        "assets/enriched/_w101_staging/264119/02_live_top.jpg",
        "assets/enriched/_w101_staging/264119/03_catalog_2sz.jpg",
    ],
    # Furutech FI-28M(R) male — OEM + labeled live + face/side; reject (G)/FI-28 IEC.
    264167: [
        "assets/enriched/_w101_staging/264167/00_oem.jpg",
        "assets/enriched/_w101_staging/264167/01_live.jpg",
        "assets/enriched/_w101_staging/264167/02_face.jpg",
        "assets/enriched/_w101_staging/264167/03_side.jpg",
    ],
    # Furutech FI-28M(G) gold male — OEM gold crops; reject (R).
    264170: [
        "assets/enriched/_w101_staging/264170/00_oem.jpg",
        "assets/enriched/_w101_staging/264170/01_face.jpg",
        "assets/enriched/_w101_staging/264170/02_body.jpg",
        "assets/enriched/_w101_staging/264170/03_corner.jpg",
    ],
    # Furutech FI-32(R) IEC — OEM rhodium crops.
    264164: [
        "assets/enriched/_w101_staging/264164/00_oem.jpg",
        "assets/enriched/_w101_staging/264164/01_face.jpg",
        "assets/enriched/_w101_staging/264164/02_body.jpg",
        "assets/enriched/_w101_staging/264164/03_corner.jpg",
    ],
    # Furutech FI-15M Plus(R) — OEM rhodium crops; reject Plus(G).
    264187: [
        "assets/enriched/_w101_staging/264187/00_oem.jpg",
        "assets/enriched/_w101_staging/264187/01_face.jpg",
        "assets/enriched/_w101_staging/264187/02_body.jpg",
        "assets/enriched/_w101_staging/264187/03_corner.jpg",
    ],
    # Furutech FI-15M Plus(G) — OEM gold crops; reject Plus(R).
    264186: [
        "assets/enriched/_w101_staging/264186/00_oem.jpg",
        "assets/enriched/_w101_staging/264186/01_face.jpg",
        "assets/enriched/_w101_staging/264186/02_body.jpg",
        "assets/enriched/_w101_staging/264186/03_corner.jpg",
    ],
    # Furutech FI-09 NCF(R) inlet — OEM NCF crops.
    264199: [
        "assets/enriched/_w101_staging/264199/00_oem.jpg",
        "assets/enriched/_w101_staging/264199/01_face.jpg",
        "assets/enriched/_w101_staging/264199/02_body.jpg",
        "assets/enriched/_w101_staging/264199/03_corner.jpg",
    ],
    # Furutech FI-E38(G) Schuko gold — OEM gold crops; reject (R)/FI-E50.
    264206: [
        "assets/enriched/_w101_staging/264206/00_oem.jpg",
        "assets/enriched/_w101_staging/264206/01_face.jpg",
        "assets/enriched/_w101_staging/264206/02_body.jpg",
        "assets/enriched/_w101_staging/264206/03_corner.jpg",
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
        dest = out_dir / f"{pid}_w101_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w101_{i:02d}.jpg"
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
                "attribution": "wave101-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave101"] = True
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
    out = ROOT / "data" / "enrichment" / "wave101-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
