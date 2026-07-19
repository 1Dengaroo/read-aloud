# Amazon Polly Integration

Everything about how ReadAloud turns pasted text into speech with accurate,
word-level caption timestamps. Code lives in `lib/polly.ts` (AWS client),
`app/api/synthesize/route.ts` (endpoint), `lib/synthesize-client.ts`
(chunking + merging), and `lib/synthesis.ts` (shared pure helpers).

## What we ask Polly for

Every request uses the same voice configuration (`lib/polly.ts`):

```ts
{ Engine: "neural", VoiceId: "Matthew", LanguageCode: "en-US", TextType: "text" }
```

- **Neural engine** — higher quality than standard; costs more and has a
  smaller per-request input limit (see Limits below).
- **Plain text input** (`TextType: "text"`), never SSML. The raw pasted text
  is sent verbatim — see "The golden invariant" below for why.

## The two-request rule

One Polly request produces ONE output format. Audio and speech marks
**cannot be streamed together**, so every synthesis is two calls run in
parallel (`Promise.all` in the route):

1. `OutputFormat: "mp3"` → the audio. `AudioStream` is converted to a byte
   array and returned to the client as base64.
2. `OutputFormat: "json"` + `SpeechMarkTypes: ["word"]` → the speech marks.
   `AudioStream` here is newline-delimited JSON (NDJSON), one object per
   line, parsed and filtered through the `isSpeechMark` guard.

Both calls use identical voice config and identical text, so the marks line
up with the audio sample-for-sample.

## Speech mark anatomy

Each mark describes one spoken word:

```json
{ "time": 6, "type": "word", "start": 0, "end": 5, "value": "Hello" }
```

- `time` — **milliseconds from the start of the audio stream** at which the
  word begins being spoken. This is the caption timestamp.
- `start` / `end` — **UTF-8 byte offsets** into the exact text that was
  synthesized. NOT JavaScript string indices: any non-ASCII character (é,
  em-dash, emoji) makes them diverge. `buildSegments` walks the text with
  `TextEncoder` to build a byte→char map before slicing.
- `value` — the token as Polly heard it.

What gets a mark and what doesn't:

- Words get marks. **Punctuation, markdown syntax (`**`, `#`, backticks),
  and whitespace do not** — they end up in "filler" segments between words.
  This is why hiding markdown syntax with CSS can never move a highlight.
- Polly tokenizes on its own rules: `user_id` becomes TWO marks ("user",
  "id") with the underscore as filler between them. Numbers, hyphenated
  words, and abbreviations can also split unexpectedly. Never assume one
  visual token = one mark.
- Marks are emitted in text order with non-decreasing times.

## The server endpoint

`POST /api/synthesize` with `{ text: string }`:

- Rejects empty or >3000-char (post-trim) input with 400.
- **Trims the text** before synthesizing — this matters for chunking (below).
- Returns `{ text, audio, marks }` where `text` is the exact trimmed string
  the marks reference, `audio` is base64 MP3.
- Polly failures surface as 502 with the underlying message.

Credentials come from `.env.local` (`AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) via the SDK's default chain.

## Limits, pricing, throttling

| Constraint               | Value                      | Where enforced                       |
| ------------------------ | -------------------------- | ------------------------------------ |
| Neural input per request | 3000 chars                 | `MAX_CHUNK_LENGTH`, route + splitter |
| Neural default throttle  | ~8 requests/sec            | chunk concurrency 3 (= ≤6 calls/sec) |
| Neural price             | ~$16 per 1M chars          | —                                    |
| App total-text ceiling   | 100,000 chars (~$1.60/run) | `MAX_TEXT_LENGTH`, client-side       |

`MAX_TEXT_LENGTH` is a **cost guard, not a technical limit** — raise the
constant in `lib/synthesis.ts` if needed.

## Texts over 3000 chars: chunking

The server stays a dumb ≤3000-char endpoint; the client does the work
(`lib/synthesize-client.ts`):

1. **Split** (`splitIntoChunks` in `lib/synthesis.ts`): contiguous slices of
   the trimmed text, each ≤3000 chars. Cuts prefer a sentence end
   (terminator followed by whitespace — never inside `3.5` or `Node.js`),
   then any whitespace, then a hard cut that never splits a surrogate pair.
   Cuts are only taken past the halfway point so no chunk is degenerate.
   **Every chunk starts at a non-whitespace character** — the server trims
   each chunk, and a trimmed-away leading space would silently shift every
   mark offset in that chunk.
2. **Fetch** with concurrency 3 (each chunk = 2 Polly calls, staying under
   the throttle). Progress is reported per finished chunk for the
   "Preparing 3 / 12" UI.
3. **Merge** — see next section.

## Accurate timestamps across chunks (the important part)

Marks from chunk _k_ are relative to chunk _k_'s own audio and text. To make
them valid against the joined audio and full text:

- **Time re-basing:** `mark.time += Σ durationMs of all previous chunks`.
  The duration of each chunk is measured by **decoding its MP3 with
  `AudioContext.decodeAudioData`** — sample-exact, including trailing
  silence and encoder padding. Never estimate a chunk's duration from its
  last mark's time: the gap between the last word's start and the true end
  of the audio (word length + silence) would accumulate as drift, and the
  highlight would run seconds ahead by the tenth chunk.
- **Offset re-basing:** `mark.start/end += UTF-8 byte length of the full
text before the chunk` (computed cumulatively with `TextEncoder`).
- **Audio joining:** chunk MP3 byte streams are concatenated in order into
  one `Blob`. Polly MP3 is CBR, so browsers play and seek the concatenation
  reliably. The exact total duration (sum of decoded durations) is kept on
  the reading for the scrubber; library loads fall back to the last mark's
  time until `loadedmetadata` reports the real duration.
- Gotcha: `decodeAudioData` **detaches** the `ArrayBuffer` you pass it —
  decode a copy (`buffer.slice(0)`) and keep the original bytes for the
  joined Blob.

The merged result is indistinguishable from a single-request synthesis:
one text, one MP3 Blob, one sorted mark array. Everything downstream
(segments, highlighting, the IndexedDB library) is chunk-agnostic.

## From timestamps to the word highlight

1. `buildSegments(text, marks)` maps byte offsets to char offsets and splits
   the full text into **word segments** (carrying their mark index) and
   **filler segments** (everything between words). Fillers are split around
   line-break whitespace runs so the sentence tint never paints onto empty
   lines. Each segment records its `charStart` and sentence index
   (sentence = terminator + whitespace rule).
2. During playback, `usePlayback` polls `audio.currentTime` in a
   `requestAnimationFrame` loop — `timeupdate` fires only ~4×/sec and skips
   words at a 300ms/word cadence.
3. `findActiveMark(marks, currentTime * 1000)` binary-searches for the last
   mark whose `time` ≤ the playhead → the active word index.
4. `useHighlightPill` positions the sliding pill over that word's span
   (`[data-mark]`), measuring client rects (first line fragment for words;
   the whole wrapper fragment for code sections, which highlight as one
   unit).
5. Seeking is the same math in reverse: clicking a word sets
   `audio.currentTime = mark.time / 1000`; the outline nav does the same
   with a heading's first word.

## The golden invariant

**Mark offsets reference the exact text that was synthesized.** Therefore
the text is never transformed — not for markdown, not for cleanup. Markdown
rendering (`lib/markdown.ts`) is a display-only layer of char-range
decorations over the raw text; syntax characters are hidden with CSS, which
is safe because they have no marks. Any feature that wants to change what
Polly speaks (e.g. skipping URLs) must maintain an explicit offset mapping
between the spoken text and the displayed text.

## Storage

Saved readings persist `{ text, marks, createdAt }` plus the merged MP3
Blob in IndexedDB (`lib/library.ts`, separate object stores so listing
never loads audio). Replaying is free — no Polly calls; segments are
rebuilt from the saved text + marks.

## Known behaviors / future work

- Autoplay rejection (browser policy) is swallowed — the UI simply shows
  paused, and the user presses play.
- Polly reads URLs in `[text](url)` markdown links aloud; fixing this needs
  the spoken-vs-displayed offset mapping described above.
- A whole-text cache keyed by text hash could skip re-synthesis of repeat
  pastes (the current code reuses the in-memory synthesis only when the
  textarea content is unchanged).
