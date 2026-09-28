import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// The mocks' caution box: a warm fill and outline, an 18px triangle, then the title and details.
export const notice = style({
  display: "grid",
  gridTemplateColumns: "1.125rem minmax(0, 1fr)",
  alignItems: "start",
  columnGap: "0.625rem",
  padding: "0.75rem 1rem 1rem 0.75rem",
  border: `1px solid ${vars.color.border.caution}`,
  backgroundColor: vars.color.surface.caution,
});

export const icon = style({
  width: "1.125rem",
  height: "1.125rem",
  marginBlockStart: "0.125rem",
  color: vars.color.text.caution,
});

export const text = style({ display: "flex", flexDirection: "column", gap: "0.4375rem" });

export const title = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const body = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });
