# PDP enrichment (web research)

## This run

- Audited all `data/pdp/*.json` (~1887): empty/junk descriptions, missing specs, weak galleries.
- Enriched **44** critically sparse high-value SKUs with manufacturer-sourced copy + specs.
- Marked each with `enriched: true`, `sources: []`, `enrichedAt`, `enrichmentNote` (HITL).
- Official/press photos (no marketplace watermarks) under `assets/enriched/{id}/` + `ATTRIBUTION.md` where downloads succeeded; otherwise kept existing `from-live` galleries.
- Shop UI: enriched PDPs show «Карточка салона» + HITL source count (`shop-app.js`).

## Sources approach

Prefer manufacturer pages (Hegel, PS Audio, T+A, Aurender, Clearaudio, Parasound, Naim, Marantz, Emotiva). Research via Exa + Tavily. On conflicts → manufacturer specs table. No invented watts/impedance.

## HITL

Before publish: spot-check tone vs `CLIENT-PORTRAIT.md`, verify SKU storage variants (Aurender TB), and confirm discontinued notes (e.g. PS Audio BHK 600).

## Queue

See `remaining-sparse-queue.json` (~122 empty/junk descriptions left, mostly accessories/cables + some processors/turntables).
