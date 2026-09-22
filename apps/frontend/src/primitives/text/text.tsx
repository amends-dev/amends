import { splitProps, type JSX, type Ref } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { TypographyRole } from "../../foundations/typography/tokens.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import * as s from "./text.css.ts";

export type TextElement = "p" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "code";
export type TextTone = "inherit" | "primary" | "secondary";
export type TextProps<T extends TextElement = "p"> = {
  as?: T;
  /** Appearance is independent of the selected HTML element. */
  variant?: TypographyRole;
  tone?: TextTone;
  class?: string;
  classList?: JSX.HTMLAttributes<HTMLElement>["classList"];
  ref?: Ref<HTMLElementTagNameMap[NoInfer<T>]>;
} & Omit<
  JSX.IntrinsicElements[NoInfer<T>],
  "as" | "variant" | "tone" | "class" | "classList" | "ref"
>;

/** A body paragraph with inherited color by default. The surrounding layout owns spacing. */
export function Text<T extends TextElement = "p">(props: TextProps<T>): JSX.Element {
  const [local, rest] = splitProps(props, ["as", "variant", "tone", "class", "classList"]);
  // TextProps pairs native props with `as`; Dynamic needs the common HTML shape here.
  const native = rest as JSX.HTMLAttributes<HTMLElement>;
  const classes = () =>
    [
      s.root,
      typographyStyles[local.variant ?? "body"],
      s.tones[local.tone ?? "inherit"],
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  return <Dynamic<TextElement> {...native} component={local.as ?? "p"} class={classes()} />;
}
