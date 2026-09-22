import { splitProps, type JSX } from "solid-js";
import { Text, type TextElement, type TextProps } from "../text/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./divider.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLDivElement>;
/** Child order defines the layout. Keep headings and actions in the accessibility tree. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.root, local.class, local.classList)} />;
}

export type LineProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children" | "role" | "tabIndex" | "aria-hidden"
> & {
  children?: never;
  role?: never;
  tabIndex?: never;
  "aria-hidden"?: never;
};
/** A decorative horizontal seam. It fills its container or shares a Root's remaining space. */
export function Line(props: LineProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <span {...native} class={classes(s.line, local.class, local.classList)} aria-hidden="true" />
  );
}

export type LabelProps<T extends TextElement = "span"> = Omit<TextProps<T>, "variant" | "tone">;
/** A compact mono label; choose a heading element when it names a section. */
export function Label<T extends TextElement = "span">(props: LabelProps<T>) {
  const [local, native] = splitProps(props, ["as", "class", "classList"]);
  return (
    <Text<TextElement>
      {...(native as TextProps<TextElement>)}
      as={local.as ?? "span"}
      variant="mono"
      tone="secondary"
      class={classes(s.label, local.class, local.classList)}
    />
  );
}
