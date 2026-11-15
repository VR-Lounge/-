# PR note — gallery padding audit (Wave 18 continue)

Alexander: Wave 17 «meager 0» partly via unique-hash scale/rotate + CDN `-scaled` / `-NxN` — **not** true multi-angle. Uniqueness = SHA / Kirby content-id / **dhash≤5** (ahash alone collapses white-BG studio angles).

## Counts (1887 PDP) — after Wave 18

| class | n | % |
|-------|---|---|
| true multi-angle (≥4 distinct) | **1064** | 56.3% |
| padded (2–3 unique / fillers) | **446** | 23.6% |
| single-real (true 1-shot) | **377** | 20.0% |

Wave 18 this pass: **10 padded → true multi**. Remaining padded **446**, oneshot **377**.

Artifacts: `gallery-padding-audit.json`, `gallery-padding-summary.json`, `wave18-promote.json`.

## Wave 18 → true multi (exact OEM / from-live / press)

- Davis Acoustics Stellar — OEM davis-acoustics.com gallery (8 angles)
- KEF Reference 3 Meta — KEF CDN + Salsify press
- Paradigm Persona 3F — OEM + rear iso `2391` + from-live
- Monitor Audio Platinum 200 3G — OEM front/rear/iso + from-live 5268–5280
- Aurender N200 8Tb + 2Tb — from-live multi-angle rebuild
- Wharfedale Elysian 4 — from-live distinct cluster
- Audio Physic Tempo 25 — dedupe → 4
- Loewe bild i.77 — dedupe → 4
- Audio Physic Virgo 25 plus — strip wrong Virgo V/25 frames; audio.com.pl press → 4

Also: Quad ESL 2912 already true multi after dhash-only metric (prior pass).

## Still HITL (top $)

**Padded:** T+A SD 3100 HV (u=2), Persona C ×2, Triode TRV-P845SE (u=2), ARC SP20+VS115 (u=2), AE Corinium (u=3), Soulnote D-2, PS Audio Stellar M1200, Paradigm XR 13, MA Gold 500/300 5G, Founder 80F (OEM only 2 perceptual angles / finish variants)…

**Oneshot:** Arte 805PP, Virgo 25 / Virgo V (wrong-model stripped), SAEC WE-4700, Herron VTSP 3, Air Tight ATM-1S, ANTHEM AVM 70…

No inventing scale/rotate. Founder 80F PrestaShop 2831–2861 collapse to 2 dhash clusters.
