import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";

// 640 × 600 on wider layouts, capped to the viewport; full screen on phones.
export const dialog = style({
  boxSizing: "border-box",
  width: "min(40rem, calc(100vw - 2rem))",
  height: "min(37.5rem, calc(100dvh - 4rem))",
  maxWidth: "none",
  maxHeight: "none",
  margin: "auto",
  padding: 0,
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.raised,
  color: vars.color.text.primary,
  boxShadow: vars.shadow.modal,
  overflow: "hidden",
  selectors: {
    "&[open]": { display: "flex", flexDirection: "column" },
    "&[data-size=compact]": {
      width: "min(35rem, calc(100vw - 2rem))",
      // A modal dialog is anchored top and bottom, so "auto" would fill the viewport.
      height: "fit-content",
      maxHeight: "calc(100dvh - 4rem)",
    },
    "&::backdrop": { backgroundColor: vars.color.scrim },
  },
  "@media": {
    [media.mobile]: {
      selectors: {
        "&[data-size=compact]": { width: "100vw", height: "100dvh", maxHeight: "none" },
      },
      width: "100vw",
      height: "100dvh",
      border: "none",
      boxShadow: "none",
      paddingTop: "env(safe-area-inset-top)",
    },
  },
});

// Buttons at the end of a 64px band; on phones they share the width.
export const actions = style({
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "0.75rem",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "4rem",
  padding: "0.75rem 1.5rem",
  boxShadow: `inset 0 1px 0 ${vars.color.border.divider}`,
  "@media": {
    [media.mobile]: {
      gap: "0.5rem",
      padding: "0.75rem 1rem",
      paddingBlockEnd: "max(0.75rem, env(safe-area-inset-bottom))",
    },
  },
});

globalStyle(`${actions} > *`, { "@media": { [media.mobile]: { flex: 1 } } });
