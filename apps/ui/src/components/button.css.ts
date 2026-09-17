import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { vars } from "../styles/contract.css.ts";
import { type } from "../styles/type.css.ts";
import { breakpoint, focus, stroke } from "../tokens/index.ts";

export const button = recipe({
  base: [
    type.mono,
    {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: vars.space[2],
      border: `${stroke.hairline}px solid transparent`,
      borderRadius: vars.radius.pill,
      cursor: "pointer",
      textDecoration: "none",
      transition: `background-color ${vars.duration.quick} ${vars.easing.settle}, border-color ${vars.duration.quick} ${vars.easing.settle}`,
      selectors: {
        "&:focus-visible": {
          outline: `${focus.width}px solid ${vars.color.focus.ring}`,
          outlineOffset: focus.offset,
        },
        "&:disabled, &[aria-disabled=true]": { cursor: "not-allowed" },
        "&[aria-busy=true]": { cursor: "progress" },
      },
      "@media": {
        [`(max-width: ${breakpoint.navigation - 1}px)`]: {
          selectors: {
            '&[data-compact="true"]': { width: 44, height: 44, minWidth: 44, padding: 0 },
          },
        },
        "(any-pointer: coarse)": { minHeight: vars.control.touch, minWidth: vars.control.touch },
        "(prefers-reduced-motion: reduce)": { transition: "none" },
      },
    },
  ],
  variants: {
    variant: {
      primary: {
        background: vars.color.action.fill,
        color: vars.color.action.onFill,
        selectors: {
          "&:hover:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.fillHover,
          },
          "&:active:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.fillPressed,
          },
        },
      },
      secondary: {
        background: "transparent",
        color: vars.color.text.primary,
        borderStyle: "dashed",
        borderColor: vars.color.line.control,
        selectors: {
          "&:hover:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.hover,
            borderColor: vars.color.line.strong,
          },
          "&:active:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.pressed,
          },
        },
      },
      ghost: {
        background: "transparent",
        color: vars.color.text.primary,
        selectors: {
          "&:hover:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.hover,
          },
          "&:active:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.action.pressed,
          },
        },
      },
    },
    tone: { neutral: {}, danger: {} },
    size: {
      compact: { minHeight: vars.control.compact, padding: `${vars.space[1]} ${vars.space[3]}` },
      regular: { minHeight: vars.control.regular, padding: `${vars.space[2]} ${vars.space[5]}` },
      touch: { minHeight: vars.control.touch, padding: `${vars.space[2]} ${vars.space[6]}` },
    },
    icon: {
      true: {
        padding: vars.space[2],
        aspectRatio: "1",
        flexShrink: 0,
        justifySelf: "start",
        alignSelf: "start",
      },
      false: {},
    },
  },
  compoundVariants: [
    {
      variants: { variant: "primary", tone: "danger" },
      style: {
        background: vars.color.status.danger.text,
        selectors: {
          "&:hover:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.status.danger.indicator,
          },
          "&:active:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.status.danger.text,
          },
        },
      },
    },
    ...(["secondary", "ghost"] as const).map((variant) => ({
      variants: { variant, tone: "danger" as const },
      style: {
        color: vars.color.status.danger.text,
        selectors: {
          "&:hover:not(:disabled):not([aria-disabled=true])": {
            background: vars.color.status.danger.soft,
          },
        },
      },
    })),
  ],
  defaultVariants: { variant: "primary", tone: "neutral", size: "regular", icon: false },
});
export const disabled = style({
  selectors: {
    "&:disabled, &[aria-disabled=true]:not([aria-busy=true])": {
      background: vars.color.action.disabled,
      color: vars.color.text.disabled,
      borderColor: "transparent",
    },
  },
});
export const pending = style({
  position: "absolute",
  inset: 4,
  height: "calc(100% - 8px)",
  width: "calc(100% - 8px)",
  overflow: "visible",
  pointerEvents: "none",
});
export const pendingPath = style({ stroke: "currentColor" });

export const iconContent = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
});

export const compactIcon = style({
  display: "none",
  fontSize: "1.125rem",
  lineHeight: 1,
  "@media": {
    [`(max-width: ${breakpoint.navigation - 1}px)`]: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    },
  },
});
export const compactLabel = style({
  "@media": {
    [`(max-width: ${breakpoint.navigation - 1}px)`]: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clipPath: "inset(50%)",
    },
  },
});
