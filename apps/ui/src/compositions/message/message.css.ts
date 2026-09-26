import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({
  display: "flex",
  gap: "0.75rem",
  minWidth: 0,
  paddingBlock: "0.8125rem",
  selectors: { '&[data-density="compact"]': { gap: "0.6875rem", paddingBlock: "0.75rem" } },
});
const compact = `${root}[data-density="compact"]`;
export const avatar = style({ display: "flex", flex: "none" });
export const content = style({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: "0.3125rem",
  minWidth: 0,
});
export const header = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  gap: "0.3125rem 0.6875rem",
  minWidth: 0,
  selectors: { [`${compact} &`]: { gap: "0.25rem 0.625rem" } },
});
export const author = style({
  fontSize: "0.875rem",
  fontWeight: 600,
  lineHeight: 1.4,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
  selectors: { [`${compact} &`]: { fontSize: "0.84375rem" } },
});
const mono = { fontFamily: fontFamilies.mono, fontSize: "0.6875rem", lineHeight: 1.4 } as const;
export const time = style({ ...mono, color: colorVars.text.secondary, whiteSpace: "nowrap" });
export const body = style({
  margin: 0,
  fontSize: "0.90625rem",
  lineHeight: 1.62,
  color: colorVars.text.primary,
  // Messages keep the author's line breaks and indentation, and long words wrap.
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  selectors: { [`${compact} &`]: { fontSize: "0.875rem", lineHeight: 1.6 } },
});
export const replies = style([
  focusVisible,
  {
    display: "inline-flex",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: "0.625rem",
    minHeight: "2rem",
    boxSizing: "border-box",
    // The pill's text lines up with the message; its fill extends into the gutter.
    marginInlineStart: "-0.6875rem",
    paddingBlock: "0.4375rem",
    paddingInline: "0.6875rem",
    borderRadius: "999px",
    color: "inherit",
    textDecoration: "none",
    selectors: {
      "&:hover": { backgroundColor: colorVars.action.hover },
      "&:active": { backgroundColor: colorVars.action.pressed },
      '&[aria-current]:not([aria-current="false"])': {
        backgroundColor: colorVars.action.selected,
      },
    },
    "@media": { "(pointer: coarse)": { minHeight: "2.75rem" } },
  },
]);
export const replyCount = style({ ...mono, fontSize: "0.71875rem", color: colorVars.text.link });
export const replyNote = style({ ...mono, color: colorVars.text.secondary });
