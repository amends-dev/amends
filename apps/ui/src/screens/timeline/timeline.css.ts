import { style } from "@vanilla-extract/css"
import { media } from "../../foundations/layout/tokens.ts"
import { vars } from "../../foundations/theme/vars.css.ts"
import { typeScale } from "../../foundations/typography/tokens.ts"

// Conversations read from the bottom: short timelines rest against the composer.
export const timeline = style({
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  gap: "1.5rem",
  minHeight: "100%",
  selectors: { "&[data-anchor=top]": { justifyContent: "flex-start", minHeight: 0 } },
  "@media": { [media.mobile]: { gap: "1.375rem" } }
})

export const event = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  margin: 0,
  color: vars.color.text.secondary
})

export const eventIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" })

export const eventTime = style({ ...typeScale.meta, color: vars.color.text.muted })

/** In place of a deleted message's text. */
export const deleted = style({ color: vars.color.text.muted, fontStyle: "italic" })

/** After an edited message's text. */
export const edited = style({ ...typeScale.meta, color: vars.color.text.muted })
