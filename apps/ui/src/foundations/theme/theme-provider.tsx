import { splitProps, type JSX } from "solid-js";
import type { ColorTheme } from "../color/tokens.ts";
import { colorThemes } from "../color/theme.css.ts";
import { typographyStyles } from "../typography/styles.css.ts";

export type ThemeProviderProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** The caller chooses the theme; nested providers establish their own scope. */
  theme: ColorTheme;
};

/** A CSS inheritance boundary for the reviewed colors, color scheme, and body typography. */
export function ThemeProvider(props: ThemeProviderProps) {
  const [local, native] = splitProps(props, ["theme", "class", "classList"]);
  const classes = () =>
    [
      colorThemes[local.theme],
      typographyStyles.body,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  return <div {...native} class={classes()} />;
}
