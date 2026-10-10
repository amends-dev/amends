import { style } from "@vanilla-extract/css";
import { media } from "../foundations/layout/tokens.ts";
import { vars } from "../foundations/theme/vars.css.ts";
import { monoFamily, typeScale } from "../foundations/typography/tokens.ts";
import { stitchAcross, stitchDown, stitchLine } from "./stitch.css.ts";

export const diagram = style({
  display: "grid",
  gap: "1.75rem",
  margin: 0,
  padding: "1.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.canvas,
});

const box = {
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "2.5rem",
  boxSizing: "border-box",
  paddingInline: "0.75rem",
  fontFamily: monoFamily,
  textAlign: "center",
  overflowWrap: "anywhere",
} as const;

export const program = style({
  ...box,
  justifySelf: "center",
  minWidth: "60%",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.primary,
});

export const contracts = style({
  position: "relative",
  display: "grid",
  gap: "1.5rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
  "@media": { [media.tablet]: { gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" } },
});

// The stitch from the program down into the contracts.
export const seam = style([stitchLine, { marginBlockStart: "-0.875rem", marginInline: "25%" }]);

export const contract = style({ display: "grid", gap: "0.75rem", alignContent: "start" });

export const contractName = style({
  ...box,
  backgroundColor: vars.color.action.primary,
  color: vars.color.text.onPrimary,
});

export const adapters = style({
  position: "relative",
  display: "grid",
  gap: "0.75rem",
  margin: 0,
  paddingInlineStart: "2rem",
  listStyle: "none",
  // The stitch from the contract down past its adapters.
  "::before": {
    content: "",
    position: "absolute",
    insetBlock: "-0.75rem 1.25rem",
    insetInlineStart: "0.75rem",
    width: "1px",
    backgroundImage: stitchDown,
  },
});

export const adapter = style({
  ...box,
  position: "relative",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.primary,
  "::before": {
    content: "",
    position: "absolute",
    insetInlineStart: "-1.25rem",
    top: "50%",
    width: "1.25rem",
    height: "1px",
    backgroundImage: stitchAcross,
  },
});

export const legend = style({
  ...typeScale.hint,
  display: "flex",
  gap: "1.25rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
  color: vars.color.text.secondary,
});

export const key = style({ display: "inline-flex", alignItems: "center", gap: "0.5rem" });

export const swatch = style({ width: "0.625rem", height: "0.625rem", boxSizing: "border-box" });

export const swatchContract = style({ backgroundColor: vars.color.action.primary });

export const swatchAdapter = style({
  border: `1px solid ${vars.color.text.muted}`,
  backgroundColor: vars.color.surface.panel,
});
