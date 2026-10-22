/**
 * The workspace's members, and the conversation with exactly the people the Block is for once the store lists one,
 * read from the person's store as they change.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { conversationAmong } from "../../data/groups.ts"
import type * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { Message, UnsentConversationDefinition } from "./definition.ts"

/**
 * What the Block is told of the groups `groups` as the store lists them: the conversation of the person `memberId` with
 * exactly the members `memberIds`, when there is one.
 */
export const receivedConversation = (
  groups: ReadonlyArray<Store.GroupView>,
  memberId: MemberId.MemberId,
  memberIds: ReadonlyArray<MemberId.MemberId>
) =>
  Message.ReceivedConversation({
    groupId: Option.map(
      conversationAmong(
        groups.map(({ group }) => group.record.value),
        memberId,
        memberIds
      ),
      ({ id }) => id
    )
  })

export const subscriptions = UnsentConversationDefinition.subscriptions((entry) => ({
  people: entry(
    "ReadPeople",
    {
      workspaceId: WorkspaceId.WorkspaceId,
      memberId: MemberId.MemberId,
      memberIds: Schema.Array(MemberId.MemberId)
    },
    {
      messages: [Message.ReceivedMembers, Message.ReceivedConversation, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, memberIds }) => ({ workspaceId, memberId, memberIds }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, memberIds }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.members, (members) => Message.ReceivedMembers({ members })),
                Stream.map(store.groups, (groups) => receivedConversation(groups, memberId, memberIds))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
