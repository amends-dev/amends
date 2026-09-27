import { Match, Switch, splitProps, type JSX } from "solid-js";
import { vars } from "../../foundations/theme/vars.css.ts";

export type TaskState = "triage" | "open" | "progress" | "done";

const labels: Record<TaskState, string> = {
  triage: "Triage",
  open: "Open",
  progress: "In progress",
  done: "Done",
};

export type TaskStatusProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "children"> & {
  state: TaskState;
  /** CSS length. Default 0.875rem. */
  size?: string;
  /** Hide from assistive technology when the state is written beside it. */
  decorative?: boolean;
};

/**
 * A task's state as a 14px circle: outlined when open, half filled in progress, marked with "!"
 * in triage, and filled with a check when done.
 */
export function TaskStatus(props: TaskStatusProps) {
  const [local, native] = splitProps(props, ["state", "size", "decorative"]);
  const ink = () => (local.state === "done" ? vars.color.text.primary : vars.color.text.secondary);
  return (
    <svg
      {...native}
      viewBox="0 0 16 16"
      width={local.size ?? "0.875rem"}
      height={local.size ?? "0.875rem"}
      fill="none"
      role={local.decorative ? undefined : "img"}
      aria-label={local.decorative ? undefined : labels[local.state]}
      aria-hidden={local.decorative ? true : undefined}
      style={{ flex: "none", color: ink() }}
    >
      <circle
        cx="8"
        cy="8"
        r="6.4"
        stroke="currentColor"
        stroke-width="1.2"
        fill={local.state === "done" ? "currentColor" : "none"}
      />
      <Switch>
        <Match when={local.state === "progress"}>
          <path d="M8 3.6 A4.4 4.4 0 0 0 8 12.4 Z" fill="currentColor" />
        </Match>
        <Match when={local.state === "triage"}>
          <path d="M8 4.6 V8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          <circle cx="8" cy="11.1" r="0.8" fill="currentColor" />
        </Match>
        <Match when={local.state === "done"}>
          <path
            d="M5.3 8.2 L7.2 10 L10.8 6.3"
            stroke={vars.color.text.onPrimary}
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </Match>
      </Switch>
    </svg>
  );
}

/** The state's name, such as "In progress". */
export const taskStateLabel = (state: TaskState) => labels[state];
