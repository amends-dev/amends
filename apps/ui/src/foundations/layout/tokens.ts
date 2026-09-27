/**
 * Breakpoints are viewport widths in rem, so they follow the reader's text size. The shell has
 * four arrangements:
 *
 * - below 48rem (768px): one pane at a time; rail and sidebar open together as a drawer.
 * - 48–64rem (768–1023px): the rail stays; the sidebar opens as a drawer beside it.
 * - 64–80rem (1024–1279px): rail and sidebar stay; the side panel floats over the content.
 * - 80rem (1280px) and wider: the side panel sits beside the main content.
 *
 * Below 64rem controls use 44px touch targets.
 */
export const breakpoint = { tablet: "48rem", desktop: "64rem", split: "80rem" } as const;

export const media = {
  mobile: "screen and (max-width: 47.999rem)",
  tablet: "screen and (min-width: 48rem)",
  /** Below desktop: navigation in a drawer and touch-sized controls. */
  touch: "screen and (max-width: 63.999rem)",
  desktop: "screen and (min-width: 64rem)",
  /** Below the split width, the side panel floats over the content. */
  overlay: "screen and (max-width: 79.999rem)",
  split: "screen and (min-width: 80rem)",
} as const;

export const shell = {
  rail: "52px",
  sidebar: "264px",
  gap: "8px",
  aside: "440px",
} as const;
