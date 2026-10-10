import { style } from "@vanilla-extract/css";
import { vars } from "../foundations/theme/vars.css.ts";
import { fontWeight, monoFamily, typeScale } from "../foundations/typography/tokens.ts";

export const art = style({
  display: "grid",
  alignContent: "start",
  gap: "0.75rem",
  height: "100%",
  boxSizing: "border-box",
  padding: "1.125rem 1rem",
});

export const label = style({
  ...typeScale.meta,
  margin: 0,
  fontWeight: fontWeight.semibold,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: vars.color.text.muted,
});

export const rule = style({ height: "1px", backgroundColor: vars.color.border.default });

export const list = style({ display: "grid", margin: 0, padding: 0, listStyle: "none" });

export const row = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  minWidth: 0,
  paddingBlock: "0.375rem",
  color: vars.color.text.primary,
  selectors: { "& + &": { borderTop: `1px solid ${vars.color.border.divider}` } },
});

export const plainRow = style({ selectors: { "& + &": { borderTop: "none" } } });

export const grow = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const quiet = style({ color: vars.color.text.secondary });

export const dot = style({
  flex: "none",
  width: "0.375rem",
  height: "0.375rem",
  borderRadius: "50%",
  backgroundColor: vars.color.text.primary,
});

export const dotRead = style({ backgroundColor: vars.color.border.default });

export const agent = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
});

export const agentName = style({ fontWeight: fontWeight.semibold, color: vars.color.text.agent });

export const check = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  color: vars.color.text.secondary,
});

export const kind = style({
  ...typeScale.meta,
  fontFamily: monoFamily,
  color: vars.color.text.muted,
});

export const logo = style({
  ...typeScale.meta,
  display: "grid",
  placeItems: "center",
  flex: "none",
  width: "1.375rem",
  height: "1.375rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  fontWeight: fontWeight.semibold,
});
