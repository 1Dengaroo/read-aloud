/**
 * The rendered span for a spoken word, looked up by its mark index.
 * The reading surface tags each word span with data-mark; this is the
 * one place that selector convention lives.
 */
export function wordElement(
  container: ParentNode | null,
  markIndex: number,
): HTMLElement | null {
  const element = container?.querySelector(`[data-mark="${markIndex}"]`);
  return element instanceof HTMLElement ? element : null;
}
