/** Display formatting shared across reader components. */

const AVERAGE_WORDS_PER_MINUTE = 170;

/** Seconds as a m:ss clock, e.g. 83 → "1:23". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Epoch milliseconds as a short date, e.g. "Jul 19". */
export function formatSavedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Rough listening time for a word count, e.g. "~4 min listen". */
export function listenEstimate(wordCount: number): string {
  const minutes = Math.round(wordCount / AVERAGE_WORDS_PER_MINUTE);
  return minutes < 1 ? "under a minute" : `~${minutes} min listen`;
}
