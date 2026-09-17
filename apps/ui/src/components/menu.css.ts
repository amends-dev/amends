import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { layer } from "../tokens/index.ts";
export const content = style({
  zIndex: layer.overlay,
  minWidth: "12rem",
  maxWidth: "min(22rem, var(--kb-popper-content-available-width))",
  maxHeight: "var(--kb-popper-content-available-height)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: vars.space[1],
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  border: 0,
  borderRadius: 14,
  boxShadow: vars.shadow.overlay,
  outline: "none",
});
export const item = style([
  type.bodySmall,
  {
    display: "flex",
    alignItems: "center",
    minHeight: vars.control.regular,
    padding: `${vars.space[2]} ${vars.space[3]}`,
    borderRadius: vars.radius.small,
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&[data-highlighted]": {
        background: vars.color.action.hover,
        outline: `2px solid ${vars.color.focus.ring}`,
        outlineOffset: -2,
      },
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
    "@media": { "(any-pointer: coarse)": { minHeight: vars.control.touch } },
  },
]);
export const danger = style({ color: vars.color.status.danger.text });
export const separator = style({
  border: 0,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  margin: `${vars.space[1]} ${vars.space[3]}`,
});
/** Compact ink label from the primitives reference; the content establishes an inverse scope. */
export const tooltip = style({
  zIndex: layer.overlay,
  maxWidth: "min(18rem, var(--kb-popper-content-available-width))",
  fontFamily: vars.font.mono,
  fontSize: `${11.5 / 16}rem`,
  lineHeight: 1.5,
  padding: `${6 / 16}rem ${11 / 16}rem`,
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  borderRadius: 7,
  boxShadow: vars.shadow.tooltip,
  overflowWrap: "anywhere",
});
