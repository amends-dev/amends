import { style } from "@vanilla-extract/css";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

export const hiddenText = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
export const root = style({ display: "flex", flexDirection: "column", gap: space[1], minWidth: 0 });
export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: space[1],
  minWidth: 0,
  marginTop: space[4],
});
export const sectionHeader = style({
  padding: `${space[1]} ${space[3]}`,
  minHeight: "1.5rem",
  selectors: {
    [`${root}[data-compact="true"] &`]: { width: "1.75rem", alignSelf: "center", paddingInline: 0 },
  },
});
export const sectionLabel = style({
  selectors: { [`${root}[data-compact="true"] &`]: hiddenText },
});
export const sectionActions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[1],
  flexShrink: 0,
  maxWidth: "100%",
  selectors: { "&[hidden]": { display: "none" } },
});
export const link = style([
  typographyStyles.body,
  focusVisible,
  {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: space[3],
    minWidth: 0,
    minHeight: "2.75rem",
    padding: `${space[2]} ${space[3]}`,
    boxSizing: "border-box",
    borderRadius: radius.medium,
    color: colorVars.text.secondary,
    textDecoration: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&:hover": { backgroundColor: colorVars.action.hover, color: colorVars.text.primary },
      '&[aria-current="page"]': {
        backgroundColor: colorVars.action.hover,
        color: colorVars.text.primary,
      },
      '&[aria-current="page"]::before': {
        content: '""',
        position: "absolute",
        insetInlineStart: "0.125rem",
        top: "25%",
        bottom: "25%",
        width: "0.125rem",
        backgroundColor: "currentColor",
        borderRadius: radius.pill,
      },
      [`${root}[data-compact="true"] &`]: {
        width: "2.75rem",
        padding: 0,
        justifyContent: "center",
        alignSelf: "center",
      },
    },
  },
]);
export const icon = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  flexShrink: 0,
});
export const label = style({
  minWidth: 0,
  flex: 1,
  selectors: { [`${root}[data-compact="true"] &`]: hiddenText },
});
export const count = style([
  typographyStyles.mono,
  {
    marginInlineStart: "auto",
    color: "inherit",
    selectors: { [`${root}[data-compact="true"] &`]: hiddenText },
  },
]);
