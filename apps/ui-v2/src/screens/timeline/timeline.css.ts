import { style } from "@vanilla-extract/css";
import { media } from "../../foundations/layout/tokens.ts";

// Conversations read from the bottom: short timelines rest against the composer.
export const timeline = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: "1.5rem",
  minHeight: "100%",
  "@media": { [media.mobile]: { gap: "1.375rem" } },
});
