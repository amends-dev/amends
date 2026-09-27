import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const field = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

// Shared with fieldset legends so every form label looks the same.
export const label = style({
  ...typeScale.item,
  display: "block",
  padding: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const hint = style({
  ...typeScale.hint,
  margin: 0,
  marginBlockStart: "0.125rem",
  color: vars.color.text.secondary,
});

export const error = style({ ...typeScale.hint, margin: 0, color: vars.color.text.danger });
