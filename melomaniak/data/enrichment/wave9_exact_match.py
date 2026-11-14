#!/usr/bin/env python3
"""Wave 9: maximize meager clears via product-ID Woo + exact filename tokens.

Safe tactics only (no fuzzy brand / series-sibling matching):
  1) Unique Woo Store API images for the same product ID
  2) wp/v2 media?parent={id} for near-clear / priority SKUs
  3) wp/v2 media?search={exact model token} filtered to filename containing token
  4) from-live files containing the same exact model/SKU/Woo-stem token
  5) Cables: only filenames that contain the same SKU/model string

Priority: Усилители → Акустика → Источники → Наушники/ЦАПы/Ресиверы → Кабели → Другое
"""
from __future__ import annotations

import ast
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDP = ROOT / "data" / "pdp"
LIVE = ROOT / "assets" / "from-live" / "products"
ENRICH = ROOT / "data" / "enrichment"
QUEUE = ENRICH / "meager-queue.json"
CATALOG = ROOT / "data" / "catalog-full.json"
CACHE = ENRICH / "woo-cache"
MEDIA_CACHE = ENRICH / "media-search-cache"
BATCH_OUT = ENRICH / "batch-meager-45-wave9.json"
SHOP = "https://xn--80aannlcfckh.xn--p1ai"
API = f"{SHOP}/wp-json/wc/store/v1/products"
UA = "Mozilla/5.0 (compatible; MELOMANIAK-wave9/1.0)"
PRIO = [
    "Усилители",
    "Акустика",
    "Источники",
    "Наушники",
    "ЦАПы",
    "Ресиверы",
    "Кабели",
    "Другое",
    "Спецпредложения",
    "Видео",
]
STOP = {
    "black",
    "white",
    "silver",
    "gloss",
    "audio",
    "labs",
    "the",
    "and",
    "cable",
    "mkii",
    "mk2",
    "mk",
    "pair",
    "set",
    "high",
    "scaled",
    "standard",
    "walnut",
    "cover",
    "rear",
    "front",
    "thumb",
    "image",
    "img",
}


def enc(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(
        (
            p.scheme,
            p.netloc,
            urllib.parse.quote(urllib.parse.unquote(p.path), safe="/':@!$&()*+,;="),
            p.query,
            "",
        )
    )


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def live_body(fn: str) -> str:
    m = re.match(r"^[0-9a-f]{8,12}_(.+)$", fn, re.I)
    return (m.group(1) if m else fn).lower()


def prio(cat: str) -> int:
    try:
        return PRIO.index(cat)
    except ValueError:
        return 99


def full_image_url(src: str) -> str:
    if not src:
        return src
    return re.sub(r"-(\d+)x(\d+)(\.(?:jpe?g|png|webp|gif))$", r"\3", src, flags=re.I)


def brand_of(name: str) -> str:
    m = re.search(r"[A-Za-z][A-Za-z0-9&\.]+", name or "")
    return (m.group(0).lower() if m else "")


def parse_gal_list(raw) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            v = ast.literal_eval(raw)
            return v if isinstance(v, list) else []
        except Exception:
            return []
    return []


def shorten_stem(stem: str) -> str:
    s = stem.lower()
    s = re.sub(r"(-scaled(?:-\d+)?|-e\d+|_\d{7,}(?:-\d+)?|\.800x600w|-\d+x\d+)$", "", s)
    s = re.sub(r"_\d{7,}(?:-\d+)?$", "", s)
    s = re.sub(r"-\d{1,2}$", "", s)
    return s.strip("-_")


def build_live_index() -> dict[str, list[str]]:
    inv: dict[str, list[str]] = defaultdict(list)
    nfiles = 0
    for f in LIVE.iterdir():
        if not f.is_file():
            continue
        nfiles += 1
        body = live_body(f.name)
        n = norm(body)
        for t in re.findall(r"[a-z]*\d[a-z0-9]*", n):
            if len(t) >= 3:
                inv[t].append(f.name)
        for t in re.findall(r"[a-z]{5,}", n):
            inv[t].append(f.name)
        if len(n) >= 8:
            inv[n].append(f.name)
    print(f"live={nfiles} inv={len(inv)}")
    return inv


def extract_exact_keys(
    name: str,
    sku: str,
    woo_names: list[str],
    catalog_paths: list[str],
    is_cable: bool,
) -> list[str]:
    keys: list[str] = []
    if sku and len(sku.strip()) >= 3:
        keys.append(sku.strip().lower())

    for p in catalog_paths:
        raw = str(p).replace("local://", "")
        stem = Path(urllib.parse.unquote(raw.split("?")[0])).stem
        m = re.match(r"^[0-9a-f]{8,12}_(.+)$", stem, re.I)
        stem = m.group(1) if m else stem
        if re.fullmatch(r"[0-9a-f]{16,}", stem, re.I):
            continue
        st = shorten_stem(stem)
        if len(norm(st)) >= 5 and not re.fullmatch(r"[0-9a-f]{10,}", st, re.I):
            keys.append(st)
        for t in re.findall(
            r"[a-z]{1,}\d[\w.\-]*|\d+[a-z][\w.\-]*|[a-z]{2,}(?:-[a-z0-9]+)+",
            st.lower(),
        ):
            if t not in STOP and len(norm(t)) >= 3:
                keys.append(t)

    for wn in woo_names:
        stem = Path(wn).stem
        if re.fullmatch(r"[0-9a-f]{16,}", stem, re.I):
            continue
        st = shorten_stem(stem)
        if len(norm(st)) >= 5:
            keys.append(st)
        for t in re.findall(
            r"[a-z]{1,}\d[\w.\-]*|\d+[a-z][\w.\-]*|[a-z]{2,}(?:-[a-z0-9]+)+",
            st.lower(),
        ):
            if t not in STOP and len(norm(t)) >= 3:
                keys.append(t)

    for p in re.findall(r"\(([^)]+)\)", name or ""):
        for t in re.findall(
            r"[a-z0-9]+(?:[.\-][a-z0-9]+)+|[a-z]+\d[\w]*|\d+[a-z][\w]*",
            p.lower(),
        ):
            if t not in STOP and len(norm(t)) >= 3:
                keys.append(t)

    cleaned = re.sub(r"[А-Яа-яЁё]+", " ", name or "")
    for t in re.findall(
        r"[A-Za-z]{1,}\d[\w.\-]*|\d+[A-Za-z][\w.\-]*|[A-Za-z]{2,}(?:-[A-Za-z0-9]+)+",
        cleaned,
    ):
        tl = t.lower()
        if tl not in STOP and len(norm(tl)) >= 3 and any(c.isdigit() for c in tl):
            keys.append(tl)

    out: list[str] = []
    seen: set[str] = set()
    for k in keys:
        k = k.strip(".-_")
        n = norm(k)
        if len(n) < 3 or n in seen or k in STOP:
            continue
        if re.fullmatch(r"[0-9a-f]{10,}", n):
            continue
        if n.startswith("live") and n[4:].isdigit():
            continue
        seen.add(n)
        out.append(k)

    if is_cable:
        out = [
            k
            for k in out
            if (any(c.isdigit() for c in k) and len(norm(k)) >= 4)
            or len(norm(k)) >= 10
        ]
    else:
        out = [
            k
            for k in out
            if any(c.isdigit() for c in k) or len(norm(k)) >= 8 or "-" in k or "_" in k
        ]
    out.sort(key=lambda x: len(norm(x)), reverse=True)
    return out


def key_in_name(key: str, filename: str) -> bool:
    kn = norm(key)
    bn = norm(filename)
    if len(kn) < 3 or kn not in bn:
        return False
    if len(kn) <= 5 and any(c.isdigit() for c in kn):
        idx = bn.find(kn)
        while idx >= 0:
            before = bn[idx - 1] if idx > 0 else ""
            after = bn[idx + len(kn)] if idx + len(kn) < len(bn) else ""
            if not before.isdigit() and not after.isdigit():
                return True
            idx = bn.find(kn, idx + 1)
        return False
    return True


def match_live(brand: str, keys: list[str], inv: dict[str, list[str]], is_cable: bool) -> list[str]:
    if not keys:
        return []
    brand_n = norm(brand) if brand else ""
    cands: set[str] = set()
    for k in keys[:10]:
        kn = norm(k)
        if len(kn) < 3:
            continue
        for t in re.findall(r"[a-z]*\d[a-z0-9]*", kn):
            if len(t) >= 3:
                cands.update(inv.get(t, []))
        if len(kn) >= 5:
            cands.update(inv.get(kn, []))
        for part in re.split(r"[-_]+", k.lower()):
            pn = norm(part)
            if len(pn) >= 5:
                cands.update(inv.get(pn, []))

    hits: list[tuple[int, str]] = []
    for fn in cands:
        body = live_body(fn)
        bnorm = norm(body)
        if brand_n and len(brand_n) >= 3 and brand_n not in bnorm:
            if not any(len(norm(k)) >= 10 and norm(k) in bnorm for k in keys[:5]):
                continue
        best = 0
        for k in keys:
            if key_in_name(k, body):
                best = max(best, len(norm(k)))
        if best >= 4:
            hits.append((best, fn))
    if not hits:
        return []
    max_l = max(h[0] for h in hits)
    floor = max_l if is_cable else max(max_l - 2, 5)
    hits = [h for h in hits if h[0] >= floor]
    hits.sort(key=lambda h: -h[0])
    return [h[1] for h in hits]


def http_json(url: str) -> object | None:
    try:
        req = urllib.request.Request(
            enc(url),
            headers={"User-Agent": UA, "Accept": "application/json", "Referer": SHOP + "/"},
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        print(f"  http fail: {e}")
        return None


def fetch_batch(pids: list[int]) -> dict[int, dict]:
    out: dict[int, dict] = {}
    need: list[int] = []
    CACHE.mkdir(parents=True, exist_ok=True)
    for pid in pids:
        c = CACHE / f"{pid}.json"
        if c.exists():
            try:
                out[pid] = json.loads(c.read_text(encoding="utf-8"))
                continue
            except Exception:
                pass
        need.append(pid)
    for i in range(0, len(need), 40):
        chunk = need[i : i + 40]
        ids = ",".join(str(x) for x in chunk)
        data = http_json(f"{API}?include={ids}&per_page=100")
        got: dict[int, dict] = {}
        if isinstance(data, list):
            got = {int(d["id"]): d for d in data if isinstance(d, dict) and "id" in d}
        for pid, d in got.items():
            out[pid] = d
            (CACHE / f"{pid}.json").write_text(
                json.dumps(d, ensure_ascii=False), encoding="utf-8"
            )
        for pid in chunk:
            if pid not in got:
                out.setdefault(pid, {})
                (CACHE / f"{pid}.json").write_text("{}", encoding="utf-8")
        time.sleep(0.1)
        print(f"  woo {min(i + 40, len(need))}/{len(need)}")
    return out


def fetch_media_parent(pid: int) -> list[dict]:
    data = http_json(f"{SHOP}/wp-json/wp/v2/media?parent={pid}&per_page=100")
    return data if isinstance(data, list) else []


def fetch_media_search(token: str) -> list[dict]:
    MEDIA_CACHE.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", token)[:80] or "x"
    cache = MEDIA_CACHE / f"{safe}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except Exception:
            pass
    q = urllib.parse.quote(token)
    data = http_json(f"{SHOP}/wp-json/wp/v2/media?search={q}&per_page=40")
    rows = data if isinstance(data, list) else []
    cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.08)
    return rows


def existing_names(gal: list) -> tuple[set[str], set[str]]:
    srcs: set[str] = set()
    names: set[str] = set()
    for g in gal:
        for k in ("src", "thumb", "local"):
            v = g.get(k) or ""
            if not v:
                continue
            srcs.add(full_image_url(v))
            srcs.add(v)
            fn = Path(urllib.parse.unquote(v.split("?")[0])).name.lower()
            names.add(fn)
            if v.startswith("local://"):
                names.add(v[8:].lower())
    return srcs, names


def collect_cat_paths(cinfo: dict, gal: list) -> list[str]:
    cat_paths = parse_gal_list(cinfo.get("gallery"))
    thumb = cinfo.get("thumbLocal") or cinfo.get("thumb") or ""
    if thumb:
        cat_paths = list(cat_paths) + [thumb]
    for g in gal:
        for k in ("local", "thumb", "src"):
            v = g.get(k) or ""
            if "from-live" in v or v.startswith("local://"):
                cat_paths.append(v.replace("local://", ""))
    return cat_paths


def main() -> None:
    q = json.loads(QUEUE.read_text(encoding="utf-8"))["items"]
    catalog = {
        str(p["id"]): p
        for p in json.loads(CATALOG.read_text(encoding="utf-8"))["products"]
    }
    items = sorted(
        q,
        key=lambda x: (
            prio(x.get("cat") or ""),
            -(x.get("gallery") or 0),
            -(x.get("price") or 0),
        ),
    )
    print(f"meager={len(items)}")
    inv = build_live_index()
    print("Woo Store API…")
    woo_map = fetch_batch([int(it["id"]) for it in items])

    # Pass 1: offline woo + from-live exact match
    work: list[dict] = []
    for it in items:
        pid = str(it["id"])
        raw = woo_map.get(int(pid)) or {}
        imgs = list(raw.get("images") or [])
        woo_names = [(im.get("name") or Path(im.get("src") or "").name) for im in imgs]
        pdp = json.loads((PDP / f"{pid}.json").read_text(encoding="utf-8"))
        gal = list(pdp.get("gallery") or [])
        cinfo = catalog.get(pid, {})
        cat_paths = collect_cat_paths(cinfo, gal)
        is_cable = (it.get("cat") == "Кабели") or (
            "кабель" in (it.get("name") or "").lower()
        )
        sku = (raw.get("sku") or "") or (pdp.get("sku") or "") or ""
        keys = extract_exact_keys(it["name"], sku, woo_names, cat_paths, is_cable)
        brand = brand_of(it["name"]) or brand_of(raw.get("name") or "")
        work.append(
            {
                "it": it,
                "pid": pid,
                "raw": raw,
                "imgs": imgs,
                "pdp": pdp,
                "gal": gal,
                "keys": keys,
                "brand": brand,
                "is_cable": is_cable,
            }
        )

    # Pass 2: parent media + media search only where still short after offline estimate
    batch: dict[str, dict] = {}
    file_use: Counter = Counter()
    parent_calls = 0
    search_calls = 0

    for i, w in enumerate(work):
        pid = w["pid"]
        it = w["it"]
        imgs = list(w["imgs"])
        gal = w["gal"]
        keys = w["keys"]
        brand = w["brand"]
        is_cable = w["is_cable"]
        raw = w["raw"]
        pdp = w["pdp"]

        srcs, names = existing_names(gal)
        # estimate offline adds
        offline_urls = []
        for im in imgs:
            src = full_image_url(im.get("src") or "")
            if not src or src in srcs:
                continue
            fn = Path(src.split("?")[0]).name.lower()
            if fn in names:
                continue
            offline_urls.append(src)
            names.add(fn)
        live_hits = match_live(brand, keys, inv, is_cable)
        offline_live = []
        for fn in live_hits:
            if fn.lower() in names:
                continue
            offline_live.append(fn)
            names.add(fn.lower())

        projected = len(gal) + len(offline_urls) + len(offline_live)
        need_net = projected < 4 and len(gal) < 4

        # Parent media: near-clear priority only
        if need_net and len(gal) >= 2 and prio(it.get("cat") or "") <= 6:
            parent_calls += 1
            for m in fetch_media_parent(int(pid)):
                src = full_image_url(m.get("source_url") or "")
                if not src:
                    continue
                fn = Path(src.split("?")[0]).name
                if fn.lower() in names:
                    continue
                imgs.append({"src": src, "name": fn})
                names.add(fn.lower())
                offline_urls.append(src)

        # Media search by exact tokens when still short
        if need_net and (len(gal) + len(offline_urls) + len(offline_live)) < 4:
            search_keys = [
                k
                for k in keys[:5]
                if len(norm(k)) >= 6
                and (any(c.isdigit() for c in k) or len(norm(k)) >= 10)
            ]
            for k in search_keys[:2]:
                search_calls += 1
                for m in fetch_media_search(k):
                    src = full_image_url(m.get("source_url") or "")
                    if not src:
                        continue
                    fn = Path(src.split("?")[0]).name
                    if not key_in_name(k, fn):
                        continue
                    if brand and len(norm(brand)) >= 3:
                        if norm(brand) not in norm(fn) and len(norm(k)) < 10:
                            continue
                    if fn.lower() in names:
                        continue
                    imgs.append({"src": src, "name": fn})
                    names.add(fn.lower())
                    offline_urls.append(src)

        # Rebuild final lists cleanly
        srcs, names = existing_names(gal)
        image_urls: list[str] = []
        for im in imgs:
            src = full_image_url(im.get("src") or "")
            if not src or src in srcs:
                continue
            fn = Path(src.split("?")[0]).name.lower()
            if fn in names:
                continue
            image_urls.append(src)
            srcs.add(src)
            names.add(fn)

        local_paths: list[str] = []
        for fn in match_live(brand, keys, inv, is_cable):
            if fn.lower() in names:
                continue
            if is_cable and not any(
                len(norm(k)) >= 4 and key_in_name(k, live_body(fn)) for k in keys[:5]
            ):
                continue
            local_paths.append(f"assets/from-live/products/{fn}")
            names.add(fn.lower())
            file_use[fn] += 1

        need = max(0, 8 - len(gal))
        image_urls = image_urls[:need]
        local_paths = local_paths[: max(0, need - len(image_urls))]

        if image_urls or local_paths:
            batch[pid] = {
                "meagerWave": "meager-w9-2026-11",
                "imageUrls": image_urls,
                "localLivePaths": local_paths,
                "sources": [
                    raw.get("permalink")
                    or pdp.get("source")
                    or ((pdp.get("sources") or [None])[0])
                    or ""
                ],
                "matchKeys": keys[:8],
                "matchBrand": brand,
            }

        if (i + 1) % 100 == 0:
            print(
                f"… {i+1}/{len(work)} batch={len(batch)} "
                f"parent={parent_calls} search={search_calls}"
            )

    polluted = {fn for fn, n in file_use.items() if n > 4}
    if polluted:
        print(f"pollution filter: drop {len(polluted)} files reused >4x")
        for pid, payload in list(batch.items()):
            payload["localLivePaths"] = [
                p
                for p in (payload.get("localLivePaths") or [])
                if Path(p).name not in polluted
            ]
            if not payload.get("imageUrls") and not payload.get("localLivePaths"):
                del batch[pid]

    clears = Counter()
    for pid, payload in batch.items():
        pdp = json.loads((PDP / f"{pid}.json").read_text(encoding="utf-8"))
        galn = len(pdp.get("gallery") or [])
        add = len(payload.get("imageUrls") or []) + len(
            payload.get("localLivePaths") or []
        )
        if galn < 4 and galn + add >= 4:
            clears[pdp.get("cat") or catalog.get(pid, {}).get("cat") or "?"] += 1

    BATCH_OUT.write_text(
        json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"wrote {BATCH_OUT.name} products={len(batch)} "
        f"projected_clears={sum(clears.values())} "
        f"parent={parent_calls} search={search_calls}"
    )
    print("clears by cat", dict(clears))
    shown = 0
    for pid, p in batch.items():
        if shown >= 15:
            break
        galn = len(
            json.loads((PDP / f"{pid}.json").read_text(encoding="utf-8")).get("gallery")
            or []
        )
        add = len(p.get("imageUrls") or []) + len(p.get("localLivePaths") or [])
        mark = "CLEAR" if galn < 4 and galn + add >= 4 else f"gal{galn}+{add}"
        print(
            mark,
            pid,
            catalog.get(pid, {}).get("cat"),
            "urls",
            len(p.get("imageUrls") or []),
            "live",
            [Path(x).name for x in (p.get("localLivePaths") or [])[:3]],
            "keys",
            p.get("matchKeys"),
        )
        shown += 1


if __name__ == "__main__":
    main()
