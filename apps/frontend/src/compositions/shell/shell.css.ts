import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { hiddenText } from "../navigation/navigation.css.ts";

export const root = style({
  display: "flex",
  width: "100%",
  height: "100dvh",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  backgroundColor: colorVars.surface.canvas,
  color: colorVars.text.primary,
});
export const sidebar = style({
  display: "flex",
  flex: "0 0 16rem",
  minWidth: 0,
  minHeight: 0,
  selectors: {
    '&[data-collapsed="true"]': { flexBasis: "3.75rem" },
    '&[data-mobile="true"]': { display: "none" },
  },
});
export const dock = style({ display: "flex", flex: 1, minWidth: 0, minHeight: 0 });
export const sidebarFrame = style({
  width: "100%",
  height: "100%",
  minHeight: 0,
  backgroundColor: colorVars.surface.canvas,
});
export const sidebarHeader = style({
  flexShrink: 0,
  padding: space[2],
  paddingTop: `max(${space[3]}, env(safe-area-inset-top))`,
  minHeight: "4rem",
  boxSizing: "border-box",
});
export const headerContent = style({ flex: 1, minWidth: 0 });
export const sidebarContent = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: space[2],
});
export const sidebarFooter = style({
  flexShrink: 0,
  padding: space[2],
  paddingBottom: `max(${space[2]}, env(safe-area-inset-bottom))`,
  borderTop: `1px dashed ${colorVars.line.control}`,
});
export const sidebarLabel = style({
  minWidth: 0,
  overflowWrap: "anywhere",
  selectors: { [`${sidebarFrame}[data-compact="true"] &`]: hiddenText },
});
export const expanded = style({ minWidth: 0, selectors: { "&[hidden]": { display: "none" } } });
export const hidden = style(hiddenText);
export const drawer = style({ backgroundColor: colorVars.surface.canvas });
export const toggleIcon = style({ selectors: { "&:dir(rtl)": { transform: "scaleX(-1)" } } });
export const drawerHost = style({ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" });
export const body = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gridTemplateColumns: "minmax(0, 1fr)",
});
export const header = style({
  gridRow: 1,
  padding: space[4],
  paddingTop: `max(${space[4]}, env(safe-area-inset-top))`,
});
export const main = style([
  focusVisible,
  {
    gridRow: 2,
    minWidth: 0,
    minHeight: 0,
    overflow: "auto",
    overscrollBehavior: "contain",
    paddingBlock: space[4],
    paddingBottom: `max(${space[4]}, env(safe-area-inset-bottom))`,
    selectors: { "&:focus-visible": { outlineOffset: "-2px" } },
  },
]);
export const footer = style({
  gridRow: 3,
  padding: space[3],
  borderTop: `1px dashed ${colorVars.line.control}`,
});
export const skip = style([
  typographyStyles.body,
  focusVisible,
  {
    position: "fixed",
    top: space[2],
    insetInlineStart: space[2],
    zIndex: 40,
    transform: "translateY(-200%)",
    padding: space[3],
    backgroundColor: colorVars.surface.panel,
    color: colorVars.text.primary,
    selectors: { "&:focus": { transform: "none" } },
  },
]);
