import { splitProps, type JSX } from "solid-js";
import { Button, type ButtonProps, type ButtonVariant } from "../button/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./icon-button.css.ts";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };
export type IconButtonShape = "square" | "circle";
export type IconButtonSize = "regular" | "compact";
export type IconButtonVariant = ButtonVariant | "soft";
export type IconButtonProps = Omit<
  ButtonProps,
  "pending" | "aria-label" | "aria-labelledby" | "variant"
> &
  AccessibleName & {
    variant?: IconButtonVariant;
    shape?: IconButtonShape;
    size?: IconButtonSize;
  };
/** A named compact action. SVG and text glyphs are decorative; Button owns native behavior. */
export function IconButton(props: IconButtonProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "children",
    "class",
    "classList",
    "variant",
    "tone",
    "shape",
    "size",
  ]);
  return (
    <Button
      {...native}
      variant={local.variant === "soft" ? "ghost" : (local.variant ?? "ghost")}
      tone={local.tone}
      class={classes(
        `${s.root} ${s.shapes[local.shape ?? "square"]} ${s.sizes[local.size ?? "regular"]} ${local.variant === "soft" ? s.soft[local.tone ?? "neutral"] : ""}`,
        local.class,
        local.classList,
      )}
      data-icon-button-shape={local.shape ?? "square"}
      data-icon-button-size={local.size ?? "regular"}
    >
      <span class={s.glyph} aria-hidden="true">
        {local.children}
      </span>
    </Button>
  );
}
