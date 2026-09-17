import { style, keyframes } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
const move = keyframes({ to: { strokeDashoffset: -26 } });
export const root = style({ width: 88, height: 8, flexShrink: 0, color: vars.color.text.muted });
export const thread = style({
  animation: `${move} 2.6s linear infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } },
});
