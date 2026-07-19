import type {
  SpeechMark,
  SynthesizeResponse,
  TextChunk,
  WordSegment,
} from "@/lib/types";

/** Polly accepts up to 3000 characters per neural synthesis request. */
export const MAX_CHUNK_LENGTH = 3000;

/**
 * Total-text ceiling. Not a technical limit — long texts are chunked
 * into multiple Polly requests — but a cost guard (~$1.60 per full
 * synthesis at neural pricing). Raise it here if you need more.
 */
export const MAX_TEXT_LENGTH = 100_000;

export function isSpeechMark(value: unknown): value is SpeechMark {
  return (
    typeof value === "object" &&
    value !== null &&
    "time" in value &&
    typeof value.time === "number" &&
    "type" in value &&
    value.type === "word" &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number" &&
    "value" in value &&
    typeof value.value === "string"
  );
}

export function isSynthesizeResponse(
  value: unknown,
): value is SynthesizeResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string" &&
    "audio" in value &&
    typeof value.audio === "string" &&
    "marks" in value &&
    Array.isArray(value.marks) &&
    value.marks.every(isSpeechMark)
  );
}

const SENTENCE_TERMINATORS = new Set([".", "!", "?", "\n"]);

/**
 * Char offsets where each sentence begins. A sentence ends at ./!/?
 * only when the terminator is followed by whitespace — "3.5",
 * "Node.js", and "U.S." stay inside their sentence, so the tint never
 * jumps mid-sentence. Newlines always terminate. The next
 * non-whitespace character starts the new sentence, so trailing spaces
 * stay with the previous one.
 */
function sentenceStarts(text: string): number[] {
  const starts = [0];
  let afterTerminator = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\n") {
      afterTerminator = true;
    } else if (SENTENCE_TERMINATORS.has(char)) {
      const next = text[index + 1];
      if (next === undefined || /\s/.test(next)) afterTerminator = true;
    } else if (afterTerminator && /\S/.test(char)) {
      starts.push(index);
      afterTerminator = false;
    }
  }
  return starts;
}

/**
 * Where to cut a full-size window so the chunk ends at a natural pause:
 * the last sentence terminator, else the last whitespace, else a hard
 * cut (backed off one char so a surrogate pair is never split). Cuts
 * are only taken past the halfway point so no chunk is degenerate.
 */
function chunkCut(window: string): number {
  const floor = MAX_CHUNK_LENGTH / 2;
  // Same rule as sentenceStarts: ./!/? only end a sentence before
  // whitespace, so a cut can never land inside "3.5" or "Node.js".
  for (let index = window.length - 2; index >= floor; index--) {
    if (
      window[index] === "\n" ||
      (SENTENCE_TERMINATORS.has(window[index]) && /\s/.test(window[index + 1]))
    ) {
      return index + 1;
    }
  }
  for (let index = window.length - 1; index >= floor; index--) {
    if (/\s/.test(window[index])) return index + 1;
  }
  const last = window.charCodeAt(window.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? window.length - 1 : window.length;
}

/**
 * Split `text` into contiguous chunks of at most MAX_CHUNK_LENGTH
 * characters for per-request Polly synthesis. Every chunk starts at a
 * non-whitespace character (the server trims each chunk, so a leading
 * space would silently shift its mark offsets), and `charStart` locates
 * the chunk in `text` so its marks can be mapped back onto the whole.
 */
export function splitIntoChunks(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    while (start < text.length && /\s/.test(text[start])) start++;
    if (start === text.length) break;
    const window = text.slice(start, start + MAX_CHUNK_LENGTH);
    const cut =
      start + window.length < text.length ? chunkCut(window) : window.length;
    chunks.push({ text: text.slice(start, start + cut), charStart: start });
    start += cut;
  }
  return chunks;
}

/**
 * Split `text` into spoken-word and filler segments using Polly speech
 * marks. Mark offsets are UTF-8 byte positions, so they are first mapped
 * to JS string indices.
 */
export function buildSegments(
  text: string,
  marks: SpeechMark[],
): WordSegment[] {
  const encoder = new TextEncoder();
  const byteToChar = new Map<number, number>([[0, 0]]);
  let byteOffset = 0;
  let charOffset = 0;
  for (const codePoint of text) {
    byteOffset += encoder.encode(codePoint).length;
    charOffset += codePoint.length;
    byteToChar.set(byteOffset, charOffset);
  }

  // Segments are emitted in text order, so a monotonic pointer into the
  // sentence starts resolves each segment's sentence in one pass.
  const starts = sentenceStarts(text);
  let sentence = 0;
  const sentenceAt = (charIndex: number): number => {
    while (sentence + 1 < starts.length && starts[sentence + 1] <= charIndex) {
      sentence++;
    }
    return sentence;
  };

  const segments: WordSegment[] = [];

  /*
   * Fillers are split around their line-break run, which is emitted
   * with sentenceIndex -1: pre-wrap paints inline backgrounds on
   * preserved newlines and spaces, so a tinted filler spanning a
   * paragraph break draws sentence-tint squares onto the empty lines
   * below it. The run swallows ALL whitespace touching the newlines —
   * trailing spaces before the break and the next line's indentation
   * (which sentenceAt assigns to the previous sentence) would paint
   * the same squares.
   */
  const pushFiller = (from: number, to: number) => {
    if (from >= to) return;
    const value = text.slice(from, to);
    const first = value.indexOf("\n");
    if (first === -1) {
      segments.push({
        text: value,
        markIndex: null,
        sentenceIndex: sentenceAt(from),
        charStart: from,
      });
      return;
    }
    let breakStart = first;
    while (breakStart > 0 && /\s/.test(value[breakStart - 1])) breakStart--;
    let breakEnd = value.lastIndexOf("\n") + 1;
    while (breakEnd < value.length && /\s/.test(value[breakEnd])) breakEnd++;
    if (breakStart > 0) {
      segments.push({
        text: value.slice(0, breakStart),
        markIndex: null,
        sentenceIndex: sentenceAt(from),
        charStart: from,
      });
    }
    segments.push({
      text: value.slice(breakStart, breakEnd),
      markIndex: null,
      sentenceIndex: -1,
      charStart: from + breakStart,
    });
    if (breakEnd < value.length) {
      segments.push({
        text: value.slice(breakEnd),
        markIndex: null,
        sentenceIndex: sentenceAt(from + breakEnd),
        charStart: from + breakEnd,
      });
    }
  };

  let cursor = 0;
  marks.forEach((mark, markIndex) => {
    const start = byteToChar.get(mark.start);
    const end = byteToChar.get(mark.end);
    if (start === undefined || end === undefined || start < cursor) return;
    pushFiller(cursor, start);
    segments.push({
      text: text.slice(start, end),
      markIndex,
      sentenceIndex: sentenceAt(start),
      charStart: start,
    });
    cursor = end;
  });
  pushFiller(cursor, text.length);
  return segments;
}

/** Dense markIndex → sentenceIndex lookup for the active-sentence tint. */
export function buildSentenceByMark(segments: WordSegment[]): number[] {
  const byMark: number[] = [];
  for (const segment of segments) {
    if (segment.markIndex !== null) {
      byMark[segment.markIndex] = segment.sentenceIndex;
    }
  }
  return byMark;
}

/** Dense markIndex → charStart lookup, e.g. for code-range hit tests. */
export function buildCharStartByMark(segments: WordSegment[]): number[] {
  const byMark: number[] = [];
  for (const segment of segments) {
    if (segment.markIndex !== null) {
      byMark[segment.markIndex] = segment.charStart;
    }
  }
  return byMark;
}

/**
 * Binary search for the last mark whose start time is at or before
 * `timeMs`. Returns -1 when playback hasn't reached the first word.
 */
export function findActiveMark(marks: SpeechMark[], timeMs: number): number {
  let low = 0;
  let high = marks.length - 1;
  let active = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (marks[mid].time <= timeMs) {
      active = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return active;
}
