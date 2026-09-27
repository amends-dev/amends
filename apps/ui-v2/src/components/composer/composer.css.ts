import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { typeScale } from "../../foundations/typography/tokens.ts";

// Reference minimum heights: 136px on desktop, 112px on tablets, and 92px on phones.
export const composer = style({
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  minHeight: "8.5rem",
  padding: "1rem 1rem 0.8125rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  selectors: { "&:focus-within": { borderColor: vars.color.border.strong } },
  "@media": {
    [media.touch]: { minHeight: "7rem", padding: "0.75rem 1rem 0.25rem" },
    [media.mobile]: { minHeight: "5.75rem", padding: "0.625rem 0.75rem 0.25rem" },
  },
});

export const input = style({
  ...typeScale.item,
  display: "block",
  width: "100%",
  minHeight: "1.3125rem",
  maxHeight: "40vh",
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  resize: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  selectors: { "&::placeholder": { color: vars.color.text.muted, opacity: 1 } },
  "@media": {
    [media.touch]: typeScale.body,
    [media.mobile]: typeScale.bodyTouch,
  },
});

// Icon buttons line their icons up with the text above; send sits at the far end.
export const toolbar = style({
  display: "flex",
  alignItems: "center",
  gap: "0.125rem",
  marginBlockStart: "auto",
  paddingBlockStart: "0.5rem",
  marginInline: "-0.4375rem",
  "@media": { [media.touch]: { gap: 0, marginInline: "-0.5rem", paddingBlockStart: "0.25rem" } },
});

export const send = style({ marginInlineStart: "auto" });
