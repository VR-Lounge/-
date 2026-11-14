#!/usr/bin/env python3
"""Audit ALL data/pdp/*.json against raised meager bar; write meager-queue JSON."""
from __future__ import annotations

import html as html_lib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
OUT = ROOT / "data" / "enrichment" / "meager-queue.json"
OUT_SUMMARY = ROOT / "data" / "enrichment" / "meager-audit-summary.json"

DESC_MIN = 500  # visible text chars
GALLERY_MIN = 4


def strip_tags(html: str) -> str:
    s = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html or "")
    s = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def looks_like_stub(text: str) -> bool:
    if not text:
        return True
    t = text.lower()
    if len(text) < 120:
        return True
    if re.search(
        r"\b(without|adaptor|adapter|either|ordered|has to be|amplifier for)\b", t
    ):
        return True
    eng = sum(1 for c in text if "a" <= c.lower() <= "z")
    ru = sum(1 for c in text if "\u0400" <= c <= "\u04ff")
    if eng / max(len(text), 1) > 0.45 and ru < 40 and len(text) < 800:
        return True
    # English scrap + few Russian sentences pattern
    if re.search(r"[A-Za-z]{20,}", text) and ru < 80 and len(text) < 600:
        return True
    return False


def gallery_weak(gallery: list) -> tuple[bool, str]:
    n = len(gallery or [])
    if n < GALLERY_MIN:
        return True, f"gal:{n}"
    # single tiny local file heuristic
    if n == 1:
        g0 = gallery[0] or {}
        local = g0.get("local") or ""
        if local:
            p = ROOT / local
            if p.exists() and p.stat().st_size < 80_000:
                return True, "gal:1_lowres"
    return False, ""


def audit_one(d: dict, stem: str) -> dict | None:
    pid = str(d.get("id") or stem)
    text = strip_tags(d.get("descriptionHtml") or d.get("descriptionText") or "")
    gallery = d.get("gallery") or []
    specs = d.get("specs") or []
    reasons: list[str] = []

    if len(text) < DESC_MIN or looks_like_stub(text):
        reasons.append(f"desc:{len(text)}")
    weak, gal_reason = gallery_weak(gallery)
    if weak:
        reasons.append(gal_reason or f"gal:{len(gallery)}")
    if len(specs) == 0:
        reasons.append("no_specs")

    if not reasons:
        return None

    return {
        "id": int(pid) if str(pid).isdigit() else pid,
        "name": d.get("name"),
        "slug": d.get("slug"),
        "cat": d.get("cat") or (d.get("cats") or [None])[0],
        "price": d.get("price"),
        "descLen": len(text),
        "gallery": len(gallery),
        "specs": len(specs),
        "enriched": bool(d.get("enriched")),
        "reasons": reasons,
        "source": d.get("source"),
        "priority": priority_score(d, reasons),
    }


def priority_score(d: dict, reasons: list[str]) -> int:
    """Higher = enrich first. Headphones/flagships first."""
    cat = (d.get("cat") or "").lower()
    price = d.get("price") or 0
    name = (d.get("name") or "").lower()
    score = 0
    if "науш" in cat:
        score += 10_000
    if any(x in name for x in ("precide", "solitaire", "stax", "hegel", "t+a", "amt")):
        score += 5_000
    if "flag" in name or "signature" in name or "reference" in name:
        score += 2_000
    score += min(int(price or 0) // 1000, 5000)
    # worse cards first within band
    if any(r.startswith("desc:") for r in reasons):
        score += 800
    if any(r.startswith("gal:") for r in reasons):
        score += 400
    if "no_specs" in reasons:
        score += 200
    if d.get("enriched"):
        score -= 1500  # already touched; still meager but deprioritize vs untouched
    return score


def main() -> None:
    items: list[dict] = []
    total = 0
    for path in sorted(PDP.glob("*.json")):
        total += 1
        d = json.loads(path.read_text(encoding="utf-8"))
        hit = audit_one(d, path.stem)
        if hit:
            items.append(hit)

    items.sort(key=lambda x: (-x["priority"], -(x.get("price") or 0), str(x["id"])))

    reason_c = Counter()
    cat_c = Counter()
    for m in items:
        cat_c[m.get("cat") or "?"] += 1
        for r in m["reasons"]:
            reason_c[r.split(":")[0]] += 1

    payload = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "criteria": {
            "descMinChars": DESC_MIN,
            "galleryMin": GALLERY_MIN,
            "stubHeuristics": True,
            "requireSpecs": True,
            "flagIfAny": True,
        },
        "totalPdp": total,
        "meagerCount": len(items),
        "okCount": total - len(items),
        "reasonTallies": dict(reason_c),
        "byCategory": dict(cat_c.most_common()),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {k: payload[k] for k in payload if k != "items"}
    summary["top20"] = [
        {
            "id": x["id"],
            "name": x["name"],
            "cat": x["cat"],
            "price": x["price"],
            "reasons": x["reasons"],
            "enriched": x["enriched"],
        }
        for x in items[:20]
    ]
    OUT_SUMMARY.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"meager {len(items)}/{total} → {OUT.relative_to(ROOT)} "
        f"(headphones={cat_c.get('Наушники', 0)})"
    )


if __name__ == "__main__":
    main()
