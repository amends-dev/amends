/**
 * Where a conversation sits in the pane that scrolls it, as `apps/ui`'s `useStickToBottom` keeps it: at its end as it
 * opens, and there while the person is near its end as more is added, and wherever they scrolled to once they are
 * further. A conversation is a message list with an `id`, in a pane body that says it is anchored to the bottom, and a
 * turn's log the list of its activity in a body that says it follows its end; a list in a body that says neither, such
 * as a task's activity, is left where it is. The message a notification came for is scrolled to the middle instead.
 */

import * as Effect from "effect/Effect"
import * as Render from "foldkit/render"

/** How far from its end a pane body is still near it, in pixels, as `apps/ui` counts it. */
export const nearEnd = 80

/** What a pane body measures of how far it scrolls. */
export type Extent = Readonly<{ scrollHeight: number; scrollTop: number; clientHeight: number }>

/** Whether the person is near the end of what `extent` scrolls: less than `nearEnd` pixels of it lie below the view. */
export const isNearEnd = ({ scrollHeight, scrollTop, clientHeight }: Extent): boolean =>
  scrollHeight - scrollTop - clientHeight < nearEnd

/** The pane body that scrolls the conversation `id` and keeps it at its end, when there is one. */
const bodyOf = (id: string): HTMLElement | null =>
  document.getElementById(id)?.closest<HTMLElement>('[data-anchor="bottom"], [data-follows-end]') ?? null

/** Whether a message of the conversation `id` is the current one, such as the one a notification came for. */
const hasCurrentMessage = (id: string): boolean =>
  document.getElementById(id)?.querySelector('[aria-current="true"]') != null

const scrollToBottomOf = (id: string): void => {
  const body = bodyOf(id)

  if (body !== null) {
    body.scrollTop = body.scrollHeight
  }
}

/**
 * Scroll the conversation `id` to its end once the render in progress has committed, so that it opens there. With
 * `unlessCurrent` a message of it that is current keeps the view instead, since the person came for that one.
 */
export const scrollToEnd = (id: string, options: Readonly<{ unlessCurrent: boolean }>): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Render.afterCommit

    if (!(options.unlessCurrent && hasCurrentMessage(id))) {
      scrollToBottomOf(id)
    }
  })

/**
 * Scroll the conversation `id` to its end once the render in progress has committed, if the person was near its end
 * before it, and say whether they were. A Command runs before the render commits, so what it measures first is the
 * view as the person left it.
 */
export const followEnd = (id: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const body = bodyOf(id)

    if (body === null || !isNearEnd(body)) {
      return false
    }

    yield* Render.afterCommit
    scrollToBottomOf(id)
    return true
  })

/**
 * Scroll the message `element` to the middle of the pane that scrolls it, as `apps/ui` does for the one the reader came
 * to see.
 */
export const revealMessage = (element: Element): Effect.Effect<void> =>
  Effect.sync(() => element.scrollIntoView({ block: "center" }))
