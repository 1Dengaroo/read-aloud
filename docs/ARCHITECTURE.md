# Architecture

ReadAloud is a Next.js App Router app: paste text, hear it in Amazon
Polly's Matthew voice, follow along with word-level highlighting. For the
Polly/TTS/timestamp details, see [AMAZON_POLLY.md](./AMAZON_POLLY.md).

## Data flow

```
paste text
  └─ Reader (edit mode) ──"Listen"──▶ synthesizeReading (lib/synthesize-client.ts)
       ├─ splitIntoChunks ≤3000 chars          (lib/synthesis.ts)
       ├─ POST /api/synthesize per chunk ×3 concurrent
       │    └─ Polly: mp3 + word speech marks  (lib/polly.ts)
       ├─ decodeAudioData → exact durations → re-base mark times/offsets
       └─ join MP3 Blob + merged marks
  └─ buildSegments(text, marks) → word/filler segments
  └─ ReadingSurface renders segments (+ markdown decorations, code groups)
       └─ usePlayback rAF loop → findActiveMark → activeIndex
            ├─ useHighlightPill → sliding pill over the active word
            ├─ sentence tint via sentenceIndex
            └─ useFollowPlayhead → auto-scroll / "Back to playhead"
  └─ save → IndexedDB (lib/library.ts) → reload without re-synthesis
```

## File map

### App shell (routing only — no logic, no `'use client'`)

| Path                          | Role                                              |
| ----------------------------- | ------------------------------------------------- |
| `app/page.tsx`                | Main shell: centered column, renders `<Reader />` |
| `app/layout.tsx`              | Fonts, theme/font/highlight pre-paint scripts     |
| `app/api/synthesize/route.ts` | Polly endpoint: ≤3000 chars → audio + marks       |
| `app/globals.css`             | Tailwind theme bridge + style imports             |

### Reader feature — `components/reader/`

| Path                        | Role                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `Reader.client.tsx`         | Conductor: edit/read mode, current reading, wires hooks to components |
| `ReadingSurface.client.tsx` | Word/filler spans, markdown styling, code-section wrappers, pill      |
| `PlayerDock.client.tsx`     | Floating control pill: play/pause, scrubber, speed, save, edit        |
| `Library.client.tsx`        | Saved-readings dialog + delete confirm                                |
| `Outline.client.tsx`        | Right-side heading nav (Google-Docs style)                            |
| `usePlayback.ts`            | Audio engine: HTMLAudioElement, rAF word tracking, transport          |
| `useHighlightPill.ts`       | Positions the sliding pill (client-rect measurement)                  |
| `useFollowPlayhead.ts`      | Auto-follow + "Back to playhead" via IntersectionObserver             |
| `useSavedReadings.ts`       | IndexedDB library list/save/remove state                              |
| `useReaderShortcuts.ts`     | Space / arrows / E keyboard shortcuts                                 |
| `reading-dom.ts`            | `wordElement()` — shared `[data-mark]` lookup                         |

### Libraries — `lib/`

| Path                   | Role                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `types.ts`             | All shared TypeScript interfaces                                  |
| `polly.ts`             | AWS Polly client + audio/marks synthesis calls (server-only)      |
| `synthesis.ts`         | Pure shared helpers: guards, chunking, segments, mark search      |
| `synthesize-client.ts` | Chunked synthesis: fetch, decode, merge marks + audio (browser)   |
| `markdown.ts`          | Display-only markdown: decorations, headings/outline, code groups |
| `library.ts`           | IndexedDB saved readings (meta + audio object stores)             |
| `playback.ts`          | Default playback-speed setting (localStorage + change event)      |
| `format.ts`            | Display formatting: clock, dates, listen estimate                 |
| `theme/`               | Theme / font / highlight registries (ids, names, flags)           |

### Theming & styles

| Path                    | Role                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `components/theme/`     | ThemeProvider, settings dialog, pre-paint font/highlight scripts |
| `styles/themes/`        | Token contract (`_contract.css`) + one CSS file per theme        |
| `styles/fonts.css`      | `[data-font]` → `--font-active` resolution                       |
| `styles/highlights.css` | `[data-highlight]` modes, sliding-pill geometry, word-span rules |
| `styles/markdown.css`   | Display-only markdown classes (`md-*`)                           |

Semantic tokens only — every color goes through the theme contract; themes,
fonts, and highlight modes are orthogonal `data-*` attributes on `<html>`,
set pre-paint and persisted in localStorage.

### Config

`.env.local` — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`.

## Key design decisions

- **Presentation never mutates the source text.** Speech-mark offsets
  reference the exact synthesized text, so markdown, code chips, and
  hidden syntax are all char-range decorations over the raw string.
- **The server is a dumb ≤3000-char endpoint.** Chunking, merging, progress,
  and cost guarding live in the browser, which can measure exact audio
  durations via `decodeAudioData`.
- **Imperative hot path, declarative everything else.** The pill and
  auto-scroll are driven by refs/DOM measurement per animation frame;
  React state changes only when the active word index changes (~4/sec).
- **Local-first storage.** Readings live in the browser's IndexedDB; there
  is no backend state beyond the stateless synthesis endpoint.
