import { style } from "@vanilla-extract/css";
import { breakpoint } from "../tokens/index.ts";
export const root = style({
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 12,
  "@media": {
    [`(max-width: ${breakpoint.sidebar - 1}px)`]: { gridTemplateColumns: "minmax(0,1fr)" },
  },
});
