import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { type } from "../styles/type.css.ts";
import type { TypeRole } from "../tokens/index.ts";
import * as s from "./text.css.ts";

export type TextElement =
  | "p"
  | "span"
  | "div"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "strong"
  | "em"
  | "small"
  | "blockquote"
  | "code"
  | "pre"
  | "label"
  | "legend"
  | "time"
  | "dt"
  | "dd";

export type TextProps<T extends TextElement = "p"> = {
  as?: T;
  class?: string;
  /** Visual role, independent of HTML semantics. Inherit is for fragments in styled text. */
  variant?: TypeRole | "inherit";
  tone?: keyof typeof s.tone;
} & Omit<JSX.IntrinsicElements[T], "as" | "class" | "variant" | "tone">;

/** Defaults to a body paragraph. Native attributes and refs reach the selected element. */
export function Text<T extends TextElement = "p">(props: TextProps<T>): JSX.Element {
  const [local, rest] = splitProps(props as TextProps<TextElement>, [
    "as",
    "variant",
    "tone",
    "class",
  ]);
  return (
    <Dynamic
      {...(rest as JSX.IntrinsicElements[TextElement])}
      component={local.as ?? "p"}
      class={`${s.root} ${local.variant === "inherit" ? s.inherit : type[local.variant ?? "body"]} ${s.tone[local.tone ?? "inherit"]} ${local.class ?? ""}`}
    />
  );
}
