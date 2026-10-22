/** Group visibility wording and side-pane subtitles. */

import type { Group } from "@amends-dev/core/group"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { placeName } from "../data/groups.ts"

/** What a team's visibility means, as the person reads it under the choice of one. */
export const visibilityHint: Readonly<Record<Group.Visibility, string>> = {
  Public: "Anyone in the workspace can find this group and join it.",
  Private: "Only people added to this group can find it."
}

/** What a side pane is about: a thread, or the task it tracks. */
export type SideAbout = "Thread" | "Task"

/**
 * Where a thread or a task is, as the side pane's subtitle says it, as `apps/ui` does: "Thread in #general" for a team,
 * "Thread with Bob" for a conversation, or only "Thread" while its group is not read; "Task in #general" and "Task
 * with Bob" the same way.
 */
export const sideSubtitle = (
  about: SideAbout,
  group: Option.Option<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  Option.match(group, {
    onNone: () => about,
    onSome: (known) => `${about} ${known.kind === "Team" ? "in" : "with"} ${placeName(known, members, self)}`
  })

/**
 * Where a thread is when the person came to it for a reason, as `apps/ui`'s inbox says it in the side pane's
 * subtitle: "Mention · #general", or only the reason while the thread's group is not read.
 */
export const reasonSubtitle = (
  reason: string,
  group: Option.Option<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): string =>
  Option.match(group, {
    onNone: () => reason,
    onSome: (known) => `${reason} · ${placeName(known, members, self)}`
  })
