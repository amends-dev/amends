import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies, typography } from "../../foundations/typography/tokens.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1.125rem",
  minWidth: 0,
  textAlign: "center",
  selectors: { '&[data-size="page"]': { gap: "1.5rem" } },
});
// A page state sets its title at the heading scale shared by standalone pages.
const page = `${root}[data-size="page"]`;
export const text = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.4375rem",
  maxWidth: "18.75rem",
  minWidth: 0,
  selectors: { [`${page} &`]: { gap: "0.625rem", maxWidth: "26.25rem" } },
});
export const title = style({
  margin: 0,
  fontFamily: fontFamilies.serif,
  fontSize: "1.4375rem",
  fontWeight: 400,
  lineHeight: 1.2,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
  selectors: {
    [`${page} &`]: {
      fontSize: typography.heading.fontSize,
      lineHeight: typography.heading.lineHeight,
      letterSpacing: typography.heading.letterSpacing,
    },
  },
});
export const description = style({
  margin: 0,
  fontSize: "0.84375rem",
  lineHeight: 1.6,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
  selectors: {
    [`${page} &`]: { fontSize: typography.body.fontSize, lineHeight: typography.body.lineHeight },
  },
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "0.5625rem",
});
