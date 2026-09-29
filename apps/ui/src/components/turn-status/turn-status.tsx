import { Match, Switch, splitProps, type JSX } from "solid-js";
import { IconAlertTriangle, IconCheck, IconMinus } from "@amends/icons";
import { classes } from "../../internal/props.ts";
import { Logo } from "../logo/index.ts";
import * as s from "./turn-status.css.ts";

/**
 * Where an agent's turn stands: waiting to start, working, stopping as asked, done, failed, or
 * stopped.
 */
export type TurnState = "queued" | "working" | "stopping" | "done" | "failed" | "stopped";

export const turnStateLabels: Readonly<Record<TurnState, string>> = {
  queued: "Queued",
  working: "Working",
  stopping: "Stopping…",
  done: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

/**
 * The state's mark. An active turn moves as the logo does: the thread drawn through while it
 * waits, the stitches lit while it works, the patch tugged while it stops. A finished one is
 * still. Motion stills when the reader prefers less.
 */
export function TurnMark(props: { readonly state: TurnState }) {
  return (
    <Switch>
      <Match when={props.state === "queued"}>
        <Logo size="0.875rem" motion="thread" />
      </Match>
      <Match when={props.state === "working"}>
        <Logo size="0.875rem" motion="working" />
      </Match>
      <Match when={props.state === "stopping"}>
        <Logo size="0.875rem" motion="tug" />
      </Match>
      <Match when={props.state === "done"}>
        <IconCheck class={s.icon} aria-hidden="true" />
      </Match>
      <Match when={props.state === "failed"}>
        <IconAlertTriangle class={s.icon} aria-hidden="true" />
      </Match>
      <Match when={props.state === "stopped"}>
        <IconMinus class={s.icon} aria-hidden="true" />
      </Match>
    </Switch>
  );
}

export type TurnStatusProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  state: TurnState;
  /** In place of the state's name, such as "Working · 2". */
  label?: string;
};

/** A turn's state as a chip: its mark and name, failures in the caution colors. */
export function TurnStatus(props: TurnStatusProps) {
  const [local, native] = splitProps(props, ["state", "label", "class"]);
  return (
    <span
      {...native}
      class={classes(s.chip, s.tone[local.state === "failed" ? "caution" : "quiet"], local.class)}
    >
      <TurnMark state={local.state} />
      {local.label ?? turnStateLabels[local.state]}
    </span>
  );
}

export type TurnActivityProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  state: TurnState;
  /** What is happening, such as "Yumi working". */
  children: string;
};

/** A quiet mark of where an agent is at work, such as a thread's replies or a group's row. */
export function TurnActivity(props: TurnActivityProps) {
  const [local, native] = splitProps(props, ["state", "children", "class"]);
  return (
    <span {...native} class={classes(s.mark, local.class)}>
      <TurnMark state={local.state} />
      {local.children}
    </span>
  );
}
