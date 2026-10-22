/** Thread/task headings and participation-change sentences. */

import * as Option from "effect/Option"
import { memberName } from "../../../data/members.ts"
import type { SideAbout } from "../../../view/groups.ts"
import type { Model, ParticipationChange } from "../definition.ts"

/** What a side pane is about: the task the thread tracks, or the thread. */
export const aboutOf = (model: Model): SideAbout => (Option.isSome(model.task.task) ? "Task" : "Thread")

/**
 * What a change to a member's part in the thread says, as the person reads it: "Sara followed this thread", "You
 * stopped following", "Sara left the group", "Sara was removed from the group", "You were removed from the
 * workspace". The person is "You".
 */
export const noteOf = (model: Model, { change, memberId }: ParticipationChange): string => {
  const isSelf = memberId === model.memberId
  const who = isSelf ? "You" : memberName(model.members, memberId)
  const were = isSelf ? "were" : "was"

  switch (change) {
    case "followed":
      return `${who} followed this thread`
    case "unfollowed":
      return `${who} stopped following`
    case "left-group":
      return `${who} left the group`
    case "removed-from-group":
      return `${who} ${were} removed from the group`
    case "removed-from-workspace":
      return `${who} ${were} removed from the workspace`
  }
}
