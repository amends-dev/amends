import type { ThreadId } from "@amends-dev/core/thread"
import type { Member } from "@amends-dev/core/workspace"
import { hint, notice } from "@amends-dev/design/control"
import { message, messageList } from "@amends-dev/design/message"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { authorName, initials, statusLabel, threadLabel, timeOf } from "../../seen.ts"
import { ComposerBinding, ThreadsComposition, type ThreadsViewBuilder } from "./composition.ts"
import { Message, type ThreadItem } from "./definition.ts"

/** Who could have written the openings, what the group is called, and which of its threads is open. */
export type ViewInputs = Readonly<{
  members: ReadonlyArray<Member.Member>
  groupName: string
  openThreadId: Option.Option<ThreadId.ThreadId>
}>

/** A thread as a message: its opening's author and time, its title or opening, and what is new in it. */
const threadRow = (item: ThreadItem, { members, openThreadId }: ViewInputs, h: ThreadsViewBuilder): Html => {
  const author = Option.match(item.opening, {
    onNone: () => ({ name: "A thread", mark: "?", time: undefined }),
    onSome: (opening) => {
      const name = authorName(opening, members, [])
      return { name, mark: initials(name), time: timeOf(opening.publishedAt) }
    }
  })

  return message(h, {
    key: item.thread.id,
    mark: author.mark,
    author: author.name,
    time: author.time,
    note: item.pending ? "Sending…" : undefined,
    text: threadLabel(item.thread, item.opening),
    onOpen: Message.ClickedThread({ threadId: item.thread.id }),
    isCurrent: Option.exists(openThreadId, (threadId) => threadId === item.thread.id),
    meta: [
      ...(item.unread > 0 ? [h.span([], [`${item.unread} new`])] : []),
      ...Option.toArray(Option.map(item.task, (task) => h.span([], [statusLabel[task.status]])))
    ]
  })
}

/** The group's threads, each as a message of the person who opened it, the open one marked. */
export const view = ThreadsComposition.makeView.withInputs<ViewInputs>((model, inputs, h) =>
  h.div(
    [],
    [
      notice(h, model.notice),
      model.threads.length === 0
        ? hint(h, "No threads yet.")
        : messageList(h, { label: "Threads", children: model.threads.map((item) => threadRow(item, inputs, h)) })
    ]
  )
)

/** The composer to start a thread in the group, for a pane's footer. */
export const composerView = ThreadsComposition.makeView.withInputs<ViewInputs>((model, { groupName }, h) =>
  h.block(
    ComposerBinding.embedView({
      slotId: "composer",
      model: model.composer,
      viewInputs: { label: "Start a thread", submitLabel: "Start", placeholder: `Message ${groupName}` }
    })
  )
)
