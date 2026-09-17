import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  padding: 0,
  margin: 0,
  border: 0,
  minWidth: 0,
  containerType: "inline-size",
});
export const legend = style({
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
});
export const input = style({ position: "absolute", opacity: 0, width: 1, height: 1 });
export const row = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "7px minmax(0,1fr) auto",
  alignItems: "center",
  gap: "4px 12px",
  padding: "12px 8px",
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
  borderRadius: 8,
  cursor: "pointer",
  selectors: {
    "&:has(input:checked)": { background: vars.color.action.selected },
    "&:has(input:focus-visible)": {
      outline: `2px solid ${vars.color.focus.ring}`,
      outlineOffset: 2,
    },
    "&:has(input:disabled)": { opacity: 0.5, cursor: "default" },
  },
  "@container": {
    "(max-width: 600px)": {
      gridTemplateColumns: "7px minmax(0,1fr)",
      selectors: {
        '&[data-metadata="inline"]': {
          gridTemplateColumns: "7px minmax(0,1fr) minmax(0,1.25fr)",
          columnGap: 8,
        },
      },
    },
  },
});
export const dot = style({
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: vars.color.status.neutral,
  selectors: {
    [`${row}:has(input:checked) &`]: { background: vars.color.status.success.indicator },
  },
});
export const copy = style({ display: "flex", flexDirection: "column", gap: 4 });
export const title = style({ fontFamily: vars.font.sans, fontSize: "0.90625rem", fontWeight: 600 });
export const description = style({
  fontFamily: vars.font.mono,
  fontSize: "0.75rem",
  color: vars.color.text.muted,
});
export const metadata = style({
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  fontFamily: vars.font.mono,
  fontSize: "0.6875rem",
  color: vars.color.text.muted,
  "@container": {
    "(max-width: 600px)": {
      gridColumn: 2,
      selectors: {
        [`${row}[data-metadata="inline"] &`]: {
          gridColumn: 3,
          textAlign: "right",
          justifyContent: "flex-end",
          overflowWrap: "anywhere",
        },
      },
    },
  },
});
