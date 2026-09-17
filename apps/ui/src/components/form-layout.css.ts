import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: 24,
  maxWidth: 820,
  selectors: { '&[data-full-width="true"]': { maxWidth: "none" } },
  width: "100%",
  minWidth: 0,
});
export const columnsContainer = style({
  containerType: "inline-size",
  containerName: "form-columns",
  minWidth: 0,
  width: "100%",
});
export const columns = style({
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  selectors: {
    '&[data-proportions="identity"]': {
      gridTemplateColumns: "auto minmax(0,1fr)",
      alignItems: "center",
    },
    '&[data-proportions="narrow-start"]': {
      gridTemplateColumns: "minmax(140px, 1fr) minmax(0, 3fr)",
    },
  },
  gap: 20,
  "@container": {
    "form-columns (max-width: 560px)": {
      gridTemplateColumns: "minmax(0,1fr)",
      selectors: { '&[data-proportions="narrow-start"]': { gridTemplateColumns: "minmax(0,1fr)" } },
    },
  },
});
export const section = style({ margin: 0, padding: 0, border: 0, minWidth: 0 });
export const label = style({
  padding: 0,
  marginBottom: 10,
  textTransform: "uppercase",
  color: vars.color.text.secondary,
});
export const description = style({
  margin: "10px 0 0",
  color: vars.color.text.muted,
});
