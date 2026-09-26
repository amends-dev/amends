import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focus } from "../../foundations/focus/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  minWidth: 0,
  margin: 0,
});
const compact = `${root}[data-density="compact"]`;
/** The dashed box around the text and its actions; focus inside draws it in ink. */
export const frame = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  minWidth: 0,
  padding: "0.25rem 0.25rem 0.25rem 0.125rem",
  border: `1.4px dashed ${colorVars.line.seam}`,
  borderRadius: "0.75rem",
  selectors: {
    "&:focus-within": { borderColor: colorVars.text.primary },
    '&:has([aria-invalid="true"])': { borderColor: colorVars.line.invalid },
  },
  "@media": {
    "(forced-colors: active)": {
      selectors: { "&:focus-within": { outline: `${focus.width} solid CanvasText` } },
    },
  },
});
export const input = style({
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  // Two lines at rest; the input grows with its text up to about half the viewport.
  // Two lines of 1.55em, in em rather than lh, which desktop's WebKit floor lacks.
  minHeight: "calc(3.1em + 1.25rem)",
  maxHeight: "45dvh",
  margin: 0,
  padding: "0.625rem 0.75rem",
  border: "none",
  borderRadius: "0.625rem",
  outline: "none",
  background: "none",
  resize: "none",
  overflowY: "auto",
  fontFamily: fontFamilies.sans,
  fontSize: "0.9375rem",
  lineHeight: 1.55,
  color: colorVars.text.primary,
  selectors: {
    "&::placeholder": { color: colorVars.text.secondary, opacity: 1 },
    [`${compact} &`]: { fontSize: "0.90625rem" },
  },
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.5rem",
  minWidth: 0,
  padding: "0 0.5rem 0.25rem",
});
export const note = style({
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.45,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const dock = styleVariants({
  canvas: { backgroundColor: colorVars.surface.canvas },
  panel: { backgroundColor: colorVars.surface.panel },
});
export const docked = style({
  position: "sticky",
  bottom: 0,
  // In a filling column, the dock sits at the end even under short content.
  marginTop: "auto",
  zIndex: 1,
  paddingBlock: "0.75rem 1rem",
  minWidth: 0,
});
