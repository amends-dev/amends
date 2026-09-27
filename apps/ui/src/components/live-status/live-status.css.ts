import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// A small note floating at the bottom of the screen, like a toast that stays until changes resume.
export const status = style({
  ...typeScale.hint,
  position: "fixed",
  insetInlineStart: "50%",
  bottom: "1rem",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  margin: 0,
  padding: "0.5rem 0.875rem",
  transform: "translateX(-50%)",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.toast,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  selectors: {
    // Empty while live, but still in place so screen readers hear it change.
    "&:empty": { padding: 0, border: "none", boxShadow: "none" },
  },
});

const pulse = keyframes({ "50%": { opacity: 0.35 } });

export const dot = style({
  width: "0.4375rem",
  height: "0.4375rem",
  borderRadius: "50%",
  backgroundColor: vars.color.text.secondary,
  animation: `${pulse} 1.6s ease-in-out infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } },
});
