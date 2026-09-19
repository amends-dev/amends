import { style } from "@vanilla-extract/css";
import { vars } from "@amends/ui/vars";
import { breakpoint, stroke } from "@amends/ui/tokens";

const compact = `(max-width: ${breakpoint.navigation - 1}px)`;

export const stack = style({ display: "flex", flexDirection: "column", gap: vars.space[4] });
export const fullWidth = style({ width: "100%" });
export const divider = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[3],
  selectors: {
    "&::before, &::after": {
      content: "",
      flex: 1,
      borderTop: `${stroke.hairline}px dashed ${vars.color.line.subtle}`,
    },
  },
});
export const options = style({ display: "flex", flexDirection: "column", gap: vars.space[2] });
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: `${vars.space[2]} ${vars.space[4]}`,
});
export const spread = style({ flex: 1, minWidth: 140 });
export const rule = style({ borderTop: `${stroke.hairline}px dashed ${vars.color.line.subtle}` });
export const hints = style({ "@media": { [compact]: { display: "none" } } });
