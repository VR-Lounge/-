# PDP enrichment (web research)

## Meager bar (raised, Nov 2026)

Flag as **meager** if **ANY** of:

1. `descriptionHtml` visible text &lt; 500 chars **or** stub / English scrap heuristics  
2. Gallery &lt; 4 images **or** single low-res frame  
3. No structured `specs[]`

Audit: `python3 data/enrichment/audit_meager.py` → `meager-queue.json` + `meager-audit-summary.json`.

## This wave (meager bar)

- Gold standard: **Precide ERGO AMT** (`4322` / `#product/nayshniki_Precide_ERGO_AMT`) — RU editorial + AMT glossary (`<aside>` / `<abbr>`), 12 specs, 9-frame gallery under `assets/enriched/4322/`.
- Also enriched: Precide AMP 2 / AMT+AMP2 kit, Precide Heil Kithara, T+A Solitaire P-SE (±Pentaconn), Denon AH-D9200/D7200, B&W Px7 S2e, PS Audio BHK 600, Clearaudio Reference Jubilee, T+A P 3100 HV / MP 3000 HV MKII, Hegel H600 (gallery top-up), Acoustic Revive RHC-2.5 family (9 SKUs).
- Batches: `batch-meager-0{1,2,3,4}-researched.json`. Apply:  
  `python3 data/enrichment/apply_enrichment.py --pattern 'batch-meager-*-researched.json' --merge-provenance`  
  then `python3 data/enrichment/sync_catalog_from_pdp.py`.

## Sources approach

Prefer manufacturer pages (Precide / Precide A+, T+A, Denon, B&W, Hegel, PS Audio, Clearaudio, Acoustic Revive). Research via Exa + Tavily. On conflicts (e.g. ERGO AMT 3 vs 3,5 Ω / 595 vs 650 g) — cite both, never invent a third number.

## HITL

- Spot-check tone vs `CLIENT-PORTRAIT.md`.
- Precide AMT: confirm AMP/adaptor kit vs headphones-only SKU before publish.
- PS Audio BHK 600: discontinued-new-production note.
- Cable families (SAEC / Nordost / AQ): still meager mostly on **gallery &lt; 4** — Woo Store often has 1 image; need OEM packs next wave.
- Remaining meager queue is large (~1300+) dominated by gallery-thin accessories/cables/acoustics — prioritize flagships + headphones, continue in subsequent waves.

## Queue

- `meager-queue.json` — full audit under raised bar  
- `remaining-sparse-queue.json` — prior empty/junk wave (drained)  
- `wave2-queue.json` — historical  
