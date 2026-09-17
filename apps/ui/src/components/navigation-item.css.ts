import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";

export const item = style([
  type.bodySmall,
  {
    display: "flex",
    alignItems: "center",
    gap: 11,
    minHeight: 44,
    padding: "8px 10px",
    borderRadius: 8,
    color: vars.color.text.secondary,
    textDecoration: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&:hover": { background: vars.color.action.hover, color: vars.color.text.primary },
      "&[aria-current='page']": {
        background: vars.color.action.selected,
        color: vars.color.text.primary,
      },
      "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 2 },
      "&[data-compact='true']": { width: 44, justifyContent: "center", padding: 0 },
    },
  },
]);
export const icon = style([type.mono, { width: 16, textAlign: "center", flexShrink: 0 }]);
export const label = style({ minWidth: 0 });
export const count = style([type.caption, { marginLeft: "auto", color: vars.color.text.muted }]);
