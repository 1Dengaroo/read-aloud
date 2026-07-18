import { defaultFontId, fontIds } from "@/lib/theme/font-registry";

/*
 * Blocking inline script, same technique next-themes uses for the theme:
 * sets data-font from localStorage before first paint so the saved font
 * never flashes. Must render at the top of <body>.
 */
const script = `(function(){try{var f=localStorage.getItem("font");document.documentElement.dataset.font=${JSON.stringify(
  fontIds,
)}.indexOf(f)>=0?f:${JSON.stringify(defaultFontId)};}catch(e){}})();`;

export function FontScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
