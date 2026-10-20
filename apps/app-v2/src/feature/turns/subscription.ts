/**
 * The thread's turns, the workspace's members, what the person may do, and the stops and retries the server refused,
 * read from their store as they change; and the log of the turn they follow, read over HTTP while it is followed,
 * since no replica holds it.
 */

import { ThreadId } from "@amends-dev/core/thread"
import { TurnId } from "@amends-dev/core/turn"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Api from "../../api.ts"
import * as Stores from "../../store/Stores.ts"
import { followed, Message, TurnsDefinition } from "./definition.ts"
import { refusalsOf } from "./problem.ts"

/** How the person reads that a log could not be followed. */
const unfollowable = "The log could not be followed. Check the connection."

export const subscriptions = TurnsDefinition.subscriptions((entry) => ({
  turns: entry(
    "ReadTurns",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
    {
      messages: [
        Message.ReceivedTurns,
        Message.ReceivedMembers,
        Message.ReceivedGrants,
        Message.ReceivedRefusals,
        Message.FailedRead
      ],
      modelToDependencies: ({ workspaceId, memberId, threadId }) => ({ workspaceId, memberId, threadId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, threadId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.thread(threadId), ({ turns }) =>
                  Message.ReceivedTurns({
                    turns: turns.map(({ turn, retryOpen }) => ({
                      turn: turn.record.value,
                      pending: turn.pending,
                      retryOpen
                    }))
                  })
                ),
                Stream.merge(
                  Stream.map(store.members, (members) => Message.ReceivedMembers({ members })),
                  Stream.merge(
                    Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants })),
                    Stream.map(store.actions, (actions) => Message.ReceivedRefusals({ refusals: refusalsOf(actions) }))
                  )
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  ),
  // The followed turn's log, once there is one: opened with its items, then each change, then its end.
  log: entry(
    "FollowLog",
    { workspaceId: WorkspaceId.WorkspaceId, turnId: Schema.NullOr(TurnId.TurnId) },
    {
      messages: [Message.ReceivedLog, Message.FailedFollowLog],
      modelToDependencies: (model) => ({
        workspaceId: model.workspaceId,
        turnId: Option.getOrNull(followed(model))
      }),
      handler: function* () {
        return ({ workspaceId, turnId }) =>
          turnId === null
            ? Stream.empty
            : Stream.unwrap(
                Effect.flatMap(Api.asMember(workspaceId), (client) => client.turns.watchLog({ params: { turnId } }))
              ).pipe(
                Stream.map((logMessage) => Message.ReceivedLog({ turnId, logMessage })),
                Stream.catchCause(() => Stream.make(Message.FailedFollowLog({ turnId, error: unfollowable })))
              )
      }
    }
  )
}))
