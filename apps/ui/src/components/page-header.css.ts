import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint } from "../tokens/index.ts";

export const header = style({
  display: "grid",
  gap: vars.space[3],
  minWidth: 0,
  padding: "24px 30px 14px",
  "@media": {
    [`(max-width: ${breakpoint.navigation - 1}px)`]: {
      padding: "max(16px, env(safe-area-inset-top)) 18px 12px",
    },
  },
});
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  minWidth: 0,
});
export const navigation = style({
  display: "flex",
  flexShrink: 0,
  "@media": { [`(min-width: ${breakpoint.navigation}px)`]: { display: "none" } },
});
export const ancestry = style([row]);
export const breadcrumbs = style({ flex: "1 1 0", minWidth: 0 });
export const title = style({
  flex: "1 1 0",
  minWidth: 0,
  margin: 0,
  overflowWrap: "anywhere",
  selectors: {
    '&[data-kind="code"]': {
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
  },
});
export const actions = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexShrink: 0,
  gap: vars.space[2],
});
export const summary = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space[2],
  color: vars.color.text.muted,
  overflowWrap: "anywhere",
  minWidth: 0,
});
