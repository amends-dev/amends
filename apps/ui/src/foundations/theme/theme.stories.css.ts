import { globalStyle, style } from "@vanilla-extract/css"
import { space } from "../space/tokens.ts"
import { vars } from "./vars.css.ts"

export const preview = style({ height: "100vh", display: "flex", flexDirection: "column" })
export const toolbar = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: space[3],
  padding: space[3],
  borderBottom: `1px solid ${vars.color.border.divider}`
})
export const workspace = style({ flex: 1, minHeight: 0 })

// The workshop reserves room for its palette controls above the full-page shell.
globalStyle(`${workspace} > div`, { height: "100%" })
