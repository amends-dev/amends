import { style, globalStyle, keyframes } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 22,
  padding: "56px 24px 36px",
  textAlign: "center",
});
export const copy = style({ display: "flex", flexDirection: "column", gap: 9, maxWidth: 420 });
export const illustration = style({
  width: 220,
  maxWidth: "100%",
  height: "auto",
  color: vars.color.line.control,
  selectors: { '&[data-kind="no-results"]': { width: 200 } },
});

globalStyle(`${root}[data-layout="inline"]`, {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 26,
  padding: "14px 2px 18px",
  textAlign: "left",
});
globalStyle(`${root}[data-layout="inline"] ${copy}`, {
  flex: 1,
  minWidth: "min(220px,100%)",
  maxWidth: "none",
});
globalStyle(`${root}[data-layout="inline"] ${illustration}`, { width: 150, flexShrink: 0 });
const stitch = keyframes({ to: { strokeDashoffset: -26 } });
globalStyle(`${illustration} [data-seam]`, {
  animation: `${stitch} 2.6s linear infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } },
});
