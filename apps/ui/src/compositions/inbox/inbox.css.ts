import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});
/** The Home reference's "Needs you" card: a panel with 18px padding, 12px radius, 10px gaps. */
export const item = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  minWidth: 0,
  padding: "1.125rem",
  border: "1px solid transparent",
  borderRadius: "0.75rem",
  backgroundColor: colorVars.surface.panel,
  selectors: { '&[data-current="true"]': { borderColor: colorVars.line.strong } },
  "@media": { "(forced-colors: active)": { borderColor: "CanvasText" } },
});
export const header = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.3125rem 0.5625rem",
  minWidth: 0,
});
const mono = { fontFamily: fontFamilies.mono, lineHeight: 1.4, overflowWrap: "anywhere" } as const;
/** Marks what is still pending for the reader, before the reason. */
export const unread = style({
  flex: "none",
  width: "0.4375rem",
  height: "0.4375rem",
  borderRadius: "50%",
  backgroundColor: colorVars.status.pending.indicator,
  "@media": { "(forced-colors: active)": { backgroundColor: "Highlight" } },
});
export const reason = style({ ...mono, fontSize: "0.71875rem", color: colorVars.text.secondary });
export const meta = style({
  ...mono,
  marginInlineStart: "auto",
  fontSize: "0.6875rem",
  color: colorVars.text.secondary,
});
/** What was said, as the reference quotes it: serif italic, up to three lines. */
export const quote = style({
  display: "-webkit-box",
  margin: 0,
  overflow: "hidden",
  fontFamily: fontFamilies.serif,
  fontSize: "1.25rem",
  fontStyle: "italic",
  lineHeight: 1.28,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  selectors: { [`${item}[data-seen="true"] &`]: { color: colorVars.text.secondary } },
});
export const note = style({
  margin: 0,
  fontSize: "0.84375rem",
  lineHeight: 1.55,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[2],
  paddingTop: "0.125rem",
});
/** A link with the primary button's shape and colors, which a button cannot be. */
export const open = style([
  typographyStyles.mono,
  focusVisible,
  {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    maxWidth: "100%",
    minHeight: "2.5rem",
    padding: `${space[2]} ${space[5]}`,
    border: "1px solid transparent",
    borderRadius: radius.pill,
    backgroundColor: colorVars.action.fill,
    color: colorVars.action.onFill,
    textAlign: "center",
    textDecoration: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&:hover": { backgroundColor: colorVars.action.fillHover },
      "&:active": { backgroundColor: colorVars.action.fillPressed },
    },
    "@media": {
      "(any-pointer: coarse)": { minHeight: "2.75rem" },
      "(forced-colors: active)": { borderColor: "LinkText", color: "LinkText" },
    },
  },
]);
