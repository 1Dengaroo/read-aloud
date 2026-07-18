import type { SpeechMark, SynthesizeResponse, WordSegment } from "@/lib/types";

/** Polly bills up to 3000 characters per neural synthesis request. */
export const MAX_TEXT_LENGTH = 3000;

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

  const segments: WordSegment[] = [];
  let cursor = 0;
  marks.forEach((mark, markIndex) => {
    const start = byteToChar.get(mark.start);
    const end = byteToChar.get(mark.end);
    if (start === undefined || end === undefined || start < cursor) return;
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), markIndex: null });
    }
    segments.push({ text: text.slice(start, end), markIndex });
    cursor = end;
  });
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), markIndex: null });
  }
  return segments;
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
