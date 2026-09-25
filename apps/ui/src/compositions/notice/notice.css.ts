import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import type { NoticeTone } from "./notice.tsx";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  minWidth: 0,
  paddingBlock: space[4],
  paddingInline: "1.125rem",
  borderRadius: "0.75rem",
  // Transparent until forced colors remove the tint; the border then keeps the panel visible.
  border: "1px solid transparent",
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
  "@media": { "(forced-colors: active)": { borderColor: "CanvasText" } },
});
export const tones = styleVariants({
  danger: { backgroundColor: colorVars.status.danger.soft },
  pending: { backgroundColor: colorVars.status.pending.soft },
  success: { backgroundColor: colorVars.status.success.soft },
} satisfies Record<NoticeTone, object>);
export const label = style({
  margin: 0,
  fontSize: "0.6875rem",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
});
export const body = style({ margin: 0 });
