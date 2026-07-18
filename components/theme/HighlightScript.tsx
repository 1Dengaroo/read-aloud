import {
  defaultHighlightId,
  highlightIds,
} from "@/lib/theme/highlight-registry";

/*
 * Blocking inline script, same technique as FontScript: sets
 * data-highlight from localStorage before first paint so the saved
 * highlight style never flashes. Must render at the top of <body>.
 */
const script = `(function(){try{var h=localStorage.getItem("highlight");document.documentElement.dataset.highlight=${JSON.stringify(
  highlightIds,
)}.indexOf(h)>=0?h:${JSON.stringify(defaultHighlightId)};}catch(e){}})();`;

export function HighlightScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
