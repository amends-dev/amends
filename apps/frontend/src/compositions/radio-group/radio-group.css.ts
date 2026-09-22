import { style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";

export const root = style({
  margin: 0,
  padding: 0,
  border: 0,
  minWidth: 0,
  overflowWrap: "anywhere",
});
export const legend = style([
  typographyStyles.body,
  { padding: 0, marginBottom: space[2], color: colorVars.text.primary, maxWidth: "100%" },
]);
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[2],
});
export const options = style([stack]);
export const choice = style({
  display: "flex",
  alignItems: "flex-start",
  flexWrap: "wrap",
  gap: space[3],
  padding: space[3],
  minHeight: "2.75rem",
  minWidth: 0,
  boxSizing: "border-box",
  border: "1.4px solid transparent",
  borderRadius: radius.medium,
  color: colorVars.text.primary,
  cursor: "pointer",
  selectors: { "&:has(input:disabled)": { color: colorVars.text.disabled, cursor: "not-allowed" } },
});
export const variants = styleVariants({
  plain: {},
  card: {
    borderStyle: "dashed",
    borderColor: colorVars.line.control,
    selectors: {
      "&:has(input:checked:enabled), &:has(input:hover:enabled), &:hover:has(input:enabled)": {
        backgroundColor: colorVars.action.hover,
        borderColor: colorVars.line.strong,
      },
      "&:has(input:active:enabled), &:active:has(input:enabled)": {
        backgroundColor: colorVars.action.pressed,
        borderColor: colorVars.line.strong,
      },
      "&:has(input:focus-visible)": { borderColor: colorVars.line.strong },
      "&:has(input:disabled)": { backgroundColor: colorVars.action.disabled },
    },
  },
});
export const copy = style({ display: "grid", gap: space[1], minWidth: 0, flex: "1 1 10rem" });
export const description = style({ color: colorVars.text.secondary });
export const error = style({ color: colorVars.text.invalid });
