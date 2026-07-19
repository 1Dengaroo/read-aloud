import type {
  CodeRange,
  MarkdownAnnotations,
  MarkdownDecoration,
  MarkdownHeading,
  OutlineHeading,
  SegmentGroup,
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
const FENCE_LINE = /^[ \t]*```/;

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
  const codeRanges: CodeRange[] = [];
  // 1 = this char may not participate in a later inline match.
  const consumed = new Uint8Array(text.length);
  const consume = (start: number, end: number) => consumed.fill(1, start, end);
  const anyConsumed = (start: number, end: number): boolean => {
    for (let index = start; index < end; index++) {
      if (consumed[index]) return true;
    }
    return false;
  };

  // Line pass: fenced code blocks, headings, dividers, list/quote markers.
  let lineStart = 0;
  let fenceStart = -1;
  let fenceContentStart = -1;
  while (lineStart < text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);

    /*
     * ``` fences: the whole block is one code section — fence lines
     * (with their adjoining newlines) hidden, content set as code,
     * nothing inside parsed further. Decorations are pushed only when
     * the block closes, so an unclosed fence renders as plain text.
     */
    if (FENCE_LINE.test(line)) {
      if (fenceStart === -1) {
        fenceStart = lineStart;
        fenceContentStart = Math.min(lineEnd + 1, text.length);
      } else {
        decorations.push({
          start: fenceStart,
          end: fenceContentStart,
          className: "md-syntax",
        });
        const closeStart = Math.max(lineStart - 1, fenceContentStart);
        if (fenceContentStart < closeStart) {
          decorations.push({
            start: fenceContentStart,
            end: closeStart,
            className: "md-code",
          });
        }
        decorations.push({
          start: closeStart,
          end: lineEnd,
          className: "md-syntax",
        });
        codeRanges.push({ start: fenceStart, end: lineEnd, block: true });
        consume(fenceStart, lineEnd);
        fenceStart = -1;
      }
      lineStart = lineEnd + 1;
      continue;
    }
    if (fenceStart !== -1) {
      lineStart = lineEnd + 1;
      continue;
    }

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
      if (pattern.className === "md-code") {
        codeRanges.push({ start, end, block: false });
      }
      if (pattern.consumeAll) {
        consume(start, end);
      } else {
        consume(start, start + marker);
        consume(end - marker, end);
      }
    }
  }

  decorations.sort((a, b) => a.start - b.start || a.end - b.end);
  codeRanges.sort((a, b) => a.start - b.start);
  return { decorations, headings, codeRanges };
}

/**
 * Each heading resolved to the first spoken word at/after its content,
 * for the outline nav. Headings whose section holds no spoken word are
 * dropped — there is nothing to jump playback to.
 */
export function buildOutline(
  segments: WordSegment[],
  headings: MarkdownHeading[],
): OutlineHeading[] {
  const entries: OutlineHeading[] = [];
  let segIndex = 0;
  for (const heading of headings) {
    while (
      segIndex < segments.length &&
      (segments[segIndex].markIndex === null ||
        segments[segIndex].charStart < heading.charStart)
    ) {
      segIndex++;
    }
    const markIndex = segments[segIndex]?.markIndex;
    if (typeof markIndex === "number") entries.push({ ...heading, markIndex });
  }
  return entries;
}

/** Index into `outline` of the section being read, or -1 before it. */
export function activeHeadingIndex(
  outline: OutlineHeading[],
  activeMarkIndex: number,
): number {
  let active = -1;
  for (let index = 0; index < outline.length; index++) {
    if (outline[index].markIndex <= activeMarkIndex) active = index;
    else break;
  }
  return active;
}

/**
 * Partition segments (in text order) into runs: plain runs, and one
 * group per code section so the section renders as a single wrapper —
 * one visual chip and one highlight unit. A segment joins a section
 * when it starts inside the section's range.
 */
export function groupSegmentsByCode(
  segments: WordSegment[],
  codeRanges: CodeRange[],
): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  let rangeIndex = 0;
  let index = 0;
  while (index < segments.length) {
    const charStart = segments[index].charStart;
    while (
      rangeIndex < codeRanges.length &&
      codeRanges[rangeIndex].end <= charStart
    ) {
      rangeIndex++;
    }
    const range = codeRanges[rangeIndex];
    const from = index;
    if (range && charStart >= range.start) {
      while (index < segments.length && segments[index].charStart < range.end) {
        index++;
      }
      groups.push({ codeIndex: rangeIndex, from, to: index });
    } else {
      const nextStart = range ? range.start : Infinity;
      while (index < segments.length && segments[index].charStart < nextStart) {
        index++;
      }
      groups.push({ codeIndex: null, from, to: index });
    }
  }
  return groups;
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
