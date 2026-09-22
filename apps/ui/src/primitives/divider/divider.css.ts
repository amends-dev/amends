import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";

export const root = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[3],
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
  selectors: { "&[hidden]": { display: "none" } },
});
export const line = style({
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  height: 0,
  flex: `1 0 ${space[4]}`,
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
  borderBlockStart: `1px dashed ${colorVars.line.seam}`,
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { "(forced-colors: active)": { borderBlockStartColor: "CanvasText" } },
});
export const label = style({
  minWidth: 0,
  maxWidth: "100%",
  overflowWrap: "anywhere",
  // Preserve the small section-label treatment when composed with Text's mono style.
  selectors: {
    "&&": { fontSize: "0.6875rem", letterSpacing: "0.08em", textTransform: "uppercase" },
    // A centered label reserves room for its two line segments as its text wraps.
    [`${root} > ${line} + &:has(+ ${line})`]: {
      maxWidth: `calc(100% - (${space[3]} + ${space[4]}) * 2)`,
    },
  },
});
