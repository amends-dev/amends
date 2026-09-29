import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";
import { knockoutVar } from "../status-mark/status-mark.css.ts";

// A name, avatar, or mention that opens a card: it keeps its own look and shows it can be opened.
export const trigger = style({
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&[aria-expanded=true]": { textDecoration: "underline", textUnderlineOffset: "0.1875rem" },
  },
});

// 320px wide; on phones the screen less 32px, up to 358px. Square, as a popover.
export const card = style({
  position: "fixed",
  zIndex: 50,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  width: "20rem",
  padding: "1rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  color: vars.color.text.primary,
  vars: {
    [knockoutVar]: vars.color.surface.popover,
    "--amends-logo-knockout": vars.color.surface.popover,
  },
  "@media": { [media.mobile]: { width: "min(calc(100vw - 2rem), 22.375rem)" } },
});

// The avatar, then the name wrapping onto more lines rather than clipping, then Close on phones.
export const identity = style({
  display: "flex",
  alignItems: "flex-start",
  gap: "0.75rem",
});

export const names = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  flex: 1,
  minWidth: 0,
});

export const name = style({
  ...typeScale.bodyTouch,
  margin: 0,
  fontWeight: fontWeight.medium,
  overflowWrap: "anywhere",
});

// The kind, then the state; an agent at work shows the logo first, and a state that needs
// attention takes its tone.
export const detail = style({
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  gap: "0.3125rem",
  margin: 0,
  color: vars.color.text.secondary,
  selectors: {
    "&[data-tone=caution]": { color: vars.color.status.caution.text },
    "&[data-tone=danger]": { color: vars.color.status.danger.text },
  },
});

// Touch screens dismiss with Close; elsewhere moving away or Escape does.
export const close = style({
  flex: "none",
  marginBlockStart: "-0.25rem",
  marginInlineEnd: "-0.25rem",
  "@media": { "(hover: hover)": { display: "none" } },
});

export const note = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

export const actions = style({ display: "flex", gap: "0.5rem" });

export const action = style({ flex: 1 });

export const unavailable = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary,
});
