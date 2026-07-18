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

/** A run of synthesized text — a spoken word (with its mark index) or filler. */
export interface WordSegment {
  text: string;
  markIndex: number | null;
}

export interface FontDefinition {
  id: string;
  name: string;
  /** CSS font-family value — matches styles/fonts.css, used for previews. */
  family: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
}
