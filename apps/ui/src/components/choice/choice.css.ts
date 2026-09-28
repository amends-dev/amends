import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
});

export const options = style({
  display: "flex",
  gap: "0.5rem",
  selectors: { "&[data-variant=card]": { flexDirection: "column", gap: "0.625rem" } },
  "@media": {
    [media.mobile]: {
      selectors: {
        "&:not([data-variant=card])": { display: "grid", gridTemplateColumns: "1fr 1fr" },
      },
    },
  },
});

// A boxed option: the chosen one is filled, outlined, and checked.
export const option = style({
  ...typeScale.control,
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  width: "9rem",
  minHeight: "2.5rem",
  paddingInline: "0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  cursor: "pointer",
  selectors: {
    "&:hover": { borderColor: vars.color.border.strong },
    "&:has(input:checked)": {
      backgroundColor: vars.color.surface.subtle,
      borderColor: vars.color.border.selected,
      color: vars.color.text.primary,
    },
    "&:has(input:focus-visible)": {
      outline: `2px solid ${vars.color.text.primary}`,
      outlineOffset: "2px",
    },
    "&:has(input:disabled)": { color: vars.color.text.disabled, cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" }, [media.mobile]: { width: "auto" } },
});

// A card: a radio, then the label over its description, 84px tall across the whole width.
globalStyle(`${option}[data-variant=card]`, {
  display: "grid",
  gridTemplateColumns: "1rem minmax(0, 1fr)",
  alignItems: "start",
  columnGap: "0.875rem",
  width: "100%",
  minHeight: "5.25rem",
  padding: "0.875rem 1rem",
  fontWeight: fontWeight.regular,
});

globalStyle(`${option}[data-variant=card]:has(input:checked)`, {
  backgroundColor: vars.color.surface.active,
});

export const radio = style({
  position: "relative",
  boxSizing: "border-box",
  width: "1rem",
  height: "1rem",
  marginBlockStart: "0.3125rem",
  border: `1px solid ${vars.color.border.selected}`,
  borderRadius: "50%",
  backgroundColor: vars.color.surface.field,
  selectors: {
    [`${option}:has(input:checked) &`]: { borderColor: vars.color.text.primary },
    [`${option}:has(input:checked) &::after`]: {
      content: '""',
      position: "absolute",
      inset: "3px",
      borderRadius: "50%",
      backgroundColor: vars.color.text.primary,
    },
  },
});

export const cardText = style({ display: "flex", flexDirection: "column", gap: "0.4375rem" });

export const cardLabel = style({
  ...typeScale.item,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const description = style({
  ...typeScale.control,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.regular,
});

// The native radio stays in place for forms and keyboards but is not drawn.
export const input = style({
  position: "absolute",
  inset: 0,
  margin: 0,
  opacity: 0,
  cursor: "inherit",
});

export const label = style({ flex: 1 });

export const check = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  visibility: "hidden",
  selectors: { [`${option}:has(input:checked) &`]: { visibility: "visible" } },
});
