/** The side-pane frame shared by threads opened from a group or the inbox. */

import type { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { pane, paneBack, paneClose } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import { sideSubtitle } from "../../../view/groups.ts"
import { statusShape } from "../../../view/tasks.ts"
import { availabilityOf, type Model, titleOf } from "../definition.ts"
import { aboutOf } from "./wording.ts"

/**
 * What a thread's side pane is given besides the thread: where it is, where it goes back to, and the thread's own views
 * as the parent embeds them.
 */
export type SidePane<Message> = Readonly<{
  thread: Model
  /** The thread's group, once it is read. */
  group: Option.Option<Group.Group>
  members: ReadonlyArray<Member.Member>
  self: MemberId.MemberId
  /** What the pane's Back is named for, such as the group, the Tasks tab, or the inbox. */
  backTo: string
  /** The line under the title, in place of the thread's or the task's place, such as why a notification came. */
  subtitle?: string | undefined
  /** What Back and Close send. */
  onClose: Message
  /** The thread's `followView`, the bell in the header. */
  follow: Html
  /** The thread's `view`. */
  body: Html
  /** The thread's `replyView`. */
  reply: Html
}>

/**
 * The thread open as the side pane, as `apps/ui` has it: a thread is titled by a message and subtitled "Thread in
 * #general", with the bell that follows it and Close thread; a thread that tracks a task by its status, subtitled "Task
 * in #general", with Close task. Back, which a phone shows in place of Close, is named for where it goes back to. While
 * the thread is not shown the bell is not either, since it would say whether the person follows a thread they have not
 * read, and a thread that is not available has no composer, as in `apps/ui`.
 */
export const sidePane = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: SidePane<Message>
): Html => {
  const tracked = Option.map(config.thread.task.task, ({ task }) => task)
  const about = aboutOf(config.thread)
  const availability = availabilityOf(config.thread)

  return pane(h, {
    variant: "side",
    label: about,
    header: {
      title: titleOf(config.thread),
      ...Option.match(tracked, {
        onNone: () => ({ icon: "message" as const }),
        onSome: (task) => ({ taskStatus: statusShape[task.status] })
      }),
      subtitle: config.subtitle ?? sideSubtitle(about, config.group, config.members, config.self),
      leading: paneBack(h, config.onClose, `Back to ${config.backTo}`),
      actions: [
        ...(availability === "Available" ? [config.follow] : []),
        paneClose(h, config.onClose, `Close ${about.toLowerCase()}`)
      ]
    },
    anchor: Option.isNone(tracked) && availability === "Available" ? "bottom" : "top",
    body: [config.body],
    ...(availability === "Unavailable" ? {} : { footer: [config.reply] })
  })
}
