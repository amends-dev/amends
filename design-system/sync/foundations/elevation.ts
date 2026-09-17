/**
 * Shadow is rare. In-page content is flat and separates by paper value alone, so
 * only things that genuinely float above the page cast anything.
 *
 * `raised` and `lifted` are deliberately flat: every in-page consumer of them
 * (cards, task rows, message bubbles) becomes flat under this direction, and
 * aliasing is how that lands without touching thirty component files. Remove the
 * keys once no consumer references them.
 */
export const cotton = {
  flat: "none",
  /** 2px ink. Consumers add the 2px offset via `outlineOffset`. */
  ring: "0 0 0 2px oklch(0.24 0.014 84)",
  raised: "none",
  overlay: "0 2px 4px oklch(0.24 0.014 84 / 0.06), 0 8px 22px oklch(0.24 0.014 84 / 0.07)",
  lifted: "none",
  modal: "0 8px 20px oklch(0.24 0.014 84 / 0.1), 0 30px 60px oklch(0.24 0.014 84 / 0.14)",
};

export const night: typeof cotton = {
  flat: "none",
  ring: "0 0 0 2px oklch(0.95 0.006 90)",
  raised: "none",
  overlay: "0 2px 4px oklch(0 0 0 / 0.32), 0 8px 22px oklch(0 0 0 / 0.4)",
  lifted: "none",
  modal: "0 8px 20px oklch(0 0 0 / 0.5), 0 30px 60px oklch(0 0 0 / 0.55)",
};
