import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";
const mobile = "(max-width: 600px)";
export const list = style({ containerType: "inline-size" });
export const row = style({
  display: "grid",
  gridTemplateColumns: "[indicator] 7px [primary] minmax(0, 1fr) [metadata] auto [actions] auto",
  alignItems: "center",
  gap: "4px 12px",
  padding: "12px 6px",
  margin: 0,
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
  borderRadius: 8,
  selectors: {
    '&[data-density="compact"]': { paddingBlock: 9 },
    '&[data-density="compact"][data-interactive="true"]': { minHeight: 44 },
    '&[data-icon="true"]': {
      gridTemplateColumns:
        "[indicator] max-content [primary] minmax(0,1fr) [metadata] auto [actions] auto",
    },
    '&[data-selectable="true"]': {
      gridTemplateColumns:
        "[selection] auto [indicator] 7px [primary] minmax(0, 1fr) [metadata] auto [actions] auto",
    },
    '&[data-timestamp="true"]': {
      gridTemplateColumns:
        "[indicator] 7px [timestamp] 44px [primary] minmax(0,1fr) [metadata] auto [actions] auto",
    },
    '&[data-timestamp="true"][data-selectable="true"]': {
      gridTemplateColumns:
        "[selection] auto [indicator] 7px [timestamp] 44px [primary] minmax(0,1fr) [metadata] auto [actions] auto",
    },
    '&[data-active="true"]': { background: vars.color.action.selected },
    '&[data-selected="true"]': { background: vars.color.action.selected },
    '&[data-interactive="true"]:hover:not([data-selected="true"])': {
      background: vars.color.action.hover,
    },
  },
  "@container": {
    [mobile]: {
      gridTemplateColumns: "[indicator] 7px [primary] minmax(0, 1fr) [actions] auto",
      columnGap: 10,
      selectors: {
        '&[data-icon="true"]': {
          gridTemplateColumns: "[indicator] max-content [primary] minmax(0,1fr) [actions] auto",
        },
        '&[data-icon="true"][data-metadata="inline"]': {
          gridTemplateColumns:
            "[indicator] max-content [primary] minmax(0,1fr) [metadata] auto [actions] auto",
        },
        '&[data-metadata="inline"]': {
          gridTemplateColumns:
            "[indicator] 7px [primary] minmax(0,1fr) [metadata] auto [actions] auto",
        },
        '&[data-timestamp="true"]': {
          gridTemplateColumns: "[indicator] 7px [primary] minmax(0,1fr) [actions] auto",
        },
        '&[data-timestamp="true"][data-selectable="true"]': {
          gridTemplateColumns:
            "[selection] auto [indicator] 7px [primary] minmax(0,1fr) [actions] auto",
        },
        '&[data-selectable="true"]': {
          gridTemplateColumns:
            "[selection] auto [indicator] 7px [primary] minmax(0, 1fr) [actions] auto",
        },
      },
    },
  },
});
export const indicator = style({ gridColumn: "indicator", display: "flex", alignItems: "center" });
export const primary = style({
  gridColumn: "primary",
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
  padding: 0,
  border: "none",
  background: "none",
  color: vars.color.text.primary,
  textAlign: "left",
  textDecoration: "none",
  cursor: "pointer",
  selectors: {
    "&[data-static]": { cursor: "default" },
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
export const title = style({
  selectors: {
    '&[data-kind="code"]': {},
    [`${row}[data-density="compact"] &`]: {},
  },
  maxWidth: "100%",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  "@container": { [mobile]: { whiteSpace: "normal", overflowWrap: "anywhere" } },
});
export const supporting = style({
  selectors: {
    [`${row}[data-identity="true"] &`]: { marginInlineStart: 34 },
    '&[data-tone="danger"]': { color: vars.color.status.danger.text },
    '&[data-tone="pending"]': { color: vars.color.status.pending.text },
    '&[data-tone="success"]': { color: vars.color.status.success.text },
  },
  color: vars.color.text.muted,
});
export const metadata = style({
  gridColumn: "metadata",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "3px 14px",
  color: vars.color.text.muted,
  "@container": {
    [mobile]: {
      gridColumn: "primary",
      gridRow: 2,
      justifyContent: "flex-start",
      selectors: {
        [`${row}[data-metadata="inline"] &`]: {
          gridColumn: "metadata",
          gridRow: 1,
          justifyContent: "flex-end",
        },
      },
    },
  },
});
export const actions = style({
  gridColumn: "actions",
  display: "flex",
  alignItems: "center",
  gap: 8,
  "@container": { [mobile]: { gridColumn: "actions", gridRow: "1 / span 2" } },
});
export const notice = style({
  gridColumn: "primary / -1",
  minWidth: 0,
});
export const selection = style({
  gridColumn: "selection",
  gridRow: 1,
  display: "grid",
  placeItems: "center",
  minHeight: 44,
  minWidth: 24,
  cursor: "pointer",
  "@container": { [mobile]: { gridRow: "1 / span 2" } },
});
export const checkbox = style({
  appearance: "none",
  width: 20,
  height: 20,
  margin: 0,
  border: `1.4px dashed ${vars.color.line.control}`,
  borderRadius: 5,
  color: vars.color.action.onFill,
  display: "grid",
  placeContent: "center",
  cursor: "inherit",
  selectors: {
    "&:checked": { background: vars.color.action.fill, borderStyle: "solid" },
    "&:checked::after": { content: '"✓"', fontSize: 13 },
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
    "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
  },
});

export const metadataItem = style({ display: "inline-flex", alignItems: "center", gap: 7 });

export const timestamp = style({
  gridColumn: "timestamp",
  color: vars.color.text.muted,
  "@container": { [mobile]: { display: "none" } },
});
export const mobileTimestamp = style({
  display: "none",
  "@container": { [mobile]: { display: "inline" } },
});

export const progress = style({
  display: "inline-flex",
  alignItems: "center",
  "@container": { [mobile]: { order: 1 } },
});

export const titleLine = style({ display: "flex", alignItems: "center", gap: 8, minWidth: 0 });
