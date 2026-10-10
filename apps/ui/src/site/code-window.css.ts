import { style } from "@vanilla-extract/css";
import { vars } from "../foundations/theme/vars.css.ts";
import { monoFamily, typeScale } from "../foundations/typography/tokens.ts";

// Inside a dark Theme, so a window reads as a terminal in either mode.
export const window = style({
  minWidth: 0,
  border: `1px solid ${vars.color.border.divider}`,
  backgroundColor: vars.color.surface.panel,
  boxShadow: vars.shadow.modal,
});

export const figure = style({ margin: 0, minWidth: 0 });

export const bar = style({
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  minHeight: "2.5rem",
  paddingInline: "1rem",
  borderBottom: `1px solid ${vars.color.border.divider}`,
  backgroundColor: vars.color.surface.field,
});

export const dots = style({ display: "flex", gap: "0.375rem" });

export const dot = style({
  width: "0.625rem",
  height: "0.625rem",
  borderRadius: "50%",
  backgroundColor: vars.color.surface.selected,
});

export const title = style({
  ...typeScale.hint,
  fontFamily: monoFamily,
  color: vars.color.text.muted,
});

export const code = style({
  margin: 0,
  padding: "1.5rem 1.5rem 1.75rem",
  overflowX: "auto",
  fontFamily: monoFamily,
  fontSize: "0.8125rem",
  lineHeight: "1.375rem",
  color: vars.color.text.primary,
  tabSize: 2,
});
