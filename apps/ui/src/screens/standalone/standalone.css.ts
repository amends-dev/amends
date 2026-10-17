import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { typeScale } from "../../foundations/typography/tokens.ts"

export const account = style({
  ...typeScale.hint,
  lineHeight: "1.25rem",
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  color: vars.color.text.secondary
})

export const identity = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "@media": { [media.mobile]: { display: "none" } }
})

// A status screen's note sits in the middle of the card.
export const status = style({ flex: 1, display: "flex", flexDirection: "column" })
