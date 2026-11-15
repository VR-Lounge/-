#!/usr/bin/env python3
"""Wave 100b: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Furutech FI-52M(R) 20A male NEMA carbon/SS. OEM dual lifestyle crops:
    # standing pins / reclining / pins macro / cable-entry; reject FI-52 IEC
    # female / FI-50M 15A / FI-52M NCF ivory body.
    264146: [
        "assets/enriched/_w100b_staging/264146/00_standing.jpg",
        "assets/enriched/_w100b_staging/264146/01_reclining.jpg",
        "assets/enriched/_w100b_staging/264146/02_pins_macro.jpg",
        "assets/enriched/_w100b_staging/264146/03_cable_entry.jpg",
    ],
    # Audio Replas OPT-30HG-SC HR frosted quartz SPIKES (φ30×18mm). OEM group
    # + spike crops; reject OPT-30HG HR flat / OPT-30HG-PL cup / 20HR cylinder.
    264090: [
        "assets/enriched/_w100b_staging/264090/00_group.jpg",
        "assets/enriched/_w100b_staging/264090/01_left_spike.jpg",
        "assets/enriched/_w100b_staging/264090/02_right_spike.jpg",
        "assets/enriched/_w100b_staging/264090/03_back_top.jpg",
    ],
    264089: [
        "assets/enriched/_w100b_staging/264089/00_group.jpg",
        "assets/enriched/_w100b_staging/264089/01_left_spike.jpg",
        "assets/enriched/_w100b_staging/264089/02_right_spike.jpg",
        "assets/enriched/_w100b_staging/264089/03_back_top.jpg",
    ],
    264088: [
        "assets/enriched/_w100b_staging/264088/00_group.jpg",
        "assets/enriched/_w100b_staging/264088/01_left_spike.jpg",
        "assets/enriched/_w100b_staging/264088/02_right_spike.jpg",
        "assets/enriched/_w100b_staging/264088/03_back_top.jpg",
    ],
    # Audio Replas OPT-30HG-PL HR spike receptacles (concave cup). OEM stack +
    # disc crops + spike-in-cup lifestyle; reject flat OPT-30HG HR / SC spikes.
    264085: [
        "assets/enriched/_w100b_staging/264085/00_stack.jpg",
        "assets/enriched/_w100b_staging/264085/01_top_disc.jpg",
        "assets/enriched/_w100b_staging/264085/02_left_disc.jpg",
        "assets/enriched/_w100b_staging/264085/03_in_use.jpg",
    ],
    264084: [
        "assets/enriched/_w100b_staging/264084/00_stack.jpg",
        "assets/enriched/_w100b_staging/264084/01_top_disc.jpg",
        "assets/enriched/_w100b_staging/264084/02_left_disc.jpg",
        "assets/enriched/_w100b_staging/264084/03_in_use.jpg",
    ],
    # Audio Replas OPT-30HG 20HR φ30×20mm cylinders. OEM 20HR stack crops;
    # reject OPT-30HG HR 10mm / SC / PL.
    264087: [
        "assets/enriched/_w100b_staging/264087/00_stack.jpg",
        "assets/enriched/_w100b_staging/264087/01_top_cyl.jpg",
        "assets/enriched/_w100b_staging/264087/02_bl_cyl.jpg",
        "assets/enriched/_w100b_staging/264087/03_br_cyl.jpg",
    ],
    264086: [
        "assets/enriched/_w100b_staging/264086/00_stack.jpg",
        "assets/enriched/_w100b_staging/264086/01_top_cyl.jpg",
        "assets/enriched/_w100b_staging/264086/02_bl_cyl.jpg",
        "assets/enriched/_w100b_staging/264086/03_br_cyl.jpg",
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
        dest = out_dir / f"{pid}_w100b_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w100b_{i:02d}.jpg"
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
                "attribution": "wave100b-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave100b"] = True
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
    out = ROOT / "data" / "enrichment" / "wave100b-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
