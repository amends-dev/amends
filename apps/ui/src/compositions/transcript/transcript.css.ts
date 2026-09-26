import { style } from "@vanilla-extract/css";

export const root = style({ display: "flex", flexDirection: "column", minWidth: 0 });
export const earlier = style({
  display: "flex",
  justifyContent: "center",
  paddingBlock: "0.75rem",
  minWidth: 0,
});
export const items = style({
  // The list keeps the reader's place itself, the same in every browser.
  overflowAnchor: "none",
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
  minWidth: 0,
});
export const entry = style({ minWidth: 0 });
export const day = style({ minWidth: 0, paddingBlock: "1rem 0.625rem" });
