#!/usr/bin/env python3
"""Wave 44: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # AudioQuest Carbon USB A→B — strip turntable pads; OEM + Dubai Front/Back + live
    272830: [
        "assets/enriched/_w44_staging/272830/00_live.jpg",
        "assets/enriched/_w44_staging/272830/01_front.jpg",
        "assets/enriched/_w44_staging/272830/02_back.jpg",
        "assets/enriched/_w44_staging/272830/03_oem.png",
    ],
    # Van den Hul First Metal Screen — yellow jacket; OEM box/open + live cable (reject diagrams)
    270561: [
        "assets/enriched/_w44_staging/270561/00_live_cable.jpg",
        "assets/enriched/_w44_staging/270561/01_oem_box.jpg",
        "assets/enriched/_w44_staging/270561/02_oem_open.jpg",
        "assets/enriched/_w44_staging/270561/03_oem_open34.jpg",
    ],
    # Furutech e-TP80E — Schuko non-NCF only (reject e-TP80ES NCF / e-TP80E NCF)
    264251: [
        "assets/enriched/_w44_staging/264251/00_live.jpg",
        "assets/enriched/_w44_staging/264251/01_live_angle.jpg",
        "assets/enriched/_w44_staging/264251/02_audiohum.jpg",
        "assets/enriched/_w44_staging/264251/03_nota.jpg",
    ],
    # Van den Hul The Orchid RCA — red Hulliflex; box + tray + RCA macro (reject diagram)
    270568: [
        "assets/enriched/_w44_staging/270568/00_live_box.jpg",
        "assets/enriched/_w44_staging/270568/01_oem_box.jpg",
        "assets/enriched/_w44_staging/270568/02_oem_tray.jpg",
        "assets/enriched/_w44_staging/270568/03_mister_rca.jpg",
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
        dest = out_dir / f"{pid}_w44_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w44_{i:02d}.jpg"
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
                "attribution": "wave44-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave44"] = True
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
    out = ROOT / "data" / "enrichment" / "wave44-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
