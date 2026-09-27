import { style } from "@vanilla-extract/css";
import { vars } from "../foundations/theme/vars.css.ts";
import { space } from "../foundations/space/tokens.ts";
import { typeScale } from "../foundations/typography/tokens.ts";

export const page = style({ display: "grid", gap: space[8], maxWidth: "56rem" });

export const section = style({ display: "grid", gap: space[3] });

export const heading = style({ ...typeScale.item, fontWeight: 500, margin: 0 });

export const note = style({
  ...typeScale.control,
  color: vars.color.text.secondary,
  margin: 0,
  maxWidth: "40rem",
});

export const panel = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[6],
  padding: space[6],
  backgroundColor: vars.color.surface.panel,
  border: `1px solid ${vars.color.border.divider}`,
});

export const canvasPanel = style([panel, { backgroundColor: vars.color.surface.canvas }]);

export const labelled = style({
  display: "grid",
  justifyItems: "center",
  gap: space[2],
  ...typeScale.meta,
  color: vars.color.text.secondary,
});

export const tabsPanel = style([panel, { display: "block", paddingBlockEnd: 0 }]);

export const stack = style({
  display: "grid",
  gap: space[6],
  padding: space[6],
  backgroundColor: vars.color.surface.panel,
  border: `1px solid ${vars.color.border.divider}`,
});
