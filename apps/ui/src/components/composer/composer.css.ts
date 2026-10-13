import { globalStyle, style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"

// Reference minimum heights: 136px on desktop, 112px on tablets, and 92px on phones.
export const composer = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  minHeight: "8.5rem",
  padding: "1rem 1rem 0.8125rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  selectors: { "&:focus-within": { borderColor: vars.color.border.strong } },
  "@media": {
    [media.touch]: { minHeight: "7rem", padding: "0.75rem 1rem 0.25rem" },
    [media.mobile]: { minHeight: "5.75rem", padding: "0.625rem 0.75rem 0.25rem" }
  }
})

// The editor's text, formatted as messages show it, scrolling past 40% of the viewport.
export const input = style({
  ...typeScale.item,
  position: "relative",
  display: "block",
  width: "100%",
  minHeight: "1.3125rem",
  maxHeight: "40vh",
  overflowY: "auto",
  margin: 0,
  padding: 0,
  outline: "none",
  color: vars.color.text.primary,
  overflowWrap: "anywhere",
  // What ProseMirror needs to place the caret: kept spaces and no ligatures.
  whiteSpace: "break-spaces",
  fontVariantLigatures: "none",
  fontFeatureSettings: '"liga" 0',
  "@media": {
    [media.touch]: typeScale.body,
    [media.mobile]: typeScale.bodyTouch
  }
})

export const host = style({ minWidth: 0 })

// Blocks sit 8px apart, as in a message.
globalStyle(`${input} > * + *`, { marginBlockStart: "0.5rem" })
globalStyle(`${input} pre`, { whiteSpace: "pre-wrap" })
globalStyle(`${input} [contenteditable="false"]`, { whiteSpace: "normal" })
globalStyle(`${input} img.ProseMirror-separator`, {
  display: "inline",
  width: 0,
  height: 0,
  margin: 0,
  border: "none"
})
globalStyle(`${input}.ProseMirror-hideselection *::selection`, { background: "transparent" })
globalStyle(`${input} p.is-editor-empty:first-child::before`, {
  content: "attr(data-placeholder)",
  float: "left",
  height: 0,
  color: vars.color.text.muted,
  pointerEvents: "none"
})

// Formatting sits above the text, its icons lined up with the text's edge like the toolbar's.
export const formatting = style({
  display: "flex",
  alignItems: "center",
  gap: "0.125rem",
  marginInline: "-0.25rem",
  marginBlockEnd: "0.5rem",
  overflowX: "auto",
  scrollbarWidth: "none",
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { [media.touch]: { gap: 0, marginInline: "-0.5rem", marginBlockEnd: "0.25rem" } }
})

// A pressed format reads as the selected row does; a proposal, since the mocks draw none.
export const format = style({
  flex: "none",
  selectors: {
    "&[aria-pressed=true]": {
      backgroundColor: vars.color.surface.selected,
      color: vars.color.text.primary
    },
    "&:disabled": { color: vars.color.text.disabled, cursor: "default" }
  }
})

export const separator = style({
  flex: "none",
  width: "1px",
  height: "1rem",
  marginInline: "0.25rem",
  backgroundColor: vars.color.border.divider
})

// Where a link leads, floating above the text like the suggestions.
export const linkForm = style({
  position: "absolute",
  insetInline: "-1px",
  bottom: "calc(100% + 0.25rem)",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover
})

export const linkAddress = style({ flex: 1, minWidth: 0 })

// Icon buttons line their icons up with the text above; send sits at the far end.
export const toolbar = style({
  display: "flex",
  alignItems: "center",
  gap: "0.125rem",
  marginBlockStart: "auto",
  paddingBlockStart: "0.5rem",
  marginInline: "-0.4375rem",
  "@media": { [media.touch]: { gap: 0, marginInline: "-0.5rem", paddingBlockStart: "0.25rem" } }
})

export const send = style({ marginInlineStart: "auto" })

// Suggestions open above the composer, since it sits at the bottom of its pane.
export const suggestions = style({
  position: "absolute",
  insetInline: "-1px",
  bottom: "calc(100% + 0.25rem)",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  maxHeight: "16rem",
  margin: 0,
  padding: "0.25rem",
  overflowY: "auto",
  listStyle: "none",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover
})

export const suggestion = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: "2rem",
  paddingInline: "0.5rem",
  color: vars.color.text.primary,
  cursor: "pointer",
  selectors: {
    "&:hover, &[aria-selected=true]": { backgroundColor: vars.color.surface.subtle }
  }
})

export const suggestionName = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: { "&[data-agent]": { color: vars.color.text.agent } }
})

export const commandName = style({
  flex: "none",
  fontWeight: fontWeight.medium
})

export const commandDescription = style({
  minWidth: 0,
  overflow: "hidden",
  color: vars.color.text.secondary,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
})

export const error = style({
  ...typeScale.hint,
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  margin: 0,
  paddingBlockStart: "0.375rem",
  color: vars.color.status.danger.text
})

export const errorIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" })
