import { IconButton } from "./button.tsx";
import type { JSX } from "solid-js";
import * as s from "./navigation-toggle.css.ts";
export interface NavigationToggleProps {
  onClick: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
  expanded: boolean;
  variant?: "ghost" | "secondary";
}
export function NavigationToggle(props: NavigationToggleProps) {
  return (
    <IconButton
      class={s.button}
      label="Open navigation"
      variant={props.variant ?? "secondary"}
      data-outlined={props.variant !== "ghost"}
      size="touch"
      aria-haspopup="dialog"
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      <span class={s.glyph}>☰</span>
    </IconButton>
  );
}
