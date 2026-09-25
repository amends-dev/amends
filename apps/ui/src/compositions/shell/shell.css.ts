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
  selectors: {
    "&:has(> [data-shell-utility])": {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
      gridTemplateAreas: '"header utility" "content content" "footer footer"',
    },
    '&[data-compact="true"]:has(> [data-shell-utility])': {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "auto minmax(0, 1fr) auto auto",
      gridTemplateAreas: '"header" "content" "footer" "utility"',
    },
  },
});
export const sidebarHeader = style({
  gridArea: "header",
  flexShrink: 0,
  padding: space[2],
  paddingTop: `max(${space[3]}, env(safe-area-inset-top))`,
  minHeight: "4rem",
  boxSizing: "border-box",
});
export const headerContent = style({ flex: 1, minWidth: 0 });
export const sidebarContent = style({
  gridArea: "content",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: space[2],
});
export const sidebarFooter = style({
  gridArea: "footer",
  flexShrink: 0,
  padding: space[2],
  paddingBottom: `max(${space[2]}, env(safe-area-inset-bottom))`,
  borderTop: `1px dashed ${colorVars.line.seam}`,
});
export const sidebarUtility = style({
  gridArea: "utility",
  alignSelf: "center",
  minWidth: 0,
  padding: space[2],
  selectors: { "&[hidden]": { display: "none" } },
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
  selectors: {
    '&[data-scroll="page"]': { display: "flex", flexDirection: "column", overflow: "auto" },
  },
});
export const header = style({
  flexShrink: 0,
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
    selectors: {
      "&:focus-visible": { outlineOffset: "-2px" },
      [`${body}[data-scroll="page"] > &`]: {
        flex: "1 0 auto",
        minHeight: "auto",
        overflow: "visible",
      },
    },
  },
]);
export const footer = style({
  flexShrink: 0,
  gridRow: 3,
  padding: space[3],
  borderTop: `1px dashed ${colorVars.line.seam}`,
});
export const content = style({
  boxSizing: "border-box",
  minHeight: "100%",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflowWrap: "anywhere",
});
export const contentInner = style({
  flexShrink: 0,
  // Auto margins become zero when content is taller than Main, preserving its start edge.
  selectors: { [`${content}[data-centered="true"] > &`]: { marginBlock: "auto" } },
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
