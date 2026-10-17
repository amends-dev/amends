import { globalStyle, keyframes, style } from "@vanilla-extract/css"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, monoFamily, typeScale } from "../../foundations/typography/tokens.ts"

// Blocks stack 8px apart and inherit the surrounding type, such as a message's body text.
export const blocks = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minWidth: 0,
  overflowWrap: "anywhere"
})

export const inline = style({ overflowWrap: "anywhere" })

export const paragraph = style({ margin: 0 })

// Headings stay at the text's size; weight alone sets them apart in a conversation.
export const heading = style({ margin: 0, fontWeight: fontWeight.semibold })

export const quote = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  margin: 0,
  paddingInlineStart: "0.75rem",
  borderInlineStart: `2px solid ${vars.color.border.default}`,
  color: vars.color.text.secondary
})

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  margin: 0,
  paddingInlineStart: "1.5rem"
})

export const item = style({
  selectors: { "&::marker": { color: vars.color.text.secondary } }
})

// A task item's box sits where the bullet would, beside the item's text.
export const task = style({
  listStyle: "none",
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
  marginInlineStart: "-1.5rem"
})

// A drawn box, read-only: the text records whether the task is done.
export const taskBox = style({
  flex: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  width: "0.875rem",
  height: "0.875rem",
  // Centred on the item's first line.
  marginBlockStart: "calc((1lh - 0.875rem) / 2)",
  border: `1px solid ${vars.color.border.selected}`,
  backgroundColor: vars.color.surface.field,
  selectors: {
    "&[aria-checked=true]": {
      borderColor: vars.color.text.primary,
      backgroundColor: vars.color.text.primary,
      color: vars.color.text.onPrimary
    }
  }
})

export const taskCheck = style({ width: "0.75rem", height: "0.75rem" })

export const itemBody = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  minWidth: 0
})

export const code = style({
  paddingInline: "0.25rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.subtle,
  fontFamily: monoFamily,
  fontSize: "0.875em"
})

export const pre = style({
  ...typeScale.control,
  margin: 0,
  padding: "0.5rem 0.75rem",
  overflowX: "auto",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.subtle,
  fontFamily: monoFamily,
  whiteSpace: "pre",
  overflowWrap: "normal",
  tabSize: 2
})

export const link = style({
  color: "inherit",
  textDecoration: "underline",
  textDecorationColor: vars.color.border.strong,
  textUnderlineOffset: "0.1875rem",
  selectors: {
    "&:hover": { textDecorationColor: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" }
  }
})

export const mention = style({
  paddingInline: "0.1875rem",
  backgroundColor: vars.color.surface.mention,
  fontWeight: fontWeight.semibold
})

export const rule = style({
  width: "100%",
  margin: 0,
  border: "none",
  borderBlockStart: `1px solid ${vars.color.border.divider}`
})

// Wide tables scroll sideways inside the message rather than widening it.
export const tableScroll = style({ maxWidth: "100%", overflowX: "auto" })

export const table = style({
  ...typeScale.control,
  borderCollapse: "collapse",
  overflowWrap: "normal"
})

export const cell = style({
  padding: "0.25rem 0.5rem",
  border: `1px solid ${vars.color.border.default}`,
  textAlign: "start",
  verticalAlign: "top",
  selectors: {
    "&[data-align=center]": { textAlign: "center" },
    "&[data-align=right]": { textAlign: "end" }
  }
})

export const headerCell = style([cell, { backgroundColor: vars.color.surface.subtle, fontWeight: fontWeight.semibold }])

const blink = keyframes({ "0%, 49%": { opacity: 1 }, "50%, 100%": { opacity: 0 } })

// Where text is still arriving, blinking; still when the reader prefers less motion. It follows
// the last block's words, or the last item of a closing list.
const caret = {
  content: '""',
  display: "inline-block",
  width: "0.5em",
  height: "1em",
  marginInlineStart: "0.125rem",
  verticalAlign: "text-bottom",
  backgroundColor: vars.color.text.secondary,
  animation: `${blink} 1s steps(1) infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } }
} as const
globalStyle(`${blocks}[data-caret] > :last-child:not(ul, ol, div)::after`, caret)
globalStyle(`${blocks}[data-caret] > :is(ul, ol):last-child > li:last-child > :last-child::after`, caret)
