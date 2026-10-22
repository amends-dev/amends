/** Thread titles and message text used to find threads. */

import type { Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { messageWords } from "./messages.ts"
import { foldAccents } from "./search.ts"

/** A thread's title, its opening's words, or the fallback when neither is known. */
export const threadWords = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>
): string =>
  thread.title ??
  Option.match(opening, {
    onNone: () => "A thread",
    onSome: (message) => messageWords(message, members)
  })

/** Match either the title or the opening's words, ignoring case, accents, and surrounding whitespace. */
export const threadContains = (
  thread: Thread.Thread,
  opening: Option.Option<ThreadMessage.ThreadMessage>,
  members: ReadonlyArray<Member.Member>,
  query: string
): boolean => {
  const wanted = foldAccents(query.trim())
  const words = [thread.title, ...Option.toArray(Option.map(opening, (message) => messageWords(message, members)))]

  return wanted === "" || words.some((text) => text !== null && foldAccents(text).includes(wanted))
}
