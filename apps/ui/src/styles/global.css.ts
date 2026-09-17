import { globalStyle } from "@vanilla-extract/css";
import { focus, typography } from "../tokens/index.ts";
import { vars } from "./contract.css.ts";

globalStyle(":where(*), :where(*)::before, :where(*)::after", { boxSizing: "border-box" });
globalStyle("body", {
  margin: 0,
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
  fontFamily: vars.font.sans,
  fontSize: `${typography.body.fontSize / 16}rem`,
  lineHeight: typography.body.lineHeight,
  WebkitFontSmoothing: "antialiased",
});
globalStyle(":where(h1, h2, h3, h4, p, figure, blockquote)", { margin: 0 });
globalStyle(":where(p)", { textWrap: "pretty" });
globalStyle(":where(button, input, textarea, select)", { font: "inherit", color: "inherit" });
globalStyle(":where(button)", { cursor: "pointer" });
globalStyle(":where(button:disabled)", { cursor: "not-allowed" });
globalStyle(":where(a)", {
  color: vars.color.brand.text,
  textDecorationLine: "underline",
  textDecorationStyle: "dashed",
  textUnderlineOffset: "0.2em",
});
globalStyle(":where(a:hover)", { color: vars.color.brand.textHover });
globalStyle(":where(:focus-visible)", {
  outline: `${focus.width}px solid ${vars.color.focus.ring}`,
  outlineOffset: focus.offset,
});
globalStyle("::selection", {
  background: vars.color.selection.fill,
  color: vars.color.selection.text,
});
globalStyle(':where([data-theme], [data-surface="inverse"])', {
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
});
globalStyle(":where(*), :where(*)::before, :where(*)::after", {
  "@media": {
    "(prefers-reduced-motion: reduce)": {
      animation: "none !important",
      transition: "none !important",
      scrollBehavior: "auto",
    },
  },
});
