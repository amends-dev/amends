import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { breakpoint, layout, layer } from "../tokens/index.ts";

const tablet = `(min-width: ${breakpoint.navigation}px)`;
const desktop = `(min-width: ${breakpoint.sidebar}px)`;
export const shell = style({
  display: "flex",
  height: "100dvh",
  overflow: "hidden",
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
});
export const sidebar = style({
  display: "none",
  flex: `0 0 ${layout.sidebar}px`,
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  padding: "16px 8px",
  overflowY: "auto",
  "@media": { [desktop]: { display: "flex", flexDirection: "column" } },
});
export const rail = style({
  display: "none",
  flex: `0 0 ${layout.rail}px`,
  alignItems: "center",
  gap: vars.space[2],
  paddingBlock: vars.space[4],
  overflowY: "auto",
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  "@media": {
    [tablet]: { display: "flex", flexDirection: "column" },
    [desktop]: { display: "none" },
  },
});
export const railNav = style({
  display: "grid",
  gap: vars.space[1],
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  paddingTop: vars.space[2],
});
export const identity = style({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "0 6px 14px",
  minWidth: 0,
});
export const identityText = style({ flex: 1, display: "grid", minWidth: 0, gap: "1px" });
export const name = style([
  type.bodySmall,
  { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 },
]);
export const caption = style([type.caption, { color: vars.color.text.muted }]);
export const navigation = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space[1],
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  paddingTop: vars.space[3],
});
export const workspace = style({ flex: 1, minWidth: 0, display: "flex" });
export const body = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
});
export const mobileMenu = style({ display: "flex", "@media": { [tablet]: { display: "none" } } });
export const main = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  paddingBottom: "env(safe-area-inset-bottom)",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: -2 },
  },
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

export const railAccount = style({
  marginTop: "auto",
  paddingTop: vars.space[4],
  display: "flex",
  justifyContent: "center",
  paddingBottom: "env(safe-area-inset-bottom)",
});

export const inspectorHost = style({ flexShrink: 0, minHeight: 0, display: "flex" });
