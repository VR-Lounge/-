#!/usr/bin/env python3
"""Refresh catalog-data.js / catalog-full.json listing flags from local PDP JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
CAT_JSON = ROOT / "data" / "catalog-full.json"
CAT_JS = ROOT / "catalog-data.js"


def strip_len(html: str) -> int:
    s = re.sub(r"(?is)<[^>]+>", " ", html or "")
    return len(re.sub(r"\s+", " ", s).strip())


def main() -> None:
    cat = json.loads(CAT_JSON.read_text(encoding="utf-8"))
    products = cat.get("products") or []
    updated = 0
    for p in products:
        path = PDP / f"{p['id']}.json"
        if not path.exists():
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        html = d.get("descriptionHtml") or ""
        specs = d.get("specs") or []
        gallery = d.get("gallery") or []
        desc_len = strip_len(html) or len(d.get("descriptionText") or "")
        p["hasDesc"] = bool(html.strip() or d.get("descriptionText"))
        p["hasSpecs"] = bool(specs)
        p["descLen"] = desc_len
        p["specCount"] = len(specs)
        def gallery_url(g):
            if isinstance(g, str):
                return g
            if isinstance(g, dict):
                return g.get("local") or g.get("src") or g.get("url") or ""
            return ""

        p["gallery"] = [u for g in gallery if (u := gallery_url(g))]
        # Prefer enriched local hero for listing thumb when present
        enriched_locals = [
            g.get("local")
            for g in gallery
            if isinstance(g, dict) and g.get("enriched") and g.get("local")
        ]
        # Wave22+ often stores bare asset paths as strings
        if not enriched_locals:
            enriched_locals = [
                u
                for u in p["gallery"]
                if isinstance(u, str) and u.startswith("assets/enriched/")
            ]
        if enriched_locals:
            # keep curated display thumbs if already assets/display/
            thumb = p.get("thumb") or ""
            if not thumb.startswith("assets/display/"):
                p["thumb"] = enriched_locals[0]
                p["thumbLocal"] = enriched_locals[0]
        if d.get("enriched"):
            p["enriched"] = True
        updated += 1

    CAT_JSON.write_text(
        json.dumps(cat, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    CAT_JS.write_text(
        "window.MELO_CATALOG="
        + json.dumps(cat, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"synced {updated}/{len(products)} listings from PDP → catalog-data.js")


if __name__ == "__main__":
    main()
