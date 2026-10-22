/** Shared member identity and name lookup. */

import { Identity } from "@amends-dev/core/identity"
import type { Member, MemberId } from "@amends-dev/core/workspace"

/** Whether the member is an agent. */
export const isAgent = (member: Member.Member): boolean => Identity.MemberReference.isAnyOf(["Agent"])(member.identity)

/** `memberId` by their name among `members`, or their ID until names are read. */
export const memberName = (members: ReadonlyArray<Member.Member>, memberId: MemberId.MemberId): string =>
  members.find((member) => member.id === memberId)?.name ?? memberId

/** The members `memberIds` by their names among `members`, as a conversation with them is named. */
export const namesOf = (members: ReadonlyArray<Member.Member>, memberIds: ReadonlyArray<MemberId.MemberId>): string =>
  memberIds.map((id) => memberName(members, id)).join(", ")
