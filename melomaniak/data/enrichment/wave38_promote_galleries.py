#!/usr/bin/env python3
"""Wave 38: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Acoustic Energy AE109-2 — black finish only (reject walnut/lifestyle Angle)
    274621: [
        "assets/from-live/products/0a2ce48bae_ae-109-178-w950-ae-mpic-0-1650453638.jpg",
        "assets/from-live/products/b5f4f0569d_ae-109-178-w950-ae-mpic-0-1650453643.jpg",
        "assets/from-live/products/e912af4aa6_ae-109-178-w950-ae-mpic-0-1650453648.jpg",
        "/tmp/w38/274621/uk_bng.jpg",
    ],
    # Magnat Monitor S70 — walnut finish (live + OEM walnut; reject black SKU shots)
    269455: [
        "assets/from-live/products/999a7a9ce4_magnat_monitor_s70_11844202951-1.jpg",
        "assets/from-live/products/82080a8207_magnat_monitor_s70_11844206721-2.jpg",
        "assets/from-live/products/bc7c691828_magnat_monitor_s70_11844207721-3.jpg",
        "/tmp/w38/269455/w_Magnat_Monitor-S70-standard-walnut-oG.jpg",
        "/tmp/w38/269455/w_WebReady-Magnat_Monitor-S70-Pair-walnut.jpg",
        "/tmp/w38/269455/w_WebReady-Magnat_Monitor-S70-Opener.jpg",
        "/tmp/w38/269455/w_WebReady-Magnat_Monitor-S70_Chassis.jpg",
        "/tmp/w38/269455/w_WebReady-Magnat_Monitor-S70_Chassis2.jpg",
        "/tmp/w38/269455/w_WebReady-Magnat_Monitor-S70-Tubes.jpg",
    ],
    # Dual CS 435-1 — black Dual OEM + live (reject other Dual CS models)
    271896: [
        "assets/from-live/products/57c2f8a702_dual_cs_435-1-1.jpg",
        "assets/from-live/products/e34cec9c3f_dual_cs_435-1-2.jpg",
        "assets/from-live/products/97d9016d33_dual_cs_435-1-3.jpg",
        "/tmp/w38/271896/cs_h.jpg",
    ],
    # Magnat Monitor S80 ATM — black finish (reject walnut OEM)
    269421: [
        "assets/from-live/products/61ee411d8e_magnat_monitor_s80_atm1.jpg",
        "assets/from-live/products/3479effc26_magnat_monitor_s80_atm2.jpg",
        "assets/from-live/products/8c0dcc7212_magnat_monitor_s80_atm4.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-standard-black-oG.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-Opener.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-Chassis-ATM.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-Detail.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-Terminal.jpg",
        "/tmp/w38/269421/WebReady-Magnat_Monitor-S80ATM-Explodedview.jpg",
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
        dest = out_dir / f"{pid}_w38_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w38_{i:02d}.jpg"
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
                "attribution": "wave38-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave38"] = True
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
    out = ROOT / "data" / "enrichment" / "wave38-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
