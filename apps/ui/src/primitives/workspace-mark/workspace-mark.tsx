import { splitProps, type JSX } from "solid-js";
import { classes } from "../internal/props.ts";
import * as s from "./workspace-mark.css.ts";

type Name =
  | { decorative: true; "aria-label"?: never }
  | { decorative?: false; "aria-label": string };
export type WorkspaceMarkProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children" | "role" | "tabIndex" | "aria-hidden" | "aria-label"
> &
  Name & {
    /** Caller-owned initials. The full workspace name belongs in adjacent text or aria-label. */
    children: string;
  };
export function WorkspaceMark(props: WorkspaceMarkProps) {
  const [local, native] = splitProps(props, ["children", "decorative", "class", "classList"]);
  return (
    <span
      {...native}
      role={local.decorative ? undefined : "img"}
      aria-hidden={local.decorative ? true : undefined}
      class={classes(s.root, local.class, local.classList)}
    >
      {local.children.trim() || "?"}
    </span>
  );
}
