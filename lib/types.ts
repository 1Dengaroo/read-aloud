export interface SpeechMark {
  /** Milliseconds from the start of the audio stream. */
  time: number;
  type: "word";
  /** UTF-8 byte offsets into the synthesized text. */
  start: number;
  end: number;
  value: string;
}

export interface SynthesizeRequest {
  text: string;
}

export interface SynthesizeResponse {
  /** The exact text that was synthesized — render marks against this. */
  text: string;
  /** Base64-encoded MP3. */
  audio: string;
  marks: SpeechMark[];
}

/**
 * A saved reading's metadata, stored in IndexedDB. The MP3 blob lives in
 * a separate object store keyed by `id` so listing never loads audio.
 */
export interface SavedReadingMeta {
  id: string;
  /** Short label derived from the opening words of the text. */
  title: string;
  text: string;
  marks: SpeechMark[];
  /** Epoch milliseconds. */
  createdAt: number;
}

/** Player lifecycle — "loading" covers the whole chunked synthesis. */
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused";

/** A slice of the full text sent to Polly as one synthesis request. */
export interface TextChunk {
  text: string;
  /** Char offset of the chunk's first character in the full text. */
  charStart: number;
}

/** Chunk-level progress of a long synthesis, for loading UI. */
export interface SynthesisProgress {
  done: number;
  total: number;
}

/** A fully merged synthesis: joined audio + marks mapped onto `text`. */
export interface SynthesizedReading {
  text: string;
  /** Joined MP3 — chunk streams concatenated in order. */
  audio: Blob;
  marks: SpeechMark[];
  /** Exact total duration, summed from decoded chunk durations. */
  durationMs: number;
}

/** The reading currently loaded in the player. */
export interface ActiveReading {
  text: string;
  audio: Blob;
  /** Object URL for `audio` — revoked when the reading is replaced. */
  audioSrc: string;
  marks: SpeechMark[];
  segments: WordSegment[];
  /** Exact decoded duration; null for library loads (metadata fills in). */
  durationMs: number | null;
  /** Library id when this reading is saved, null otherwise. */
  sourceId: string | null;
}

/** A run of synthesized text — a spoken word (with its mark index) or filler. */
export interface WordSegment {
  text: string;
  markIndex: number | null;
  /**
   * 0-based index of the sentence containing this segment's first
   * character; -1 for a filler's line-break run, which is never tinted.
   */
  sentenceIndex: number;
  /** Char offset of this segment's first character in the full text. */
  charStart: number;
}

/**
 * A display-only markdown style over a char range of the raw text.
 * Ranges may overlap (nesting); `className` is a styles/markdown.css
 * class. The text itself is never transformed — mark offsets stay valid.
 */
export interface MarkdownDecoration {
  start: number;
  end: number;
  className: string;
}

/** A markdown heading line, for the outline nav. */
export interface MarkdownHeading {
  level: number;
  /** Line content with markdown syntax stripped — the outline label. */
  title: string;
  /** Char range of the heading's content (marker excluded). */
  charStart: number;
  charEnd: number;
}

/**
 * A code section's full char range (backticks/fences included). Each
 * section renders as one wrapper element and highlights as one unit.
 */
export interface CodeRange {
  start: number;
  end: number;
  /** Fenced multi-line block (```) vs inline span (`). */
  block: boolean;
}

export interface MarkdownAnnotations {
  decorations: MarkdownDecoration[];
  headings: MarkdownHeading[];
  /** Sorted by start; ranges never overlap. */
  codeRanges: CodeRange[];
}

/** A run of consecutive segments — plain, or wrapped as one code section. */
export interface SegmentGroup {
  /** Index into MarkdownAnnotations.codeRanges, or null for plain runs. */
  codeIndex: number | null;
  /** Segment index range [from, to). */
  from: number;
  to: number;
}

/** A heading resolved to its first spoken word, clickable in the outline. */
export interface OutlineHeading extends MarkdownHeading {
  markIndex: number;
}

/** A styled slice of one segment's text; className joins decoration classes. */
export interface StyledRun {
  text: string;
  className: string | null;
}

export interface FontDefinition {
  id: string;
  name: string;
  /** CSS font-family value — matches styles/fonts.css, used for previews. */
  family: string;
}

export interface HighlightDefinition {
  id: string;
  name: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
}
