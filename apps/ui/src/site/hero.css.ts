import { style, styleVariants } from "@vanilla-extract/css";
import { media } from "../foundations/layout/tokens.ts";
import { vars } from "../foundations/theme/vars.css.ts";
import { fontWeight, monoFamily, typeScale } from "../foundations/typography/tokens.ts";
import { displayFamily, siteType, siteTypeMobile } from "./tokens.ts";

export const hero = style({
  backgroundColor: vars.color.surface.panel,
  paddingBlock: "4rem",
  "@media": { [media.tablet]: { paddingBlock: "6.5rem 6rem" } },
});

export const layout = styleVariants({
  center: { display: "grid", gap: "4rem", justifyItems: "center", textAlign: "center" },
  split: {
    display: "grid",
    gap: "3rem",
    alignItems: "start",
    "@media": {
      [media.desktop]: { gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: "5rem" },
    },
  },
});

export const text = style({ display: "grid", gap: "1.5rem", justifyItems: "inherit", minWidth: 0 });

export const badge = style({
  ...typeScale.meta,
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  paddingInline: "0.875rem",
  minHeight: "1.875rem",
  boxSizing: "border-box",
  border: `1px solid ${vars.color.border.default}`,
  fontFamily: monoFamily,
  letterSpacing: "0.02em",
  color: vars.color.text.secondary,
});

const display = {
  margin: 0,
  fontFamily: displayFamily,
  fontWeight: 400,
  letterSpacing: "-0.015em",
  color: vars.color.text.primary,
  textWrap: "balance",
} as const;

export const title = styleVariants({
  // Narrow enough that the home page's headline breaks into two even lines.
  hero: {
    ...display,
    ...siteTypeMobile.hero,
    maxWidth: "12em",
    "@media": { [media.tablet]: siteType.hero },
  },
  page: { ...display, ...siteTypeMobile.page, "@media": { [media.tablet]: siteType.page } },
});

export const lead = style({
  ...siteTypeMobile.lead,
  maxWidth: "45rem",
  margin: 0,
  color: vars.color.text.secondary,
  textWrap: "pretty",
  "@media": { [media.tablet]: siteType.lead },
});

export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  paddingBlockStart: "0.5rem",
});

export const centered = style({ justifyContent: "center" });

// Looks like a secondary button, but leads nowhere yet.
export const soon = style({
  ...typeScale.item,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: "2.75rem",
  boxSizing: "border-box",
  paddingInline: "1.25rem 0.625rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const soonBadge = style({ fontFamily: monoFamily, fontWeight: fontWeight.regular });

export const preview = style({ width: "100%" });

export const aside = style({ minWidth: 0 });
