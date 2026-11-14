#!/usr/bin/env python3
"""Audit PDP galleries for padded / near-identical images vs true multi-angle.

Detects:
  - path patterns: local-variant://, w17sc/r/sq/cdn/dsc/fsc/hsc/redl, w13var/w14var,
    CDN -scaled / -rotated / -NxN size suffixes
  - exact local path / basename duplicates
  - average-hash (ahash) near-duplicates (Hamming ≤ 6 on 8×8)
  - dimension+filesize heuristics when pixels unavailable

Writes data/enrichment/gallery-padding-audit.json
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
OUT = ROOT / "data" / "enrichment" / "gallery-padding-audit.json"

AHASH_SIZE = 8
# Tight: only near-identical / re-encode / mild crop. Distinct product angles often
# sit at Hamming 2–5 on plain studio backgrounds — do not collapse those.
AHASH_HAMMING_MAX = 1
MULTI_MIN = 4

# Synthetic scale/rotate/square pads only — NOT w17cdn (OEM/CDN downloads may be real angles).
PAD_NAME_RE = re.compile(
    r"(?:^|[_\-/])(?:w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)|"
    r"w13var|w14var|w15var|w16var)(?:$|[_\-.])",
    re.I,
)
# Resolution-only CDN copies often share a content id with -1280x / -2048x / -950x312-crop
CDN_RES_ONLY_RE = re.compile(
    r"-(?:1280x|2048x|1600x\d+|950x\d+-crop)(?=\.(?:jpe?g|png|webp|gif)$)",
    re.I,
)
CDN_SIZE_RE = re.compile(r"-(\d+)x(\d+)(?=\.(?:jpe?g|png|webp|gif)$)", re.I)
CDN_SCALED_RE = re.compile(r"-scaled(?:-\d+)?(?=\.(?:jpe?g|png|webp|gif)$)", re.I)
CDN_ROTATED_RE = re.compile(r"-rotated(?:-\d+)?(?=\.(?:jpe?g|png|webp|gif)$)", re.I)
STEM_NORM_RE = re.compile(
    r"(?:-scaled(?:-\d+)?|-rotated(?:-\d+)?|-\d+x\d+|_\d{7,}|\.800x\d+w)$",
    re.I,
)


def ahash_bits(path: Path) -> int | None:
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((AHASH_SIZE, AHASH_SIZE), Image.Resampling.BILINEAR)
            pixels = list(im.getdata())
    except Exception:
        return None
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, p in enumerate(pixels):
        if p >= avg:
            bits |= 1 << i
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def item_paths(item) -> tuple[str, str, Path | None]:
    if isinstance(item, str):
        src, local = item, item if not item.startswith("http") else ""
    else:
        src = item.get("src") or ""
        local = item.get("local") or ""
    rel = local or (src if src.startswith("assets/") else "")
    path = ROOT / rel if rel else None
    if path and not path.exists():
        path = None
    return src, local, path


def basename_stem(src: str, local: str) -> str:
    # Prefer remote filename for stem identity (local often has random hash prefix).
    remote = Path((src or "").split("?")[0]).name
    name = remote if remote and not remote.startswith("local") else Path((local or src).split("?")[0]).name
    stem = Path(name).stem
    stem = STEM_NORM_RE.sub("", stem)
    stem = re.sub(r"-(?:1280x|2048x|1600x\d+|950x\d+-crop(?:-q\d+)?)$", "", stem, flags=re.I)
    stem = re.sub(r"^[0-9a-f]{8,12}_", "", stem, flags=re.I)
    # Drop synthetic pad suffixes so w17sc95 shares stem with parent only via ahash
    stem = re.sub(r"_w17(?:sc\d*|r\d*|sq|dsc\d*|fsc\d*|hsc\d*|redl|dsh)$", "", stem, flags=re.I)
    stem = re.sub(r"_w1[3-6]var$", "", stem, flags=re.I)
    return stem.lower()


def content_id_from_url(src: str) -> str | None:
    """Kirby-style /media/pages/.../<hash>-<ts>/<name> → hash as content family."""
    m = re.search(r"/([0-9a-f]{10,12})-\d{10}/([^/?#]+)$", src or "", re.I)
    if m:
        return m.group(1).lower()
    return None


def is_pad_marker(src: str, local: str, item: dict | None) -> str | None:
    low_src = (src or "").lower()
    name = Path(local or src).name
    if "local-variant://" in low_src:
        return "local-variant"
    if PAD_NAME_RE.search(name):
        return "wN-variant-name"
    path_only = (src or local).split("?")[0]
    if CDN_RES_ONLY_RE.search(path_only) or re.search(
        r"-(?:1280x|2048x)(?=\.(?:jpe?g|png|webp|gif)$)", path_only, re.I
    ):
        return "cdn-res-copy"
    if CDN_SCALED_RE.search(path_only):
        # WordPress -scaled alone is often the full image; only pad if paired with thumbs
        # Keep as soft marker for reporting, not for collapsing unique alone.
        pass
    if CDN_ROTATED_RE.search(path_only):
        return "cdn-rotated"
    m = CDN_SIZE_RE.search(path_only)
    if m:
        w, h = int(m.group(1)), int(m.group(2))
        if max(w, h) <= 600:
            return "cdn-size-thumb"
    return None


def cluster_unique(entries: list[dict]) -> list[list[int]]:
    """Greedy cluster by ahash / stem / filesize proximity. Returns clusters of indices."""
    n = len(entries)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        for j in range(i + 1, n):
            ei, ej = entries[i], entries[j]
            if ei.get("content_id") and ei["content_id"] == ej.get("content_id"):
                union(i, j)
                continue
            if ei["stem"] and ei["stem"] == ej["stem"]:
                union(i, j)
                continue
            if ei["ahash"] is not None and ej["ahash"] is not None:
                if hamming(ei["ahash"], ej["ahash"]) <= AHASH_HAMMING_MAX:
                    union(i, j)
                    continue
            # Do NOT union two unrelated pads via similar filesize/aspect — that
            # transitively collapses distinct OEM angles (e.g. Transrotor 1280x copies).

    clusters: dict[int, list[int]] = {}
    for i in range(n):
        clusters.setdefault(find(i), []).append(i)
    return list(clusters.values())


def analyze_gallery(gallery: list) -> dict:
    entries = []
    pad_slots = 0
    pad_reasons: Counter = Counter()
    for idx, raw in enumerate(gallery or []):
        item = raw if isinstance(raw, dict) else None
        src, local, path = item_paths(raw)
        reason = is_pad_marker(src, local, item)
        if reason:
            pad_slots += 1
            pad_reasons[reason] += 1
        ah = ahash_bits(path) if path else None
        wh = None
        nbytes = None
        if path and path.exists():
            nbytes = path.stat().st_size
            try:
                with Image.open(path) as im:
                    wh = im.size
            except Exception:
                wh = None
        elif item:
            nbytes = item.get("bytes")
            if item.get("w") and item.get("h"):
                wh = (int(item["w"]), int(item["h"]))
        entries.append(
            {
                "i": idx,
                "src": src,
                "local": local,
                "stem": basename_stem(src, local),
                "content_id": content_id_from_url(src),
                "ahash": ah,
                "bytes": nbytes,
                "wh": wh,
                "pad_reason": reason,
            }
        )

    clusters = cluster_unique(entries)
    # Perceptual clusters = distinct angles (including OEM packs saved as w17cdn).
    real_unique = len(clusters) if clusters else 0
    gal_len = len(entries)
    has_padding = pad_slots > 0 or (gal_len > real_unique)

    if real_unique >= MULTI_MIN:
        klass = "true_multi_angle"
    elif real_unique <= 1:
        klass = "single_real"
    else:
        klass = "padded"

    # Claimed ≥4 slots that collapse below 4 → not true multi
    if gal_len >= MULTI_MIN and real_unique < MULTI_MIN:
        if real_unique <= 1:
            klass = "single_real"
        else:
            klass = "padded"

    return {
        "galleryLen": gal_len,
        "uniqueDistinct": real_unique,
        "clusterCount": len(clusters),
        "padSlots": pad_slots,
        "padReasons": dict(pad_reasons),
        "hasPadding": bool(has_padding),
        "class": klass,
        "slots": [
            {
                "i": e["i"],
                "local": e["local"],
                "src": e["src"][:160],
                "pad": e["pad_reason"],
                "ahash": format(e["ahash"], "016x") if e["ahash"] is not None else None,
                "bytes": e["bytes"],
                "wh": list(e["wh"]) if e["wh"] else None,
            }
            for e in entries
        ],
    }


def main() -> None:
    items = []
    tallies = Counter()
    pad_reason_all = Counter()
    for path in sorted(PDP.glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        gallery = d.get("gallery") or []
        analysis = analyze_gallery(gallery)
        tallies[analysis["class"]] += 1
        for r, c in analysis["padReasons"].items():
            pad_reason_all[r] += c
        row = {
            "id": d.get("id")
            or (int(path.stem) if path.stem.isdigit() else path.stem),
            "name": d.get("name"),
            "slug": d.get("slug"),
            "cat": d.get("cat") or (d.get("cats") or [None])[0],
            "price": d.get("price") or 0,
            "galleryHitl": bool(d.get("galleryHitl")),
            **{k: analysis[k] for k in (
                "galleryLen",
                "uniqueDistinct",
                "clusterCount",
                "padSlots",
                "padReasons",
                "hasPadding",
                "class",
            )},
        }
        items.append(row)

    items.sort(key=lambda x: (-(x.get("price") or 0), str(x["id"])))
    total = len(items)
    padded_n = tallies["padded"]
    single_n = tallies["single_real"]
    multi_n = tallies["true_multi_angle"]
    # % padded among all PDPs; also % among those with gal>=4 claiming multi
    claimed = [x for x in items if x["galleryLen"] >= MULTI_MIN]
    claimed_padded = [x for x in claimed if x["class"] != "true_multi_angle"]

    top_padded = [
        {
            "id": x["id"],
            "name": x["name"],
            "cat": x["cat"],
            "price": x["price"],
            "galleryLen": x["galleryLen"],
            "uniqueDistinct": x["uniqueDistinct"],
            "padSlots": x["padSlots"],
            "padReasons": x["padReasons"],
            "class": x["class"],
        }
        for x in items
        if x["class"] in ("padded", "single_real") and x["hasPadding"]
    ][:40]

    hitl_oneshot = [
        {
            "id": x["id"],
            "name": x["name"],
            "cat": x["cat"],
            "price": x["price"],
            "galleryLen": x["galleryLen"],
            "uniqueDistinct": x["uniqueDistinct"],
            "padSlots": x["padSlots"],
            "galleryHitl": x["galleryHitl"],
        }
        for x in items
        if x["class"] == "single_real"
    ]
    hitl_oneshot.sort(key=lambda x: (-(x["price"] or 0), str(x["id"])))

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "criteria": {
            "multiMin": MULTI_MIN,
            "ahashSize": AHASH_SIZE,
            "ahashHammingMax": AHASH_HAMMING_MAX,
            "padPatterns": [
                "local-variant://",
                "w17sc/r/sq/cdn/dsc/fsc/hsc/redl",
                "w13var/w14var",
                "CDN -scaled / -rotated / -NxN≤600",
                "ahash near-dup + stem normalize",
            ],
        },
        "totalPdp": total,
        "counts": {
            "true_multi_angle": multi_n,
            "padded": padded_n,
            "single_real": single_n,
        },
        "pct": {
            "true_multi_angle": round(100.0 * multi_n / total, 2) if total else 0,
            "padded": round(100.0 * padded_n / total, 2) if total else 0,
            "single_real": round(100.0 * single_n / total, 2) if total else 0,
            "padded_of_claimed_gal4plus": round(
                100.0 * len(claimed_padded) / len(claimed), 2
            )
            if claimed
            else 0,
            "not_true_multi": round(100.0 * (total - multi_n) / total, 2) if total else 0,
        },
        "padReasonTallies": dict(pad_reason_all.most_common()),
        "claimedGal4Plus": len(claimed),
        "claimedButNotTrueMulti": len(claimed_padded),
        "topPaddedByPrice": top_padded,
        "hitlTrueOneshot": hitl_oneshot[:80],
        "hitlTrueOneshotCount": len(hitl_oneshot),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"audit {total}: multi={multi_n} padded={padded_n} single_real={single_n} "
        f"→ {OUT.relative_to(ROOT)} | %padded={payload['pct']['padded']} "
        f"%not_true_multi={payload['pct']['not_true_multi']}"
    )


if __name__ == "__main__":
    main()
