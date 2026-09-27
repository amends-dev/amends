import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { focusRing } from "../../foundations/focus/styles.css.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./icon-button.css.ts";

export type IconButtonSize = "regular" | "compact";

export type IconButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: IconComponent;
  /** The accessible name; icon buttons have no visible label. */
  label: string;
  /** Regular is 32px with an 18px icon; compact is 24px with 14px. Both are 44px on touch. */
  size?: IconButtonSize;
};

/** A square button showing one icon. */
export function IconButton(props: IconButtonProps) {
  const [local, native] = splitProps(props, ["icon", "label", "size", "class", "type"]);
  const size = () => local.size ?? "regular";
  return (
    <button
      {...native}
      type={local.type ?? "button"}
      aria-label={local.label}
      title={local.label}
      class={classes(s.button, s.size[size()], s.touch, focusRing, local.class)}
    >
      <Dynamic component={local.icon} class={classes(s.icon[size()], s.touchIcon)} />
    </button>
  );
}
