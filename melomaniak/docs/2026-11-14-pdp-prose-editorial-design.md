# PDP «О продукте» — Editorial salon column (approved)

**Date:** 2026-11-14  
**Status:** Approved by Alexander (option **A**) — iterated on `cursor/melomaniak-redesign-elite-7a29` after visual QA (chips / портянка / width / mobile).

## Decision

Replace the narrow left «портянка» with a full-width **editorial salon column**: black/gold Melomaniak typography, sourced Woo copy only, no invented specs.

## Rules shipped

1. **Width / columns:** `#pdp-about` / `.pdp-section` use full `.wrap` width. Plain prose is **not** capped at 78ch (that left a ~40% void). On **≥1100px**, consecutive long plain paragraphs sit in `.pdp-prose-flow` with **CSS `column-count: 2`** (+ hairline column-rule). Lone long `<p>` also get 2-col. Below 1100px / mobile → single column stacked.
2. **Subheads:** `h2`/`h3`, lone `<p><strong>…</strong></p>`, lone `<p><em>…</em></p>`, sourced `<p><strong>Title</strong><br>body…</p>`, and mid-body `<br><strong>Title</strong>` splits → `.pdp-prose-sub` in Cormorant gold. Double `<br><br>` only splits when already in source.
3. **Rhythm:** Larger paragraph spacing; optional drop-cap (`::first-letter`) on the first long sourced paragraph; lists with gold hairline markers.
4. **Pull-quote:** Only from a short sourced opening paragraph (≈24–180 chars); never generated.
5. **Feature chips:** Only from the first feature `<ul>` — chip labels are existing `<li>` text or the lead clause before `:`/`–` (cap 8). **Hairline gold type:** Outfit weight **200–300**, refined tracking, transparent fill — not chunky.
6. **Mobile (≤480):** Prose ≥16px, chips wrap + tap padding, no forced columns, no horizontal scroll intended.
7. **Sanitize:** Client allowlist + strip of `@@@…@@@` / broken manual shells; unwrap dirty DIV shells so copy survives; drop tracking/`| Купить…` marketplace chrome; no AI rewrite of Woo HTML.

## Non-goals

- Split feature-rail layout (option B)
- Cards / invented product facts / AI paraphrasing / invented paragraph breaks from sentences
