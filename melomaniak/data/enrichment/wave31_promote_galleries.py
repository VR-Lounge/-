#!/usr/bin/env python3
"""Wave 31: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Advance Paris PlayStream A5 — OEM front/rear/remote + HCS front (reject A1/Rotel/lifestyle)
    261059: [
        "/tmp/w31/261059/a5_1.png",
        "/tmp/w31/261059/a5_2.png",
        "/tmp/w31/261059/a5_4.png",
        "/tmp/w31/261059/hcs1.jpeg",
    ],
    # Advance Paris PlayStream A7 — OEM front/rear/interior/heatsink (reject phone composite)
    261062: [
        "/tmp/w31/261062/a7_1.png",
        "/tmp/w31/261062/a7_2.png",
        "/tmp/w31/261062/a7_3.png",
        "/tmp/w31/261062/a7_4.png",
    ],
    # Advance Paris Smart PX1 black — keep black angles + OEM black front (reject white finish)
    33444: [
        "assets/enriched/33444/7a68c92d5b_4.jpg",
        "assets/from-live/products/487f1b7aba_b1bd43da143899324a4d35e802e513d5.jpeg",
        "assets/from-live/products/1f6f3078c5_f8b392012995cf8cabf9c7d20023575d.jpeg",
        "/tmp/w31/267748/px_bk.png",
    ],
    # T+A Power Bar 2+3 Basic HD — OEM exterior/interior + dealer + live (reject shared 2+5 poison)
    274103: [
        "/tmp/w31/274103/ta_ext.jpg",
        "/tmp/w31/274103/ta_innen.jpg",
        "/tmp/w31/274103/hb.jpg",
        "assets/from-live/products/70eeb14ac2_power_bar_23_basic_hd1.jpg",
    ],
    # Velodyne Impact X 12 white — front/rear/remote + OEM backplate (skip near-dup grille)
    272407: [
        "assets/from-live/products/08f71ac361_velodyne_impact_x_12_11163451795-1.jpg",
        "assets/from-live/products/f11ef8980c_velodyne_impact_x_12-3.jpg",
        "assets/from-live/products/65a7f9ac73_velodyne_impact_x_12-4.jpg",
        "/tmp/w31/272407/back.jpg",
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
        dest = out_dir / f"{pid}_w31_{i:02d}{ext}"
        shutil.copy2(src, dest)
        # normalize to JPEG for consistency when needed
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w31_{i:02d}.jpg"
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
                "attribution": "wave31-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave31"] = True
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
    out = ROOT / "data" / "enrichment" / "wave31-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
