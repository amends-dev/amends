import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts"
import { knockoutVar } from "../status-mark/status-mark.css.ts"

// The Lunacy "Status v01" notices: the tone's fill and outline, its mark, the words in its text
// color, and at most one action at the end. Phones put the action under the words.
export const notice = style({
  display: "grid",
  gridTemplateColumns: "0.625rem minmax(0, 1fr) auto",
  alignItems: "start",
  columnGap: "0.75rem",
  padding: "0.75rem 0.75rem 0.75rem 1rem",
  border: `1px solid ${vars.color.status.caution.border}`,
  backgroundColor: vars.color.status.caution.surface,
  vars: { [knockoutVar]: vars.color.status.caution.surface },
  selectors: {
    "&[data-tone=danger]": {
      borderColor: vars.color.status.danger.border,
      backgroundColor: vars.color.status.danger.surface,
      vars: { [knockoutVar]: vars.color.status.danger.surface }
    }
  },
  "@media": {
    [media.mobile]: { gridTemplateColumns: "0.625rem minmax(0, 1fr)", rowGap: "0.75rem" }
  }
})

// On the title's first line; beside an action, everything centers on the button instead.
export const mark = style({
  marginBlockStart: "0.3125rem",
  selectors: { [`${notice}[data-action] &`]: { alignSelf: "center", marginBlockStart: 0 } }
})

export const text = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  selectors: { [`${notice}[data-action] &`]: { alignSelf: "center" } }
})

export const title = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.status.caution.text,
  fontWeight: fontWeight.medium,
  selectors: { [`${notice}[data-tone=danger] &`]: { color: vars.color.status.danger.text } }
})

export const body = style({ ...typeScale.control, margin: 0, color: vars.color.text.secondary })

export const action = style({
  alignSelf: "center",
  "@media": { [media.mobile]: { gridColumn: 2, justifySelf: "start" } }
})
