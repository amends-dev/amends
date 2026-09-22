import { splitProps, type JSX } from "solid-js";
import { Button, type ButtonProps } from "../button/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./icon-button.css.ts";

type AccessibleName =
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string };
export type IconButtonProps = Omit<ButtonProps, "pending" | "aria-label" | "aria-labelledby"> &
  AccessibleName;
/** A named, square action. The supplied glyph is decorative; Button owns native behavior. */
export function IconButton(props: IconButtonProps): JSX.Element {
  const [local, native] = splitProps(props, ["children", "class", "classList", "variant"]);
  return (
    <Button
      {...native}
      variant={local.variant ?? "ghost"}
      class={classes(s.root, local.class, local.classList)}
    >
      <span class={s.glyph} aria-hidden="true">
        {local.children}
      </span>
    </Button>
  );
}
