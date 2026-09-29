import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";

// The surface behind the mark: its cut-out and the bar through a blocked mark. A parent whose
// surface differs, such as a selected row or a notice, sets the variable.
export const knockoutVar = "--amends-status-knockout";
const knockout = `var(${knockoutVar}, ${vars.color.surface.panel})`;

export const sizes = [7, 8, 9, 10, 11] as const;
export type StatusMarkSize = (typeof sizes)[number];

const rem = (px: number) => `${px / 16}rem`;

export const mark = style({
  position: "relative",
  display: "inline-block",
  flex: "none",
  boxSizing: "content-box",
});

export const size = styleVariants(
  Object.fromEntries(sizes.map((px) => [px, px])) as Record<StatusMarkSize, number>,
  (px) => ({ width: rem(px), height: rem(px) }),
);

// On an avatar or tile: a 2px square notch in the surface behind, like the logo's patch.
export const cutout = style({ padding: "0.125rem", backgroundColor: knockout });

export const shape = style({
  position: "relative",
  display: "block",
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  selectors: {
    [`${mark}[data-mark=available] &`]: { backgroundColor: vars.color.status.success.mark },
    [`${mark}[data-mark=offline] &`]: {
      border: `1.5px solid ${vars.color.text.muted}`,
      backgroundColor: knockout,
    },
    // Slightly wider than tall, like the warning it stands for.
    [`${mark}[data-mark=attention] &`]: {
      backgroundColor: vars.color.status.caution.mark,
      clipPath: "polygon(50% 4%, 100% 96%, 0 96%)",
      transform: "scaleX(1.12)",
    },
    [`${mark}[data-mark=blocked] &`]: { backgroundColor: vars.color.status.danger.mark },
    [`${mark}[data-mark=blocked] &::after`]: {
      content: "",
      position: "absolute",
      insetInline: "20%",
      top: "50%",
      height: "1.5px",
      marginBlockStart: "-0.75px",
      backgroundColor: knockout,
    },
  },
});
