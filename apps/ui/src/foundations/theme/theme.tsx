import { splitProps, type JSX } from "solid-js";
import type { ColorMode } from "../color/tokens.ts";
import { modeThemes } from "./vars.css.ts";
import * as s from "./theme.css.ts";

export type ThemeProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** The caller chooses the mode; a nested Theme starts its own scope. */
  mode: ColorMode;
};

/** Applies a color mode, the typeface, and body text to everything inside it. */
export function Theme(props: ThemeProps) {
  const [local, native] = splitProps(props, ["mode", "class"]);
  return (
    <div
      {...native}
      class={[modeThemes[local.mode], s.root, s[local.mode], local.class].filter(Boolean).join(" ")}
      data-mode={local.mode}
    />
  );
}
