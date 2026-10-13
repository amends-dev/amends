import { Show } from "solid-js"
import * as s from "./live-status.css.ts"

export interface LiveStatusProps {
  /** Changes have stopped arriving. Undefined while live. */
  readonly status?: "connecting" | "reconnecting"
}

/**
 * Tells the reader when the workspace's changes have stopped arriving, so what they see may be
 * out of date. The live region stays mounted and empty while live, so the change is announced.
 */
export function LiveStatus(props: LiveStatusProps) {
  return (
    <p class={s.status} role="status" aria-atomic="true">
      <Show when={props.status}>
        {(status) => (
          <>
            <span class={s.dot} aria-hidden="true" />
            {status() === "connecting" ? "Connecting…" : "Reconnecting…"}
          </>
        )}
      </Show>
    </p>
  )
}
