# PR note — gallery padding audit (post Wave 17)

Alexander: Wave 17 «meager 0» partly via unique-hash scale/rotate + CDN `-scaled` / `-NxN` — **not** true multi-angle.

## Counts (1887 PDP)

| class | n | % |
|-------|---|---|
| true multi-angle (≥4 distinct) | 999 | 52.9% |
| padded (2–3 unique / fillers) | 521 | **27.6%** |
| single-real (true 1-shot) | 367 | 19.5% |

Of galleries claiming ≥4 slots: **~46%** are not true multi-angle.

Artifacts: `gallery-padding-audit.json`, `gallery-padding-summary.json`.

## Fixed this pass (5 → true multi)

- Esoteric K-01Xs — OEM esoteric.jp
- Transrotor ZET 1 — OEM angles; dropped 1280x copies
- Transrotor Dark Star Reference — confirmed 4 OEM
- Nordost Tyr 2 speaker + power — live Tyr 2 media packs

Partial: Parasound ZoneMaster 12 → 3 OEM press (HITL 4th). Soulnote D-2 / SAEC WE-4700 — pads stripped, HITL.

Also stripped synthetic pads from **36** top-price fake-4 galleries → honest 1–3 + `galleryHitl`.

## HITL true 1-shot (367)

See `hitlTrueOneshot` in audit JSON. Top $: SAEC WE-4700, Arte Due Volte / 805PP, Herron VTSP 3, Air Tight ATM-1S/ATM 4, Audio Physic AP Pre, Soulnote D-1N, LM 133, …
