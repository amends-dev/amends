import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

export const root = style({
  display: "block",
  minWidth: 0,
  selectors: { "&[hidden]": { display: "none" } },
});

export const list = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: "0.125rem",
  rowGap: space[1],
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const item = style({
  display: "inline-flex",
  alignItems: "baseline",
  gap: space[2],
  flexShrink: 0,
  maxWidth: "100%",
  minWidth: 0,
});

export const separator = style({
  flex: "none",
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.5,
  color: colorVars.text.secondary,
  opacity: 0.65,
  selectors: { [`${item}:first-child &`]: { display: "none" } },
  "@media": { "(forced-colors: active)": { color: "GrayText", opacity: 1 } },
});

const label = {
  minWidth: 0,
  maxWidth: "100%",
  fontFamily: fontFamilies.mono,
  fontSize: "0.71875rem",
  fontWeight: 400,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
} as const;

export const link = style([
  focusVisible,
  label,
  {
    color: colorVars.text.secondary,
    textDecoration: "none",
    borderBlockEnd: `1px dashed ${colorVars.line.seam}`,
    selectors: {
      "&:hover": { color: colorVars.text.primary, borderBlockEndColor: "currentColor" },
      "&:active": { color: colorVars.text.primary },
    },
    "@media": {
      "(forced-colors: active)": { color: "LinkText", borderBlockEndColor: "LinkText" },
    },
  },
]);

export const current = style([label, { color: colorVars.text.primary }]);
