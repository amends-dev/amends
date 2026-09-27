import { style } from "@vanilla-extract/css";
import { vars } from "./theme/vars.css.ts";
import { space } from "./space/tokens.ts";
import { typeScale } from "./typography/tokens.ts";

export const page = style({ display: "grid", gap: space[8], maxWidth: "72rem" });

export const section = style({ display: "grid", gap: space[3] });

export const heading = style({ ...typeScale.item, fontWeight: 500, margin: 0 });

export const note = style({
  ...typeScale.control,
  color: vars.color.text.secondary,
  margin: 0,
  maxWidth: "40rem",
});

export const grid = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))",
  gap: space[3],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const swatch = style({
  display: "grid",
  gridTemplateColumns: "2.5rem 1fr",
  alignItems: "center",
  gap: space[3],
});

export const chip = style({
  width: "2.5rem",
  height: "2.5rem",
  boxSizing: "border-box",
  border: `1px solid ${vars.color.border.divider}`,
  display: "grid",
  placeItems: "center",
  fontWeight: 600,
  ...typeScale.control,
});

export const name = style({ ...typeScale.control, fontWeight: 500, display: "block" });

export const value = style({
  ...typeScale.meta,
  color: vars.color.text.secondary,
  display: "block",
  fontVariantNumeric: "tabular-nums",
});

export const panel = style({
  backgroundColor: vars.color.surface.panel,
  border: `1px solid ${vars.color.border.divider}`,
  padding: space[6],
  display: "grid",
  gap: space[5],
});

export const specimenRow = style({
  display: "grid",
  gridTemplateColumns: "8rem 1fr",
  alignItems: "baseline",
  gap: space[4],
});

export const specimenText = style({ margin: 0 });

export const bar = style({
  height: space[3],
  backgroundColor: vars.color.action.primary,
});

export const barTrack = style({ display: "flex", alignItems: "center" });

export const elevationGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
  gap: space[8],
  padding: space[6],
});

export const card = style({
  height: "6rem",
  backgroundColor: vars.color.surface.raised,
  border: `1px solid ${vars.color.border.default}`,
  display: "grid",
  placeItems: "center",
  ...typeScale.control,
});

export const shadows = {
  modal: style({ boxShadow: vars.shadow.modal }),
  popover: style({ boxShadow: vars.shadow.popover, backgroundColor: vars.color.surface.popover }),
  toast: style({ boxShadow: vars.shadow.toast, backgroundColor: vars.color.surface.popover }),
};

// Icons: a searchable grid of every drawing, then sizes and weights.
export const iconGrid = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 11rem), 1fr))",
  gap: space[3],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const iconTile = style({
  display: "grid",
  gap: space[2],
  padding: space[4],
  border: `1px solid ${vars.color.border.divider}`,
  color: vars.color.text.primary,
});

export const iconCode = style({
  ...typeScale.meta,
  color: vars.color.text.secondary,
  overflowWrap: "anywhere",
});

export const iconRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[6],
  color: vars.color.text.primary,
});

export const iconSample = style({
  display: "grid",
  justifyItems: "center",
  gap: space[1],
  ...typeScale.meta,
  color: vars.color.text.secondary,
});
