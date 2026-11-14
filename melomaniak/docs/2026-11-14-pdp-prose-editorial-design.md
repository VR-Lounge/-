# PDP «О продукте» — Editorial salon column (approved)

**Date:** 2026-11-14  
**Status:** Approved by Alexander (option **A**) — implemented on `cursor/melomaniak-redesign-elite-7a29`.

## Decision

Replace the narrow left «портянка» with a full-width **editorial salon column**: black/gold Melomaniak typography, sourced Woo copy only, no invented specs.

## Rules shipped

1. **Width:** `#pdp-about` / `.pdp-section` use full `.wrap` width; `.pdp-prose` is not capped at 68ch. Paragraphs keep an elegant ~72ch measure; lists, tables, and chips use available width.
2. **Subheads:** `h2`/`h3`, lone `<p><strong>…</strong></p>`, and sourced `<p><strong>Title</strong><br>body…</p>` splits → `.pdp-prose-sub` in Cormorant gold, with hairline rules between blocks.
3. **Lists:** Gold hairline markers; list text in ink (not muted).
4. **Pull-quote:** Only from a short sourced opening paragraph (≈24–180 chars); never generated.
5. **Feature chips:** Only from the first feature `<ul>` — chip labels are existing `<li>` text or the lead clause before `:`/`–` (cap 8). Hairline gold chips, not pill clutter.
6. **Sanitize:** Client allowlist + strip of `@@@…@@@` / broken manual shells; no AI rewrite of Woo HTML.

## Non-goals

- Split feature-rail layout (option B)
- Cards / invented product facts / AI paraphrasing
