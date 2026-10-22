/** Group summaries and details read by the workspace. */

import type { GroupId } from "@amends-dev/core/group"
import type * as Option from "effect/Option"
import type * as Pending from "../Pending.ts"
import type * as Replica from "../Replica.ts"

/** A group as the person sees it listed: the group, and how many members it has. */
export interface GroupView {
  readonly group: Pending.Held<Replica.RecordOf<"Group">>
  readonly members: number
}

/**
 * `groups` with how many members each has: a direct group has the ones it was made with, and a team the
 * admitted ones among the `memberships` at its place.
 */
export const countMembers = (
  groups: ReadonlyArray<Pending.Held<Replica.RecordOf<"Group">>>,
  memberships: ReadonlyArray<Pending.Held<Replica.RecordOf<"GroupMembership">>>
): ReadonlyArray<GroupView> => {
  const admitted = new Map<GroupId.GroupId, number>()
  for (const { record } of memberships)
    if (record.value.status === "active")
      admitted.set(record.value.groupId, (admitted.get(record.value.groupId) ?? 0) + 1)
  return groups.map((group) => ({
    group,
    members:
      group.record.value.kind === "Direct"
        ? group.record.value.memberIds.length
        : (admitted.get(group.record.value.id) ?? 0)
  }))
}

/**
 * A group as the person sees it open: the group, while the replica holds it, its admissions, and the
 * person's own follow of it, when they have one.
 */
export interface GroupDetail {
  readonly group: Option.Option<Pending.Held<Replica.RecordOf<"Group">>>
  readonly memberships: ReadonlyArray<Pending.Held<Replica.RecordOf<"GroupMembership">>>
  readonly follow: Option.Option<Pending.Held<Replica.RecordOf<"GroupFollow">>>
}
