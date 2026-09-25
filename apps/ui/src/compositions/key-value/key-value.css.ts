import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({ margin: 0, minWidth: 0 });
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: `${space[1]} ${space[4]}`,
  paddingBlock: "0.625rem",
  minWidth: 0,
  selectors: {
    "&:not(:last-child)": { borderBottom: `1px dashed ${colorVars.line.seam}` },
    "&[hidden]": { display: "none" },
  },
});
const text = {
  fontFamily: fontFamilies.mono,
  fontWeight: 400,
  lineHeight: "normal",
  minWidth: 0,
  maxWidth: "100%",
  margin: 0,
  overflowWrap: "anywhere",
} as const;
export const label = style([text, { fontSize: "0.71875rem", color: colorVars.text.secondary }]);
export const value = style([text, { fontSize: "0.78125rem", color: colorVars.text.primary }]);
