import { Show, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconChevronDown } from "@amends/icons";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./button.css.ts";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Default secondary. */
  variant?: ButtonVariant;
  /** Shown before the label. */
  icon?: IconComponent;
  /** A trailing chevron for buttons that open a menu. */
  chevron?: boolean;
  /** Fill the container's width. */
  wide?: boolean;
  /** "large" is 44px with larger text, for centered screens. Default "regular". */
  size?: "regular" | "large";
};

/** A labelled action: 36px on desktop and 44px on touch layouts. */
export function Button(props: ButtonProps) {
  const [local, native] = splitProps(props, [
    "variant",
    "icon",
    "chevron",
    "wide",
    "size",
    "class",
    "type",
    "children",
  ]);
  return (
    <button
      {...native}
      type={local.type ?? "button"}
      class={classes(
        s.button,
        s.variant[local.variant ?? "secondary"],
        local.chevron && s.withChevron,
        local.size === "large" && s.large,
        local.wide && s.wide,
        local.class,
      )}
    >
      <Show when={local.icon}>{(icon) => <Dynamic component={icon()} class={s.icon} />}</Show>
      {local.children}
      <Show when={local.chevron}>
        <IconChevronDown class={s.chevron} />
      </Show>
    </button>
  );
}
