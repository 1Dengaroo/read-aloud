import {
  MAX_TEXT_LENGTH,
  isSynthesizeResponse,
  splitIntoChunks,
} from "@/lib/synthesis";
import type {
  SpeechMark,
  SynthesisProgress,
  SynthesizeRequest,
  SynthesizedReading,
} from "@/lib/types";

/** Chunks in flight at once — two Polly calls each, under the 8 TPS default. */
const CHUNK_CONCURRENCY = 3;

function errorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "Speech synthesis failed.";
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

interface ChunkAudio {
  buffer: ArrayBuffer;
  marks: SpeechMark[];
  durationMs: number;
}

async function synthesizeChunk(
  text: string,
  context: AudioContext,
): Promise<ChunkAudio> {
  const payload: SynthesizeRequest = { text };
  const response = await fetch("/api/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch((): null => null);
  if (!response.ok) throw new Error(errorMessage(body));
  if (!isSynthesizeResponse(body)) {
    throw new Error("Received a malformed synthesis response.");
  }
  const buffer = base64ToBuffer(body.audio);
  // decodeAudioData detaches its input — decode a copy, keep `buffer`
  // intact for the joined blob. The decoded duration is exact, which the
  // mark-time offsets below depend on.
  const decoded = await context.decodeAudioData(buffer.slice(0));
  return { buffer, marks: body.marks, durationMs: decoded.duration * 1000 };
}

async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  task: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Synthesize `text` of any length (up to MAX_TEXT_LENGTH) by splitting
 * it into per-request chunks, fetching them concurrently, and merging:
 * MP3 streams are concatenated in order, mark byte offsets are shifted
 * to full-text positions, and mark times are shifted by the decoded
 * duration of every preceding chunk.
 */
export async function synthesizeReading(
  text: string,
  onProgress: (progress: SynthesisProgress) => void,
): Promise<SynthesizedReading> {
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(
      `Text is longer than ${MAX_TEXT_LENGTH.toLocaleString()} characters.`,
    );
  }
  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) throw new Error("There is no readable text.");

  const context = new AudioContext();
  let done = 0;
  onProgress({ done, total: chunks.length });
  let results: ChunkAudio[];
  try {
    results = await mapWithConcurrency(
      chunks,
      CHUNK_CONCURRENCY,
      async (chunk) => {
        const audio = await synthesizeChunk(chunk.text, context);
        done++;
        onProgress({ done, total: chunks.length });
        return audio;
      },
    );
  } finally {
    await context.close().catch(() => undefined);
  }

  const encoder = new TextEncoder();
  const marks: SpeechMark[] = [];
  let charCursor = 0;
  let byteCursor = 0;
  let timeOffsetMs = 0;
  chunks.forEach((chunk, index) => {
    byteCursor += encoder.encode(
      text.slice(charCursor, chunk.charStart),
    ).length;
    charCursor = chunk.charStart;
    const result = results[index];
    for (const mark of result.marks) {
      marks.push({
        ...mark,
        time: Math.round(mark.time + timeOffsetMs),
        start: mark.start + byteCursor,
        end: mark.end + byteCursor,
      });
    }
    timeOffsetMs += result.durationMs;
  });

  return {
    text,
    audio: new Blob(
      results.map((result) => result.buffer),
      { type: "audio/mpeg" },
    ),
    marks,
    durationMs: Math.round(timeOffsetMs),
  };
}
