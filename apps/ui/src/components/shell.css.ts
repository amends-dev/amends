import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { breakpoint, layer, layout } from "../tokens/index.ts";

export const root = style({
  display: "flex",
  height: "100dvh",
  overflow: "hidden",
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
});
export const sidebar = style({
  display: "flex",
  flexDirection: "column",
  flex: `0 0 ${layout.sidebar}px`,
  minHeight: 0,
  padding: "16px 8px",
  overflow: "hidden",
  selectors: {
    '&[data-mode="mobile"]': { display: "none" },
    '&[data-mode="rail"]': { flexBasis: layout.rail, alignItems: "center", gap: vars.space[3] },
  },
});
export const dock = style({ display: "flex", flex: 1, minWidth: 0, minHeight: 0, width: "100%" });
export const sidebarContent = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gridTemplateAreas: '"header actions" "content content"',
  gap: `${vars.space[3]} ${vars.space[2]}`,
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  selectors: {
    '&[data-compact="true"]': {
      gridTemplateColumns: "minmax(0, 1fr)",
      gridTemplateRows: "auto auto minmax(0, 1fr) auto",
      gridTemplateAreas: '"header" "toggle" "content" "actions"',
      gap: vars.space[2],
    },
  },
});
export const sidebarHeader = style({
  gridArea: "header",
  minWidth: 0,
  alignSelf: "center",
  selectors: { [`${sidebarContent}[data-compact="true"] > &`]: { justifySelf: "center" } },
});
export const sidebarActions = style({
  gridArea: "actions",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  alignSelf: "center",
  selectors: { [`${sidebarContent}[data-compact="true"] > &`]: { justifyContent: "center" } },
});
export const sidebarToggle = style({
  gridArea: "toggle",
  justifySelf: "center",
  selectors: { "&[hidden]": { display: "none" } },
});
export const sidebarNavigation = style({
  gridArea: "content",
  minHeight: 0,
  minWidth: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingTop: vars.space[2],
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
export const drawer = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
  padding: "max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))",
});
export const body = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
});
export const header = style({
  gridColumn: 1,
  gridRow: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space[3],
  padding: "24px 30px 14px",
  "@media": {
    [`(max-width: ${breakpoint.navigation - 1}px)`]: {
      padding: "max(16px, env(safe-area-inset-top)) 18px 12px",
    },
  },
});
export const main = style({
  gridColumn: 1,
  gridRow: 2,
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  paddingBottom: "env(safe-area-inset-bottom)",
  selectors: {
    '&[data-scroll="panels"]': { overflow: "hidden", display: "flex", flexDirection: "column" },
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: -2 },
  },
});
export const footer = style({
  gridColumn: 1,
  gridRow: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: vars.space[4],
  padding: `${vars.space[5]} ${vars.space[6]}`,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
export const inspectorHost = style({
  gridColumn: 2,
  gridRow: "1 / -1",
  minHeight: 0,
  display: "flex",
});
export const skip = style([
  type.bodySmall,
  {
    position: "fixed",
    top: 8,
    left: 8,
    zIndex: layer.modal,
    transform: "translateY(-200%)",
    padding: vars.space[3],
    background: vars.color.surface.panel,
    color: vars.color.text.primary,
    selectors: { "&:focus": { transform: "none" } },
  },
]);
