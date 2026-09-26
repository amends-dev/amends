import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { focusVisible } from "../../foundations/focus/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { hiddenText } from "../navigation/navigation.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

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
    '&[data-overlay="true"]': { display: "none" },
    "&[hidden]": { display: "none" },
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
    "&:has(> [data-shell-utility])::after": {
      content: '""',
      gridRow: 1,
      gridColumn: "1 / -1",
      alignSelf: "end",
      marginInline: "0.875rem",
      borderBottom: `1px dashed ${colorVars.line.seam}`,
      pointerEvents: "none",
    },
  },
});
export const sidebarHeader = style({
  gridArea: "header",
  flexShrink: 0,
  padding: "1rem 0.875rem 0.75rem",
  paddingTop: "max(1rem, env(safe-area-inset-top))",
  minHeight: "4.25rem",
  boxSizing: "border-box",
  borderBottom: `1px dashed ${colorVars.line.seam}`,
  selectors: {
    [`${sidebarFrame}:has(> [data-shell-utility]) &`]: { borderBottom: 0 },
    [`${sidebarFrame}[data-compact="true"] &`]: {
      justifyContent: "center",
      paddingInline: "0.75rem",
    },
  },
});
export const headerContent = style({ flex: 1, minWidth: 0 });
export const sidebarContent = style({
  gridArea: "content",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "0.625rem 0.5rem",
});
export const sidebarFooter = style({
  gridArea: "footer",
  flexShrink: 0,
  padding: "0.5rem",
  paddingBottom: `max(${space[2]}, env(safe-area-inset-bottom))`,
  borderTop: `1px dashed ${colorVars.line.seam}`,
});
export const sidebarUtility = style({
  gridArea: "utility",
  alignSelf: "center",
  minWidth: 0,
  padding: "0.5rem",
  selectors: { "&[hidden]": { display: "none" } },
});
export const sidebarLabel = style({
  minWidth: 0,
  fontSize: "0.875rem",
  fontWeight: 600,
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: { [`${sidebarFrame}[data-compact="true"] &`]: hiddenText },
});
export const sidebarSubtitle = style({
  fontFamily: fontFamilies.mono,
  fontSize: "0.65625rem",
  lineHeight: 1.3,
  color: colorVars.text.secondary,
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
  selectors: {
    '&[data-workspace="true"]': {
      display: "block",
      padding: "1.5rem 1.875rem 0.875rem",
    },
  },
  "@media": {
    "screen and (max-width: 47.999rem)": {
      selectors: { '&[data-workspace="true"]': { padding: "1rem 1.125rem 0.75rem" } },
    },
  },
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
      '&[data-workspace="true"]': { paddingBlock: 0 },
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
  selectors: {
    '&[data-width="fluid"]': { padding: "0.375rem 1.875rem 1.75rem" },
  },
  "@media": {
    "screen and (max-width: 47.999rem)": {
      selectors: { '&[data-width="fluid"]': { padding: "0.375rem 1.125rem 1.375rem" } },
    },
  },
});
export const contentInner = style({
  flexShrink: 0,
  // Auto margins become zero when content is taller than Main, preserving its start edge.
  selectors: {
    [`${content}[data-centered="true"] > &`]: { marginBlock: "auto" },
    [`${content}[data-fill="true"] > &`]: {
      flexGrow: 1,
      display: "flex",
      flexDirection: "column",
    },
  },
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

export const rail = style({
  display: "none",
  flex: "0 0 3.75rem",
  minWidth: 0,
  minHeight: 0,
  flexDirection: "column",
  alignItems: "center",
  gap: "0.375rem",
  padding: "0.875rem 0 0.5rem",
  boxSizing: "border-box",
  backgroundColor: colorVars.surface.canvas,
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { "screen and (min-width: 48rem) and (max-width: 63.999rem)": { display: "flex" } },
});
export const railContent = style({
  flex: 1,
  minHeight: 0,
  width: "100%",
  overflowY: "auto",
  padding: "0 0.5rem",
  boxSizing: "border-box",
});
export const railFooter = style({ width: "100%", padding: "0 0.5rem", boxSizing: "border-box" });
/** The Shell v2 session log is 400px inline only when content retains 560px. */
export const inspector = style({
  display: "flex",
  flex: "0 0 25rem",
  minWidth: 0,
  minHeight: 0,
  borderInlineStart: `1px dashed ${colorVars.line.seam}`,
  backgroundColor: colorVars.surface.panel,
  selectors: { "&[hidden]": { display: "none" } },
});
export const inspectorDock = style({ display: "flex", flex: 1, minWidth: 0, minHeight: 0 });
// A column, so InspectorBody can fill the height left under the header.
export const inspectorFrame = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
});
/** Inspector content: a header that stays in place over a scrolling body. */
export const inspectorHeader = style({
  position: "sticky",
  top: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  minWidth: 0,
  paddingBlock: "1.125rem 0.75rem",
  paddingInline: "1.25rem",
  backgroundColor: colorVars.surface.panel,
});
export const inspectorHeading = style({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: "0.125rem",
  minWidth: 0,
});
export const inspectorTitle = style({
  margin: 0,
  fontFamily: fontFamilies.serif,
  fontSize: "1.25rem",
  fontWeight: 400,
  lineHeight: 1.15,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
});
export const inspectorMeta = style({
  fontFamily: fontFamilies.mono,
  fontSize: "0.6875rem",
  lineHeight: 1.4,
  color: colorVars.text.secondary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
// Fills the rest of the inspector as a column, so a docked composer sits at its end.
export const inspectorBody = style({
  display: "flex",
  flexDirection: "column",
  flex: "1 0 auto",
  minWidth: 0,
  paddingInline: "1.25rem",
  paddingBlockEnd: "1.25rem",
});
export const inspectorDrawer = style({
  insetInlineStart: "auto",
  insetInlineEnd: 0,
  width: "min(25rem, 100%)",
  backgroundColor: colorVars.surface.panel,
  animation: "none !important",
  "@media": { "screen and (max-width: 47.999rem)": { width: "100%" } },
});
export const inspectorDrawerHost = style({ display: "flex", flex: 1, minWidth: 0, minHeight: 0 });
