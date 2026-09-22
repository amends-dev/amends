import { createContext, splitProps, useContext, type JSX } from "solid-js";
import { classes } from "../internal/props.ts";
import * as s from "./avatar.css.ts";

export type Kind = "human" | "agent" | "contact" | "system";
type AccessibleName =
  | { decorative: true; "aria-label"?: never; "aria-labelledby"?: never }
  | ({ decorative?: false } & (
      | { "aria-label": string; "aria-labelledby"?: never }
      | { "aria-labelledby": string; "aria-label"?: never }
    ));
export type RootProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "role" | "tabIndex" | "aria-hidden" | "aria-label" | "aria-labelledby"
> &
  AccessibleName & {
    kind: Kind;
    role?: never;
    tabIndex?: never;
    "aria-hidden"?: never;
  };
const Context = createContext(false);

/** A noninteractive identity mark. Its name belongs to the caller, not the fallback initials. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["kind", "decorative", "class", "classList"]);
  return (
    <Context.Provider value={true}>
      <span
        {...native}
        role={local.decorative ? undefined : "img"}
        aria-hidden={local.decorative ? true : undefined}
        data-avatar-kind={local.kind}
        class={classes(`${s.root} ${s.kinds[local.kind]}`, local.class, local.classList)}
      />
    </Context.Provider>
  );
}
export type FallbackProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children" | "role" | "tabIndex" | "aria-hidden"
> & {
  /** Caller-supplied initials or a text glyph. Empty content renders a question mark. */
  children?: string;
  role?: never;
  tabIndex?: never;
  "aria-hidden"?: never;
};
export function Fallback(props: FallbackProps) {
  if (!useContext(Context)) throw new Error("Avatar.Fallback requires Avatar.Root");
  const [local, native] = splitProps(props, ["children", "class", "classList"]);
  return (
    <span {...native} aria-hidden="true" class={classes(s.fallback, local.class, local.classList)}>
      {local.children?.trim() || "?"}
    </span>
  );
}
