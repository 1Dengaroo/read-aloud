import type {
  MarkdownAnnotations,
  MarkdownDecoration,
  MarkdownHeading,
  StyledRun,
  WordSegment,
} from "@/lib/types";

/*
 * Display-only markdown annotation. The raw text (with its syntax
 * characters) is what Polly synthesizes and what speech-mark offsets
 * reference, so the text is never transformed — instead, char ranges
 * are decorated with styles/markdown.css classes and syntax markers
 * are hidden by CSS. Polly emits no word marks for syntax characters,
 * so hiding them never moves a highlighted word span.
 */

const HEADING_CLASSES = ["md-h1", "md-h2", "md-h3", "md-h4"];

const HEADING_LINE = /^(#{1,6})[ \t]+(.*)$/;
const DIVIDER_LINE = /^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/;
const BULLET_MARKER = /^[ \t]*(?:[-*+]|\d{1,3}\.)[ \t]+/;
const QUOTE_MARKER = /^>[ \t]?/;

interface InlinePattern {
  regex: RegExp;
  className: string;
  markerLength: number;
  /** Consume the whole match so nothing nests inside (code spans). */
  consumeAll: boolean;
}

/*
 * Order matters: code first (its content blocks everything), doubled
 * markers before their single-character forms. Underscore forms require
 * non-word neighbors so snake_case and __dunder__ names stay untouched.
 */
const INLINE_PATTERNS: InlinePattern[] = [
  {
    regex: /`([^`\n]+)`/g,
    className: "md-code",
    markerLength: 1,
    consumeAll: true,
  },
  {
    regex: /\*\*([^\n]+?)\*\*/g,
    className: "md-bold",
    markerLength: 2,
    consumeAll: false,
  },
  {
    regex: /(?<!\w)__([^\n]+?)__(?!\w)/g,
    className: "md-bold",
    markerLength: 2,
    consumeAll: false,
  },
  {
    regex: /~~([^\n]+?)~~/g,
    className: "md-strike",
    markerLength: 2,
    consumeAll: false,
  },
  {
    regex: /\*([^*\n]+?)\*/g,
    className: "md-italic",
    markerLength: 1,
    consumeAll: false,
  },
  {
    regex: /(?<!\w)_([^_\n]+?)_(?!\w)/g,
    className: "md-italic",
    markerLength: 1,
    consumeAll: false,
  },
];

/** Markdown syntax removed, for outline labels. */
function stripInline(value: string): string {
  return value.replace(/(\*\*|__|~~|[`*_])/g, "").trim();
}

/**
 * Scan `text` for markdown and return overlapping style decorations
 * (sorted by start) plus the headings for the outline nav. Plain text
 * yields empty arrays and renders exactly as before.
 */
export function annotateMarkdown(text: string): MarkdownAnnotations {
  const decorations: MarkdownDecoration[] = [];
  const headings: MarkdownHeading[] = [];
  // 1 = this char may not participate in a later inline match.
  const consumed = new Uint8Array(text.length);
  const consume = (start: number, end: number) => consumed.fill(1, start, end);
  const anyConsumed = (start: number, end: number): boolean => {
    for (let index = start; index < end; index++) {
      if (consumed[index]) return true;
    }
    return false;
  };

  // Line pass: headings, dividers, list and quote markers.
  let lineStart = 0;
  while (lineStart < text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      const contentStart = lineStart + line.length - heading[2].length;
      decorations.push({
        start: lineStart,
        end: contentStart,
        className: "md-syntax",
      });
      consume(lineStart, contentStart);
      if (contentStart < lineEnd) {
        const level = Math.min(heading[1].length, HEADING_CLASSES.length);
        decorations.push({
          start: contentStart,
          end: lineEnd,
          className: HEADING_CLASSES[level - 1],
        });
        const title = stripInline(heading[2]);
        if (title.length > 0) {
          headings.push({
            level: heading[1].length,
            title,
            charStart: contentStart,
            charEnd: lineEnd,
          });
        }
      }
    } else if (DIVIDER_LINE.test(line)) {
      decorations.push({
        start: lineStart,
        end: lineEnd,
        className: "md-marker",
      });
      consume(lineStart, lineEnd);
    } else {
      const marker = BULLET_MARKER.exec(line) ?? QUOTE_MARKER.exec(line);
      if (marker) {
        const markerEnd = lineStart + marker[0].length;
        decorations.push({
          start: lineStart,
          end: markerEnd,
          className: "md-marker",
        });
        consume(lineStart, markerEnd);
      }
    }
    lineStart = lineEnd + 1;
  }

  // Inline pass. A match touching any consumed char is dropped — so a
  // single-marker form can never re-match a doubled marker, but styles
  // still nest inside another pattern's (unconsumed) content.
  for (const pattern of INLINE_PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (anyConsumed(start, end)) continue;
      const marker = pattern.markerLength;
      decorations.push({
        start,
        end: start + marker,
        className: "md-syntax",
      });
      decorations.push({
        start: start + marker,
        end: end - marker,
        className: pattern.className,
      });
      decorations.push({ start: end - marker, end, className: "md-syntax" });
      if (pattern.consumeAll) {
        consume(start, end);
      } else {
        consume(start, start + marker);
        consume(end - marker, end);
      }
    }
  }

  decorations.sort((a, b) => a.start - b.start || a.end - b.end);
  return { decorations, headings };
}

/**
 * For each segment, the styled sub-runs to render instead of its plain
 * text — or null when no decoration overlaps it (the fast path; plain
 * text renders identically to an unannotated document). Segments must
 * be in text order and decorations sorted by start.
 */
export function buildSegmentRuns(
  segments: WordSegment[],
  decorations: MarkdownDecoration[],
): (StyledRun[] | null)[] {
  if (decorations.length === 0) return segments.map(() => null);
  let cursor = 0;
  const active: MarkdownDecoration[] = [];
  return segments.map((segment) => {
    const segStart = segment.charStart;
    const segEnd = segStart + segment.text.length;
    while (cursor < decorations.length && decorations[cursor].start < segEnd) {
      active.push(decorations[cursor]);
      cursor++;
    }
    for (let index = active.length - 1; index >= 0; index--) {
      if (active[index].end <= segStart) active.splice(index, 1);
    }
    if (active.length === 0) return null;

    const points = new Set<number>([segStart, segEnd]);
    for (const decoration of active) {
      if (decoration.start > segStart) points.add(decoration.start);
      if (decoration.end < segEnd) points.add(decoration.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const runs: StyledRun[] = [];
    for (let index = 0; index < sorted.length - 1; index++) {
      const from = sorted[index];
      const to = sorted[index + 1];
      const classes = new Set(
        active
          .filter((d) => d.start <= from && d.end >= to)
          .map((d) => d.className),
      );
      runs.push({
        text: segment.text.slice(from - segStart, to - segStart),
        className: classes.size > 0 ? [...classes].join(" ") : null,
      });
    }
    return runs;
  });
}
