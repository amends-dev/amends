import { breakpoint } from "../tokens/index.ts";
import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  height: "100%",
  minHeight: 0,
  overflowY: "auto",
  selectors: {
    '&[data-inspector="true"]': { display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px" },
  },
});
export const primary = style({
  minWidth: 0,
  padding: "8px 30px 30px",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { padding: "6px 18px 22px" } },
});
export const panel = style({
  padding: 24,
  background: vars.color.surface.canvas,
  borderInlineStart: `1px dashed ${vars.color.line.subtle}`,
  overflowY: "auto",
  minWidth: 0,
});
export const heading = style({
  display: "grid",
  gap: 12,
  paddingBottom: 16,
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
});
export const eyebrow = style({
  color: vars.color.text.muted,
});
export const title = style({
  margin: 0,
  overflowWrap: "anywhere",
});

export const closeRow = style({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
});

export const dockedPanel = style([panel, { width: 400, height: "100%", boxSizing: "border-box" }]);

export const conversationRoot = style({
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
});
export const conversationPanel = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
  width: "100%",
  paddingBlock: "env(safe-area-inset-top) env(safe-area-inset-bottom)",
  background: vars.color.surface.canvas,
  selectors: {
    '&[data-wide="true"]': {
      width: 400,
      borderInlineStart: `1px dashed ${vars.color.line.subtle}`,
    },
  },
});
export const conversationHeading = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 24px",
});
export const conversationContent = style({ flex: 1, minHeight: 0 });

globalStyle(`${conversationHeading} > div`, { flex: 1, minWidth: 0 });

export const conversationPrimary = style({ flex: 1, minHeight: 0, minWidth: 0 });
globalStyle(`${conversationRoot}[data-wide="true"]`, { flexDirection: "row" });
