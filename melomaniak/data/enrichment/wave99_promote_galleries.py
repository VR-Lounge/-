#!/usr/bin/env python3
"""Wave 99: promote highest-price padded → true_multi_angle (strict model/finish)."""
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
    # Furutech La Source 103 colored PE leads. OEM fan + Audiohum + Melomaniak
    # connector close-up + full-wire set; reject packaging box / 101 clear /
    # 102 short silver / Monaco LP stabilizer PDF crop.
    264409: [
        "assets/enriched/_w99_staging/264409/00_oem.jpg",
        "assets/enriched/_w99_staging/264409/01_ah.jpg",
        "assets/enriched/_w99_staging/264409/02_connectors.jpg",
        "assets/enriched/_w99_staging/264409/03_wires.jpg",
    ],
    # Furutech FI-52M NCF(R) US male. OEM standing + dual-shot entry + prongs +
    # face close-up (NCF male confirmed); reject FI-52 IEC NCF female pads /
    # FI-50M / Schuko FI-E50 / non-NCF FI-52M dual reuse for sibling SKU.
    264147: [
        "assets/enriched/_w99_staging/264147/00_standing.jpg",
        "assets/enriched/_w99_staging/264147/01_entry.jpg",
        "assets/enriched/_w99_staging/264147/02_prongs.jpg",
        "assets/enriched/_w99_staging/264147/03_face.jpg",
    ],
    # Audio Replas OPT-100HG-SS HR φ50×20mm Super Surface (4P/3P/1P share
    # angles). Live stack + OEM stack + disc macro + disc 3q; reject FLAT
    # 10mm / GR-SS 30mm / frosted non-SS HR lineup / lifestyle under gear /
    # award-banner overlays / catalog multi-SKU blocks.
    264077: [
        "assets/enriched/_w99_staging/264077/00_stack_live.jpg",
        "assets/enriched/_w99_staging/264077/01_stack_oem.jpg",
        "assets/enriched/_w99_staging/264077/02_disc_macro.jpg",
        "assets/enriched/_w99_staging/264077/03_disc_bl.jpg",
    ],
    264076: [
        "assets/enriched/_w99_staging/264076/00_stack_live.jpg",
        "assets/enriched/_w99_staging/264076/01_stack_oem.jpg",
        "assets/enriched/_w99_staging/264076/02_disc_macro.jpg",
        "assets/enriched/_w99_staging/264076/03_disc_bl.jpg",
    ],
    264075: [
        "assets/enriched/_w99_staging/264075/00_stack_live.jpg",
        "assets/enriched/_w99_staging/264075/01_stack_oem.jpg",
        "assets/enriched/_w99_staging/264075/02_disc_macro.jpg",
        "assets/enriched/_w99_staging/264075/03_disc_bl.jpg",
    ],
    # Soulnote sc1.0 black. Studio front + live black 3q + confirmed rear
    # (MODEL NO. sc1.0) + faceplate crop; reject silver faceplate units /
    # Musica Pristina / Metronome DSC1 polluting prior gallery.
    15730: [
        "assets/enriched/_w99_staging/15730/00_front.jpg",
        "assets/enriched/_w99_staging/15730/01_ebay_3q.jpg",
        "assets/enriched/_w99_staging/15730/02_rear.jpg",
        "assets/enriched/_w99_staging/15730/03_face.jpg",
    ],
    # PSB Imagine S gloss black surround. Grille-on + grille-off + Crutchfield
    # dual + left-baffle 3q; reject black ash surround CDN / gloss white TAF /
    # Synchrony mislabels.
    36357: [
        "assets/enriched/_w99_staging/36357/00_grille_on.jpg",
        "assets/enriched/_w99_staging/36357/01_grille_off.jpg",
        "assets/enriched/_w99_staging/36357/02_cf_dual.jpg",
        "assets/enriched/_w99_staging/36357/03_baffle_L.jpg",
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
        dest = out_dir / f"{pid}_w99_{i:02d}{ext}"
        shutil.copy2(src, dest)
        if ext in {".png", ".webp", ".jpeg"}:
            jpg = out_dir / f"{pid}_w99_{i:02d}.jpg"
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
                "attribution": "wave99-oem",
                "bytes": f.stat().st_size,
            }
        )
    pdp["gallery"] = gallery
    pdp["galleryHitl"] = False
    pdp["galleryClass"] = "true_multi_angle"
    pdp["galleryPadMarkers"] = []
    pdp["galleryDepaddedAt"] = NOW
    pdp["galleryWave99"] = True
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
    out = ROOT / "data" / "enrichment" / "wave99-promote.json"
    out.write_text(json.dumps({"at": NOW, "results": results}, indent=2) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
