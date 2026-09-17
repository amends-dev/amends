import { recipe } from "@vanilla-extract/recipes";
import { vars } from "../styles/contract.css.ts";
export const dot = recipe({
  base: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: vars.radius.pill,
    flexShrink: 0,
  },
  variants: {
    tone: {
      neutral: { background: vars.color.status.neutral },
      running: { background: vars.color.status.running },
      pending: { background: vars.color.status.pending.indicator },
      success: { background: vars.color.status.success.indicator },
      danger: { background: vars.color.status.danger.indicator },
    },
  },
});
