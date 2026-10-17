import { IconCheck } from "@amends-dev/icons"
import { Show, onCleanup, onMount, splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import * as s from "./toast.css.ts"

export type RegionProps = JSX.HTMLAttributes<HTMLOListElement>

/** Where toasts appear; place one inside the Theme and render Items while they show. */
export function Region(props: RegionProps) {
  const [local, native] = splitProps(props, ["class"])
  return <ol aria-live="polite" aria-label="Notifications" {...native} class={classes(s.region, local.class)} />
}

export interface ItemProps {
  /** Such as "Group created". */
  readonly children: string
  /** One follow-up, such as opening what was just joined. */
  readonly action?: { readonly label: string; readonly onClick: () => void }
  /** Called when the toast should go, after `duration` or its action. */
  readonly onDismiss: () => void
  /** Milliseconds before it dismisses itself. Default 5000; 0 keeps it. */
  readonly duration?: number
}

/** A short confirmation with a check, and optionally one action. */
export function Item(props: ItemProps) {
  onMount(() => {
    const duration = props.duration ?? 5000
    if (duration <= 0) return
    const timer = setTimeout(() => props.onDismiss(), duration)
    onCleanup(() => clearTimeout(timer))
  })
  return (
    <li class={s.toast} role="status">
      <IconCheck class={s.icon} />
      <span class={s.message}>{props.children}</span>
      <Show when={props.action}>
        {(action) => (
          <button
            type="button"
            class={s.action}
            onClick={() => {
              action().onClick()
              props.onDismiss()
            }}
          >
            {action().label}
          </button>
        )}
      </Show>
    </li>
  )
}
