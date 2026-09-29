import { splitProps, type JSX } from "solid-js";
import { classes } from "../../internal/props.ts";
import * as s from "./status-mark.css.ts";

export type { StatusMarkSize } from "./status-mark.css.ts";

/**
 * A state as a shape, so it reads without color: `available` is a filled square (online, or an
 * agent that is ready), `offline` a hollow one, `attention` a triangle (needs setup), and
 * `blocked` a square with a bar (cannot run, or unavailable).
 */
export type StatusMarkKind = "available" | "offline" | "attention" | "blocked";

/** A member's or item's state: its mark, and its words for a hover and assistive technology. */
export interface Status {
  readonly mark: StatusMarkKind;
  /** The state in a word or two, such as "Needs setup" or "Working in #design". */
  readonly label: string;
  /** Why, in a sentence, for what needs attention or cannot run. */
  readonly detail?: string;
  /** An agent at work: the logo moves beside the label where the words show. */
  readonly activity?: "queued" | "working" | "stopping";
}

/** The status tone a mark takes; offline has none. */
export const markTone = (mark: StatusMarkKind) =>
  mark === "attention" ? "caution" : mark === "blocked" ? "danger" : undefined;

export type StatusMarkProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  mark: StatusMarkKind;
  /** Names the state for assistive technology; omit when text beside the mark says it. */
  label?: string;
  /** The side in CSS pixels: 8 on a 24px avatar, 9 on 28 to 32, 10 on 40 and beside text. */
  size?: s.StatusMarkSize;
  /** Sits in a square notch cut from the surface behind, as on an avatar's corner. */
  cutout?: boolean;
};

/** A small status shape, such as the patch over an avatar's corner. */
export function StatusMark(props: StatusMarkProps) {
  const [local, native] = splitProps(props, ["mark", "label", "size", "cutout", "class"]);
  return (
    <span
      {...native}
      role={local.label ? "img" : undefined}
      aria-label={local.label}
      aria-hidden={local.label ? undefined : true}
      data-mark={local.mark}
      class={classes(s.mark, s.size[local.size ?? 10], local.cutout && s.cutout, local.class)}
    >
      <span class={s.shape} />
    </span>
  );
}

/** Sets the surface a mark cuts out of, for a parent whose surface is not the panel's. */
export const knockoutVar = s.knockoutVar;
