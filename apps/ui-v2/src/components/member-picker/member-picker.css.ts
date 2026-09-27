import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const picker = style({ position: "relative", flex: 1, minWidth: 0 });

// The field: chosen people as chips, then the search text. Open or focused, its edge darkens.
export const control = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "0.375rem",
  boxSizing: "border-box",
  minHeight: "2.5rem",
  padding: "0.3125rem 0.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  cursor: "text",
  selectors: {
    "&:focus-within, &[data-open]": { borderColor: vars.color.border.strong },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const searchIcon = style({
  flex: "none",
  width: "1rem",
  height: "1rem",
  marginInline: "0.25rem 0",
  color: vars.color.text.muted,
});

export const input = style({
  ...typeScale.control,
  flex: "1 1 7rem",
  minWidth: "7rem",
  height: "1.75rem",
  margin: 0,
  padding: "0 0.25rem",
  border: "none",
  outline: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  selectors: { "&::placeholder": { color: vars.color.text.muted, opacity: 1 } },
  "@media": { [media.mobile]: typeScale.bodyTouch },
});

export const toggle = style({
  display: "grid",
  placeItems: "center",
  flex: "none",
  width: "1.75rem",
  height: "1.75rem",
  marginInlineStart: "auto",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
});

export const toggleIcon = style({ width: "0.875rem", height: "0.875rem" });

export const chip = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  height: "1.75rem",
  paddingInlineStart: "0.25rem",
  backgroundColor: vars.color.surface.selected,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const chipRemove = style({
  display: "grid",
  placeItems: "center",
  width: "1.5rem",
  height: "1.5rem",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
});

export const chipRemoveIcon = style({ width: "0.75rem", height: "0.75rem" });

export const popup = style({
  boxSizing: "border-box",
  selectors: {
    "&[data-presentation=dropdown]": {
      position: "absolute",
      insetInline: 0,
      top: "calc(100% + 0.375rem)",
      zIndex: 10,
      border: `1px solid ${vars.color.border.default}`,
      backgroundColor: vars.color.surface.popover,
      boxShadow: vars.shadow.popover,
    },
    "&[data-presentation=list]": { marginBlockStart: "1.25rem" },
  },
});

export const popupHeader = style({
  ...typeScale.hint,
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.625rem 0.75rem 0.375rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: {
    [`${popup}[data-presentation=list] &`]: {
      ...typeScale.meta,
      paddingInline: 0,
      textTransform: "uppercase",
    },
  },
});

export const available = style({ color: vars.color.text.muted, fontWeight: fontWeight.regular });

export const listbox = style({
  margin: 0,
  padding: "0 0.5rem",
  listStyle: "none",
  maxHeight: "16rem",
  overflowY: "auto",
  selectors: { [`${popup}[data-presentation=list] &`]: { padding: 0, maxHeight: "none" } },
});

export const option = style({
  display: "grid",
  gridTemplateColumns: "1.75rem minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "0.75rem",
  minHeight: "3rem",
  paddingInline: "0.75rem",
  cursor: "pointer",
  selectors: {
    "&[data-active]": { backgroundColor: vars.color.surface.subtle },
    [`${popup}[data-presentation=list] &`]: { minHeight: "3.5rem", paddingInline: 0 },
  },
});

export const optionText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const optionName = style({
  ...typeScale.control,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const optionKind = style({ ...typeScale.hint, color: vars.color.text.secondary });

export const plus = style({ width: "1rem", height: "1rem", color: vars.color.text.secondary });

export const popupFooter = style({
  ...typeScale.hint,
  margin: 0,
  padding: "0.375rem 0.75rem 0.5rem",
  color: vars.color.text.secondary,
  boxShadow: `inset 0 1px 0 ${vars.color.border.divider}`,
  selectors: {
    [`${popup}[data-presentation=list] &`]: { paddingInline: 0, boxShadow: "none" },
  },
});
