# ReadAloud

A minimal read-aloud tool. Paste text, hear it spoken in Amazon Polly's Matthew voice, follow along word-by-word with real-time highlighting.

**Stack:** Next.js App Router · TypeScript · Tailwind · AWS Polly

## Key Files

CLAUDE.md ← You are here
app/page.tsx ← Main UI shell
app/api/synthesize/route.ts ← Polly synthesis endpoint (audio + speech marks)
components/reader/ ← Reader (state + word spans), PlayerDock, Library dialog, Outline nav
lib/types.ts ← TypeScript interfaces
lib/polly.ts ← AWS Polly client + synthesis helpers
lib/synthesis.ts ← Shared client/server helpers: guards, chunking, segments, mark search
lib/synthesize-client.ts ← Client chunked synthesis: fetch, decode, merge marks + audio
lib/markdown.ts ← Display-only markdown annotations (decorations + outline headings)
lib/playback.ts ← Default playback speed setting (localStorage)
lib/library.ts ← IndexedDB saved-readings library (meta + audio stores)
lib/theme/ ← Theme + font registries (ids, names, isDark flags)
components/theme/ ← ThemeProvider, settings dialog, pre-paint font script
styles/themes/ ← Token contract (\_contract.css) + one CSS file per theme
styles/fonts.css ← [data-font] → --font-active resolution
styles/highlights.css ← [data-highlight] modes + sliding-pill geometry + word-span rules
styles/markdown.css ← Display-only markdown classes (md-\*)
.env.local ← AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

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
- Polly speech marks and audio must be requested in separate API calls — they cannot be streamed together.
- Word highlighting uses binary search against speech marks timestamps, polled from a `requestAnimationFrame` loop while playing — `timeupdate` fires only ~4×/sec and skips words.
- Texts over 3000 chars are chunked client-side (`lib/synthesize-client.ts`): MP3 chunks concatenate into one Blob, and mark times are re-based with exact `decodeAudioData` durations — never estimate durations from the last mark.
- Speech-mark offsets reference the raw pasted text. Never transform it before synthesis (markdown, cleanup) — render styling as char-range decorations instead (`lib/markdown.ts`).
- A word span can fragment across lines (break after a hyphen). The pill measures the first `getClientRects()` fragment, and word spans use `white-space: nowrap` to avoid fragmenting at all.
