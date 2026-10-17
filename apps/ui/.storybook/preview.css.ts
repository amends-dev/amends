import { globalStyle, style } from "@vanilla-extract/css"

globalStyle("html, body, #storybook-root", { margin: 0, minHeight: "100%" })

/** Each story fills the preview with its mode's canvas. */
export const frame = style({ minHeight: "100vh", boxSizing: "border-box", padding: "1.5rem" })

export const fullscreen = style({ height: "100vh", boxSizing: "border-box" })

export const pair = style({ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" })
