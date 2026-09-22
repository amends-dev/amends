import { createContext, splitProps, useContext, type JSX } from "solid-js";
import type { StatusTone } from "../../foundations/color/tokens.ts";
import { Text } from "../text/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./status.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLSpanElement> & { tone: StatusTone };
const Context = createContext(false);
/** Static, unfilled status presentation. Callers map domain state and opt into announcements. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["tone", "class", "classList"]);
  return (
    <Context.Provider value={true}>
      <span
        {...native}
        data-status-tone={local.tone}
        class={classes(`${s.root} ${s.tones[local.tone]}`, local.class, local.classList)}
      />
    </Context.Provider>
  );
}
export type IndicatorProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children" | "role" | "tabIndex" | "aria-hidden"
> & {
  appearance?: "solid" | "hollow";
  children?: never;
  role?: never;
  tabIndex?: never;
  "aria-hidden"?: never;
};
export function Indicator(props: IndicatorProps) {
  if (!useContext(Context)) throw new Error("Status.Indicator requires Status.Root");
  const [local, native] = splitProps(props, ["appearance", "class", "classList"]);
  return (
    <span
      {...native}
      aria-hidden="true"
      data-status-indicator={local.appearance ?? "solid"}
      class={classes(
        `${s.indicator} ${s.appearances[local.appearance ?? "solid"]}`,
        local.class,
        local.classList,
      )}
    />
  );
}
export type LabelProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  children: string;
  /** Quieter presentation, as in the cancelled-state reference. */
  muted?: boolean;
};
export function Label(props: LabelProps) {
  if (!useContext(Context)) throw new Error("Status.Label requires Status.Root");
  const [local, native] = splitProps(props, ["muted", "class", "classList"]);
  return (
    <Text
      {...native}
      as="span"
      variant="mono"
      tone={local.muted ? "secondary" : "primary"}
      class={classes(s.label, local.class, local.classList)}
    />
  );
}
