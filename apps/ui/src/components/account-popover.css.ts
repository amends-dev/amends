import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
export const trigger = style({
  padding: 0,
  borderRadius: "50%",
  width: 44,
  height: 44,
  minWidth: 44,
  flexShrink: 0,
  alignSelf: "center",
});
export const identity = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  padding: "1rem 1rem 0.875rem",
});
export const identityText = style({ display: "grid", gap: 2, minWidth: 0 });
export const name = style([type.body, { fontWeight: 600, overflowWrap: "anywhere" }]);
export const email = style([
  type.caption,
  { color: vars.color.text.muted, overflowWrap: "anywhere", marginInlineStart: 46 },
]);
export const explanation = style({
  display: "grid",
  gap: vars.space[2],
  padding: "0 1rem 0.875rem",
});
export const note = style({
  margin: 0,
  fontFamily: vars.font.sans,
  fontSize: "0.78125rem",
  lineHeight: 1.55,
  color: vars.color.text.secondary,
});
export const link = style({
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  color: vars.color.brand.text,
  textDecoration: "underline dashed",
  textUnderlineOffset: 3,
});
export const divider = style({
  border: 0,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  margin: "0 1rem",
});
export const theme = style({ display: "grid", gap: 10, padding: "0.875rem 1rem" });
export const swatch = style({
  display: "flex",
  alignItems: "center",
  gap: 4,
  height: 22,
  padding: "0 5px",
  borderRadius: 5,
  background: vars.color.surface.canvas,
});
export const dot = style({
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: vars.color.text.primary,
});
export const stitch = style({ flex: 1, borderTop: `1px dashed ${vars.color.line.seam}` });
export const actions = style({ padding: vars.space[2], display: "grid", gap: 2 });
export const action = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "9px 10px",
  minHeight: vars.control.touch,
  width: "100%",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: vars.color.text.primary,
  textAlign: "start",
  fontFamily: vars.font.sans,
  fontSize: "0.875rem",
  cursor: "pointer",
  selectors: {
    "&:hover": { background: vars.color.action.hover },
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: -2 },
  },
});
export const glyph = style({
  width: 16,
  flexShrink: 0,
  textAlign: "center",
  fontFamily: vars.font.mono,
});
export const shortcut = style([
  type.caption,
  { marginInlineStart: "auto", color: vars.color.text.muted },
]);
export const danger = style({ color: vars.color.status.danger.text });
