#!/usr/bin/env python3
"""Wave 76: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Acoustic Energy AE300 — piano gloss black only (SKU has no finish;
    # commit black consistently). OEM pair no-grille + slider alt + Doctorhead
    # pair angles. Reject walnut lifestyle (Audiopolis 4059) and AE309 floorstander
    # Melomaniak pollution; grille-on near-dups of no-grille stripped by dhash.
    274581: [
        "assets/enriched/_w76_staging/274581/00_pair_nogrille.jpg",
        "assets/enriched/_w76_staging/274581/01_pair_slider_nogrille.jpg",
        "assets/enriched/_w76_staging/274581/02_pair_dh1.jpg",
        "assets/enriched/_w76_staging/274581/03_pair_dh4.jpg",
    ],
    # Monitor Audio Bronze 200 6G — black finish only. Melomaniak pair +
    # Crutchfield single 3/4 + feet detail + Richer Sounds rear (terminal plate
    # reads BRONZE 200) + Crutchfield/HCS pair alts. Reject lifestyle fireplace
    # (rs_407851_2), Urban Grey/White Melomaniak frames, and Bronze 500
    # cross-contaminants.
    271039: [
        "assets/enriched/_w76_staging/271039/00_pair_melo.jpg",
        "assets/enriched/_w76_staging/271039/01_single34.jpg",
        "assets/enriched/_w76_staging/271039/02_feet.jpg",
        "assets/enriched/_w76_staging/271039/03_rear.jpg",
        "assets/enriched/_w76_staging/271039/04_pair_cf.jpg",
        "assets/enriched/_w76_staging/271039/05_pair_hcs.jpg",
    ],
    # Advance Acoustic / Advance Paris Smart BX2 — white finish only (SKU has
    # no finish; Melomaniak already had white rear). OEM white front + HCS
    # front/rear + Melomaniak front + rear close/live. Reject black-chassis
    # OEM/HCS fronts mixed with white rear.
    33436: [
        "assets/enriched/_w76_staging/33436/00_front_oem.png",
        "assets/enriched/_w76_staging/33436/01_front_hcs.jpg",
        "assets/enriched/_w76_staging/33436/02_rear_hcs.jpg",
        "assets/enriched/_w76_staging/33436/03_front_pdp.jpg",
        "assets/enriched/_w76_staging/33436/04_rear_close.jpg",
        "assets/enriched/_w76_staging/33436/05_rear_live.jpg",
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
        dest = out_dir / f"{pid}_w76_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w76_{i:02d}.jpg"
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
                "attribution": "wave76-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave76"] = True
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
    out = ROOT / "data" / "enrichment" / "wave76-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
