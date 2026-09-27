import type { ColorMode } from "../color/tokens.ts";

/**
 * Only floating layers cast shadows; panels are flat and separated by dividers. Dark mode needs
 * darker shadows to read against dark surfaces.
 */
export const elevation: Readonly<
  Record<ColorMode, Readonly<Record<"modal" | "popover" | "toast", string>>>
> = {
  light: {
    modal: "0 12px 28px rgb(0 0 0 / 0.14)",
    popover: "0 6px 12px rgb(0 0 0 / 0.1)",
    toast: "0 4px 12px rgb(0 0 0 / 0.086)",
  },
  dark: {
    modal: "0 12px 28px rgb(0 0 0 / 0.4)",
    popover: "0 6px 12px rgb(0 0 0 / 0.4)",
    toast: "0 4px 12px rgb(0 0 0 / 0.35)",
  },
};
