# ReadAloud

A minimal read-aloud tool. Paste text, hear it spoken in Amazon Polly's Matthew voice, follow along word-by-word with real-time highlighting.

**Stack:** Next.js App Router · TypeScript · Tailwind · AWS Polly

## Docs

- `docs/ARCHITECTURE.md` ← File map, data flow, design decisions. Check it before adding files or looking for where something lives.
- `docs/AMAZON_POLLY.md` ← The Polly integration: synthesis, speech marks, chunking, timestamp accuracy, and its invariants. Read it before touching `lib/polly.ts`, `lib/synthesis.ts`, `lib/synthesize-client.ts`, or the highlight pipeline.

## Rules

1. `/app` is routing only — zero `'use client'`, zero logic, `page.tsx` ≤ 40 lines
2. Interactivity → `<Name>.client.tsx` in `@/components`
3. No `any`, no `as`, no `enum`
4. Semantic tokens only — no hardcoded colors
5. Components organized by feature domain — never by type
6. Run `npx prettier --write .` after code changes

## File Placement

1. Page shell → `app/<route>/page.tsx` (≤40 lines, no `'use client'`)
2. API endpoint → `app/api/<resource>/<action>/route.ts`
3. TypeScript type/interface → `lib/types.ts`
4. AWS/service logic → `lib/`
5. Component for 1 feature → `components/<feature>/`

## Principles

- Simplicity first — smallest change, touch only what's necessary
- No laziness — root causes, no temp fixes, staff engineer standards
- No side effects — changes must not introduce regressions

## Workflow

- Plan mode first for 2+ step tasks. Re-plan if something breaks.
- Never mark complete without verification.
- Verify with build/lint/typecheck only — no browser automation. The user checks the browser themselves.

## Lessons

- `page.tsx` is a shell, composition only, never `'use client'`. Extract all logic into named components.
- The Polly pipeline's invariants (two-request rule, UTF-8 byte offsets, exact-duration chunk merging, never transforming the synthesized text) are in `docs/AMAZON_POLLY.md` — regressions there break highlighting silently.
- A word span can fragment across lines (break after a hyphen). The pill measures the first `getClientRects()` fragment, and word spans use `white-space: nowrap` — except inside code sections, where spans inherit `pre-wrap` (boundaries between differently-white-spaced spans are line-break opportunities that split tokens like `user_id`).
- Sentence boundaries require terminator + whitespace (`sentenceStarts`), or the tint jumps mid-sentence at "3.5" / "Node.js". No transition on the tint — a crossfade reads as a flash between lines.
