import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const form = style({ display: "flex", flexDirection: "column", gap: "1.75rem" });

export const membership = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.5rem",
  "@media": { [media.mobile]: { flexDirection: "column", alignItems: "flex-start", gap: "1rem" } },
});

export const membershipText = style({ display: "flex", flexDirection: "column", gap: "0.5rem" });

export const heading = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const note = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary });

export const members = style({ display: "flex", flexDirection: "column", gap: "1.25rem" });

// The picker and its Add button share a row.
export const addRow = style({ display: "flex", alignItems: "flex-start", gap: "0.75rem" });

export const addButton = style({ minWidth: "5.5rem", marginBlockStart: "0.125rem" });

export const count = style({
  display: "flex",
  alignItems: "center",
  gap: "1.25rem",
  marginBlockStart: "0.25rem",
});

export const countLabel = style({
  ...typeScale.control,
  lineHeight: "1.125rem",
  flex: "none",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
});

export const countStitch = style({ flex: 1 });

export const list = style({ margin: "-0.25rem 0 0", padding: 0, listStyle: "none" });

export const member = style({
  display: "grid",
  gridTemplateColumns: "1.75rem minmax(0, 1fr) auto",
  alignItems: "center",
  columnGap: "0.75rem",
  minHeight: "2.5rem",
  "@media": {
    [media.mobile]: { gridTemplateColumns: "2rem minmax(0, 1fr) auto", minHeight: "3.5rem" },
  },
});

export const memberText = style({
  display: "flex",
  alignItems: "baseline",
  gap: "0.5rem",
  minWidth: 0,
  "@media": { [media.mobile]: { flexDirection: "column", gap: 0 } },
});

export const memberName = style({
  ...typeScale.control,
  lineHeight: "1.3125rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  "@media": { [media.mobile]: typeScale.item },
});

export const memberKind = style({ ...typeScale.hint, color: vars.color.text.secondary });

export const avatar = style({
  "@media": { [media.mobile]: { width: "2rem", height: "2rem", fontSize: "0.72rem" } },
});
