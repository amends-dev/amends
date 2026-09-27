import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const intro = style({ display: "flex", flexDirection: "column", gap: "0.75rem" });

export const title = style({
  ...typeScale.display,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const lead = style({
  ...typeScale.item,
  lineHeight: "1.375rem",
  margin: 0,
  color: vars.color.text.secondary,
});

export const recipient = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBlockStart: "-0.3125rem",
});

export const email = style({
  ...typeScale.item,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

// Inline text actions such as "Change email" and "Send again".
export const link = style({
  ...typeScale.control,
  flex: "none",
  padding: "0.25rem 0",
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  fontWeight: fontWeight.medium,
  textDecoration: "underline",
  textDecorationColor: vars.color.border.default,
  textUnderlineOffset: "0.25rem",
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.primary, textDecorationColor: "currentColor" },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&:disabled": { color: vars.color.text.disabled, cursor: "default" },
  },
});

export const strongLink = style([link, { color: vars.color.text.primary }]);

export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  marginBlockStart: "2.375rem",
});

export const footnote = style({
  ...typeScale.hint,
  lineHeight: "1.25rem",
  margin: 0,
  marginBlockStart: "1.375rem",
  color: vars.color.text.secondary,
});

export const resend = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
  margin: 0,
  marginBlockStart: "1rem",
  color: vars.color.text.secondary,
});

export const providers = style({ display: "flex", flexDirection: "column", gap: "0.75rem" });

export const or = style({ marginBlock: "0.625rem 0.125rem" });
