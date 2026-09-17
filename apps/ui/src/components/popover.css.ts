import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { layer } from "../tokens/index.ts";
export const panel = style({
  zIndex: layer.overlay,
  width: "18.75rem",
  maxWidth: "var(--kb-popper-content-available-width)",
  maxHeight: "var(--kb-popper-content-available-height)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  borderRadius: 14,
  boxShadow: vars.shadow.overlay,
  outline: "none",
});
