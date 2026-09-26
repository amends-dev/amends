import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({ display: "flex", flexDirection: "column", minWidth: 0 });
export const earlier = style({
  display: "flex",
  justifyContent: "center",
  paddingBlock: "0.75rem",
  minWidth: 0,
});
export const items = style({
  // The list keeps the reader's place itself, the same in every browser.
  overflowAnchor: "none",
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
  minWidth: 0,
});
export const entry = style({
  minWidth: 0,
  borderRadius: "0.625rem",
  selectors: {
    // The entry the reader came to see: a wash that reaches past its edges without moving it.
    '&[data-focused="true"]': {
      backgroundColor: colorVars.action.selected,
      boxShadow: `0 0 0 0.5rem ${colorVars.action.selected}`,
    },
  },
  "@media": {
    "(forced-colors: active)": {
      selectors: { '&[data-focused="true"]': { outline: "2px solid Highlight" } },
    },
  },
});
export const day = style({ minWidth: 0, paddingBlock: "1rem 0.625rem" });
/** A line about the conversation, set like Status so it reads as the room, not a message. */
export const note = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: "0.5rem",
  minWidth: 0,
  paddingBlock: "0.375rem",
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.4,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const noteTime = style({
  // A separator to see, not to hear.
  selectors: { "&::before": { content: '"·" / ""', marginInlineEnd: "0.5rem" } },
});
/** One line after the entries; it keeps its height when empty, so they never jump. */
export const status = style({
  minHeight: "1.4em",
  paddingBlock: "0.25rem",
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.4,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
