import { For, Show, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Logo } from "../logo/index.ts"
import { StateArt, type StateArtKind } from "../state-art/index.ts"
import * as s from "./empty-state.css.ts"

export interface EmptyStateProps {
  /**
   * The animated state above the title: what is empty or how it went wrong, or `working`, the
   * mark at work while something is waited on.
   */
  readonly art?: StateArtKind | "working"
  readonly title: string
  /** Short sentences under the title. */
  readonly lines?: ReadonlyArray<string>
  /** 1 when it is the page's heading. Default 2. */
  readonly level?: 1 | 2
  /** Actions under the text, such as a Button. */
  readonly children?: JSX.Element
}

/** A centered note where content will appear, such as a new group's welcome. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class={s.empty}>
      <Show when={props.art}>
        {(art) => (
          <Show
            when={art() !== "working" && (art() as StateArtKind)}
            fallback={<Logo motion="working" size="3.5rem" class={s.art} />}
          >
            {(kind) => <StateArt kind={kind()} class={s.art} />}
          </Show>
        )}
      </Show>
      <Dynamic component={`h${props.level ?? 2}`} class={s.title}>
        {props.title}
      </Dynamic>
      <For each={props.lines}>{(line) => <p class={s.line}>{line}</p>}</For>
      <Show when={props.children}>
        <div class={s.actions}>{props.children}</div>
      </Show>
    </div>
  )
}
