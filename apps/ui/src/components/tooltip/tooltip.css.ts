import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// What the pointer rests on keeps its own layout.
export const trigger = style({ display: "inline-flex", flex: "none" });

// A compact popover: the state's word in its tone, then why, at most 280px wide.
export const content = style({
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  boxSizing: "border-box",
  maxWidth: "17.5rem",
  padding: "0.5rem 0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  pointerEvents: "none",
});

export const title = style({
  ...typeScale.hint,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  selectors: {
    "&[data-tone=success]": { color: vars.color.status.success.text },
    "&[data-tone=caution]": { color: vars.color.status.caution.text },
    "&[data-tone=danger]": { color: vars.color.status.danger.text },
  },
});

export const detail = style({ ...typeScale.hint, color: vars.color.text.secondary });
