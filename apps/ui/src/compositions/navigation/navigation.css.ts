import { style } from "@vanilla-extract/css";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
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
export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
  selectors: { '&[data-compact="true"]': { gap: "0.375rem" } },
});
export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
  selectors: { "&:not(:first-child)": { marginTop: "0.875rem" } },
});
export const sectionHeader = style({
  padding: "0.25rem 0.625rem 0.375rem",
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
    gap: "0.6875rem",
    minWidth: 0,
    minHeight: "2.5rem",
    padding: "0.5625rem 0.625rem",
    boxSizing: "border-box",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    lineHeight: 1.3,
    color: colorVars.text.secondary,
    textDecoration: "none",
    overflowWrap: "anywhere",
    selectors: {
      "&:hover": { backgroundColor: colorVars.action.hover, color: colorVars.text.primary },
      '&[aria-current="page"]': {
        backgroundColor: colorVars.action.hover,
        color: colorVars.text.primary,
      },
      [`${root}[data-compact="true"] &`]: {
        width: "2.75rem",
        minHeight: "2.75rem",
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
  width: "1rem",
  height: "1rem",
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
    fontSize: "0.6875rem",
    marginInlineStart: "auto",
    color: "inherit",
    selectors: { [`${root}[data-compact="true"] &`]: hiddenText },
  },
]);
