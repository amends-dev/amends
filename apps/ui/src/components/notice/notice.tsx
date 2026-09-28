import { Show, splitProps, type JSX } from "solid-js";
import { IconAlertTriangle } from "@amends/icons";
import { classes } from "../../internal/props.ts";
import * as s from "./notice.css.ts";

export type NoticeProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** What happened, such as "API key wasn’t saved". */
  title: string;
  /** Announces the notice when it appears, for one that reports a failed action. */
  alert?: boolean;
};

/**
 * A boxed caution note in a form or panel: something that needs attention before it works, with
 * what to do next. Field errors stay under their field; a Notice is for the form as a whole.
 */
export function Notice(props: NoticeProps) {
  const [local, native] = splitProps(props, ["title", "alert", "class", "children"]);
  return (
    <div
      {...native}
      role={local.alert ? "alert" : undefined}
      class={classes(s.notice, local.class)}
    >
      <IconAlertTriangle class={s.icon} />
      <div class={s.text}>
        <p class={s.title}>{local.title}</p>
        <Show when={local.children}>
          <p class={s.body}>{local.children}</p>
        </Show>
      </div>
    </div>
  );
}
