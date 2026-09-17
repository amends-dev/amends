import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  selectors: {
    '&[data-viewer="true"]': { minHeight: 360, maxHeight: "65vh", borderRadius: 10 },
    '&[data-appearance="inline"]': { padding: 0, background: "none", fontSize: "inherit" },
    '&[data-wrap="true"]': { whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  },
  margin: 0,
  padding: 12,
  maxWidth: "100%",
  maxHeight: 320,
  overflowX: "auto",
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  lineHeight: 1.6,
  background: vars.color.surface.recessed,
  borderRadius: 6,
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}` },
});

export const copyable = style({
  display: "grid",
  gap: 8,
  minWidth: 0,
  selectors: {
    '&[data-appearance="inline"]': {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
    },
  },
});
export const actions = style({ display: "flex", alignItems: "center", gap: 10 });
export const feedback = style({
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.muted,
});

export const line = style({
  display: "flex",
  minWidth: "max-content",
  selectors: { '[data-wrap="true"] &': { minWidth: 0 } },
});
export const number = style({
  width: 36,
  flexShrink: 0,
  textAlign: "right",
  paddingRight: 12,
  userSelect: "none",
  color: vars.color.text.muted,
});
export const viewer = style({ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 });
export const footer = style({
  overflowWrap: "anywhere",
  minWidth: 0,
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 16px",
  fontFamily: vars.font.mono,
  fontSize: 11,
  color: vars.color.text.muted,
});
