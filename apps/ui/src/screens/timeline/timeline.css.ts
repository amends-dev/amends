import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// Conversations read from the bottom: short timelines rest against the composer.
export const timeline = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: "1.5rem",
  minHeight: "100%",
  selectors: { "&[data-anchor=top]": { justifyContent: "flex-start", minHeight: 0 } },
  "@media": { [media.mobile]: { gap: "1.375rem" } },
});

export const event = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  margin: 0,
  color: vars.color.text.secondary,
});

export const eventIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const eventTime = style({ ...typeScale.meta, color: vars.color.text.muted });

// "Completed · View turn log" under an agent's reply: quiet, like a timeline event.
export const turnNote = style({
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  margin: 0,
  color: vars.color.text.secondary,
});

export const turnLink = style({
  ...typeScale.hint,
  padding: 0,
  border: "none",
  background: "none",
  color: "inherit",
  fontFamily: "inherit",
  fontWeight: fontWeight.medium,
  cursor: "pointer",
  selectors: { "&:hover": { color: vars.color.text.primary, textDecoration: "underline" } },
});
