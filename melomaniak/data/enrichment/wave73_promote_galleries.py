#!/usr/bin/env python3
"""Wave 73: promote highest-price padded/oneshot → true_multi_angle (strict model/finish)."""
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
    # Soulnote D-1N — silver finish only (oneshot → true).
    # Clean OEM/live front + JP rear (MODEL NO. D-1N) + top internals + DAC board;
    # reject black D-1/D-1N fronts, flute marketing overlay, shared e-1 spike,
    # lifestyle SNA desk shot.
    262137: [
        "assets/enriched/_w73_staging/262137/00_s_front.jpg",
        "assets/enriched/_w73_staging/262137/01_live.jpg",
        "assets/enriched/_w73_staging/262137/02_rear.jpg",
        "assets/enriched/_w73_staging/262137/03_top.jpg",
        "assets/enriched/_w73_staging/262137/04_dac.jpg",
    ],
    # Audio Replas OPS-1 HR — OPS-1 HR quartz only (not OPS-1S).
    # Studio + in-use angles with OPS-1 HR face text; reject FIDELITY 2020
    # award live overlay and scale-variant gallery pads.
    264102: [
        "assets/enriched/_w73_staging/264102/00_dbd.jpg",
        "assets/enriched/_w73_staging/264102/01_fo2.jpg",
        "assets/enriched/_w73_staging/264102/02_fo3.jpg",
        "assets/enriched/_w73_staging/264102/03_fo4.jpg",
        "assets/enriched/_w73_staging/264102/04_fo5.jpg",
        "assets/enriched/_w73_staging/264102/05_fid.jpg",
    ],
    # SAEC Stratosphere XR-1 — XLR only (not SL-1 RCA / XR-3000 / XR-1000).
    # OEM black-bg + phileweb white coils + SK-HK product; strip wrong-model
    # live pads, speaker-cable/diagram/lifestyle phileweb pollution, marketing
    # badge composites (Oyaide/Leroy overlays).
    264519: [
        "assets/enriched/_w73_staging/264519/00_oem.png",
        "assets/enriched/_w73_staging/264519/01_ph1.jpg",
        "assets/enriched/_w73_staging/264519/02_phile.jpg",
        "assets/enriched/_w73_staging/264519/03_sk.jpg",
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
        dest = out_dir / f"{pid}_w73_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w73_{i:02d}.jpg"
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
                "attribution": "wave73-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave73"] = True
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
    out = ROOT / "data" / "enrichment" / "wave73-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
