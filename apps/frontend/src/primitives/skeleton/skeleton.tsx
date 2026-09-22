import { splitProps, type JSX } from "solid-js";
import { classes } from "../internal/props.ts";
import * as s from "./skeleton.css.ts";

export type SkeletonProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children" | "role" | "tabIndex" | "aria-hidden"
> & {
  children?: never;
  role?: never;
  tabIndex?: never;
  "aria-hidden"?: never;
};

/** A static, decorative first-paint placeholder. Size it with native style or its container. */
export function Skeleton(props: SkeletonProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <span
      {...native}
      class={classes(s.skeleton, local.class, local.classList)}
      aria-hidden="true"
    />
  );
}
