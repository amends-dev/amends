import { splitProps, type JSX } from "solid-js";
import { callHandler, classes } from "../internal/props.ts";
import * as s from "./filter-chip.css.ts";
export type FilterChipProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-pressed"
> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
};
/** One independently toggled filter. Compose a group with Row and ordinary children. */
export function FilterChip(props: FilterChipProps) {
  const [local, native] = splitProps(props, [
    "pressed",
    "onPressedChange",
    "onClick",
    "class",
    "classList",
  ]);
  return (
    <button
      {...native}
      type="button"
      aria-pressed={local.pressed}
      class={classes(s.root, local.class, local.classList)}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented && !event.currentTarget.matches(":disabled"))
          local.onPressedChange(!local.pressed);
      }}
    />
  );
}
