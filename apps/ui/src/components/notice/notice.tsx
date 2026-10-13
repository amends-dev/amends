import { Show, splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import { Button } from "../button/index.ts"
import { StatusMark } from "../status-mark/index.ts"
import * as s from "./notice.css.ts"

export type NoticeProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** What happened or what is missing, such as "API key wasn’t saved". */
  title: string
  /** `caution` for what needs setup or attention; `danger` for what cannot work. Default caution. */
  tone?: "caution" | "danger"
  /** Announces the notice when it appears, for one that reports a failed action. */
  alert?: boolean
  /** The one thing that fixes it, at the notice's end, such as "Open connection". */
  action?: { readonly label: string; readonly onClick: () => void; readonly disabled?: boolean }
}

/**
 * A boxed note in a form or page: something that needs attention before it works, with what to
 * do next. Field errors stay under their field; a Notice is for the form or page as a whole, and
 * a page shows one only when something is wrong.
 */
export function Notice(props: NoticeProps) {
  const [local, native] = splitProps(props, ["title", "tone", "alert", "action", "class", "children"])
  const tone = () => local.tone ?? "caution"
  return (
    <div
      {...native}
      role={local.alert ? "alert" : undefined}
      data-tone={tone()}
      data-action={local.action ? "" : undefined}
      class={classes(s.notice, local.class)}
    >
      <StatusMark mark={tone() === "danger" ? "blocked" : "attention"} class={s.mark} />
      <div class={s.text}>
        <p class={s.title}>{local.title}</p>
        <Show when={local.children}>
          <p class={s.body}>{local.children}</p>
        </Show>
      </div>
      <Show when={local.action}>
        {(action) => (
          <Button class={s.action} disabled={action().disabled} onClick={() => action().onClick()}>
            {action().label}
          </Button>
        )}
      </Show>
    </div>
  )
}
