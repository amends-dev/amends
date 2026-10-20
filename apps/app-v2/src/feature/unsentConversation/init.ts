import type { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { UnsentConversationComposition } from "./composition.ts"

/**
 * The conversation of the member `memberId`, in the workspace `workspaceId`, with the members `memberIds`, named by
 * `members`, which the opener has read already so that the people are named from the first view, with a composer for
 * its first message and nothing written.
 */
export const init = UnsentConversationComposition.makeInit(
  (
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    memberIds: ReadonlyArray<MemberId.MemberId>,
    members: ReadonlyArray<Member.Member>
  ) => ({
    childInitContext: { workspaceId, memberId, memberIds },
    model: { workspaceId, memberId, memberIds, members, notice: Option.none() }
  })
)
