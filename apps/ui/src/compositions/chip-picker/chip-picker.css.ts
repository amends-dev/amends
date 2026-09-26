import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({ display: "flex", flexDirection: "column", gap: space[2], minWidth: 0 });
export const chips = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space[2],
  margin: 0,
  padding: 0,
  listStyle: "none",
});
/** The Inventory's chip: a dashed pill in 12px mono, as Filter chips draw it, carrying a person. */
export const chip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4375rem",
  boxSizing: "border-box",
  minWidth: 0,
  maxWidth: "100%",
  minHeight: "2rem",
  paddingBlock: "0.1875rem",
  paddingInline: "0.3125rem 0.875rem",
  border: `1.3px dashed ${colorVars.line.control}`,
  borderRadius: radius.pill,
  color: colorVars.text.primary,
  fontFamily: fontFamilies.mono,
  fontSize: "0.75rem",
  lineHeight: 1.25,
  selectors: { '&[data-removable="true"]': { paddingInlineEnd: "0.1875rem" } },
});
/** The picker reference's initial in a ring: solid for people, dashed for agents. */
export const mark = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  width: "1.375rem",
  height: "1.375rem",
  flexShrink: 0,
  borderRadius: radius.pill,
  border: `1.3px solid ${colorVars.line.control}`,
  color: colorVars.text.secondary,
  fontSize: "0.625rem",
  lineHeight: 1,
  selectors: { '&[data-ring="dashed"]': { borderStyle: "dashed" } },
});
export const label = style({ minWidth: 0, overflowWrap: "anywhere" });
export const note = style({ color: colorVars.text.secondary, whiteSpace: "nowrap" });
export const remove = style([
  focusVisible,
  {
    appearance: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxSizing: "border-box",
    width: "1.5rem",
    height: "1.5rem",
    padding: 0,
    border: "none",
    borderRadius: radius.pill,
    background: "transparent",
    color: colorVars.text.secondary,
    fontFamily: fontFamilies.mono,
    fontSize: "0.75rem",
    lineHeight: 1,
    cursor: "pointer",
    selectors: {
      "&:hover:enabled": { background: colorVars.action.hover, color: colorVars.text.primary },
      "&:active:enabled": { background: colorVars.action.pressed },
      "&:disabled": { color: colorVars.text.disabled, cursor: "not-allowed" },
    },
    "@media": { "(any-pointer: coarse)": { width: "2.75rem", height: "2.75rem" } },
  },
]);
