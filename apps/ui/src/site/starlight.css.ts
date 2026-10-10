import { globalStyle } from "@vanilla-extract/css";
import { vars } from "../foundations/theme/vars.css.ts";
import { fontFamily, fontWeight, monoFamily } from "../foundations/typography/tokens.ts";
import { displayFamily } from "./tokens.ts";

// Starlight's documentation reads its colors and fonts from `--sl-*` properties, in a cascade
// layer, so these unlayered values win. Each names a role rather than a shade, and the roles
// switch with the document's mode (see document.css.ts), so one mapping serves both modes. Grays
// run from the strongest text (1) to the quietest surface (7).
const color = vars.color;

globalStyle(":root", {
  vars: {
    "--sl-font": fontFamily,
    "--sl-font-mono": monoFamily,
    "--sl-color-white": color.text.primary,
    "--sl-color-gray-1": color.text.primary,
    "--sl-color-gray-2": color.text.primary,
    "--sl-color-gray-3": color.text.secondary,
    "--sl-color-gray-4": color.text.muted,
    "--sl-color-gray-5": color.border.default,
    "--sl-color-gray-6": color.border.divider,
    "--sl-color-gray-7": color.surface.canvas,
    "--sl-color-black": color.surface.panel,
    "--sl-color-accent-low": color.surface.subtle,
    "--sl-color-accent": color.action.primary,
    "--sl-color-accent-high": color.text.primary,
    "--sl-color-text": color.text.primary,
    "--sl-color-text-accent": color.text.primary,
    "--sl-color-text-invert": color.text.onPrimary,
    "--sl-color-bg": color.surface.panel,
    "--sl-color-bg-nav": color.surface.panel,
    "--sl-color-bg-sidebar": color.surface.panel,
    "--sl-color-bg-inline-code": color.surface.subtle,
    "--sl-color-bg-accent": color.action.primary,
    "--sl-color-hairline-light": color.border.divider,
    "--sl-color-hairline": color.border.divider,
    "--sl-color-hairline-shade": color.border.divider,
    "--sl-color-backdrop-overlay": color.scrimStrong,
  },
});

// Corners are square, as they are throughout amends.
globalStyle(
  [
    ".sl-link-card",
    ".card",
    ".sl-badge",
    ".pagination-links a",
    ".sidebar-content a",
    "button[data-open-modal]",
    "button[data-open-modal] > kbd",
  ].join(", "),
  { borderRadius: 0 },
);

// The page being read is marked as the app marks the current sidebar row: a quiet fill with the
// indicator along its edge, rather than Starlight's solid accent.
globalStyle(".sidebar-content a[aria-current='page']", {
  backgroundColor: color.surface.selected,
  boxShadow: `inset 2px 0 ${color.action.indicator}`,
  color: color.text.primary,
  fontWeight: fontWeight.medium,
});

// A page's title is set in the display face, as the site's headlines are.
globalStyle("h1#_top", { fontFamily: displayFamily, fontWeight: 400, letterSpacing: "-0.01em" });
