import { globalStyle } from "@vanilla-extract/css"

// Loaded only by app entry points, never by the component workshop.
globalStyle("html, body, #root", { minHeight: "100%", margin: 0 })
