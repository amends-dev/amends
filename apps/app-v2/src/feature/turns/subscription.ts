/**
 * The thread's turns, the workspace's members and connections, what the person may do, and the stops and retries the
 * server refused, read from their store as they change; and the log of the turn they follow, read over HTTP while it is
 * followed, since no replica holds it.
 */

import { CoreError } from "@amends-dev/core/error"
import { ThreadId } from "@amends-dev/core/thread"
import { type Turn, TurnId } from "@amends-dev/core/turn"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Api from "../../api.ts"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { followed, Message, TurnsDefinition } from "./definition.ts"
import { refusalsOf } from "./problem.ts"

/** How the person reads that a log could not be followed. */
const unfollowable = "The log could not be followed. Check the connection."

/**
 * What following a turn's log through `logMessages` tells the Block: each message of the log, and, when it fails, that
 * the log is out of reach, as it is for a turn in a thread the person can no longer open, or that it could not be
 * followed.
 */
export const logMessagesOf = <E, R>(turnId: TurnId.TurnId, logMessages: Stream.Stream<Turn.LogMessage, E, R>) =>
  logMessages.pipe(
    Stream.map((logMessage) => Message.ReceivedLog({ turnId, logMessage })),
    Stream.catchIf(Schema.is(CoreError.NotFound), () => Stream.make(Message.FoundLogUnavailable({ turnId }))),
    Stream.catchCause(() => Stream.make(Message.FailedFollowLog({ turnId, error: unfollowable })))
  )

export const subscriptions = TurnsDefinition.makeSubscriptions((entry) => ({
  turns: entry(
    "ReadTurns",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
    {
      messages: [
        Message.ReceivedTurns,
        Message.ReceivedMembers,
        Message.ReceivedConnections,
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
                    Stream.map(store.list("Connection", Store.workspacePlace), (connections) =>
                      Message.ReceivedConnections({
                        connections: connections
                          .filter(({ record }) => record.value.status === "active")
                          .map(({ record }) => record.value)
                      })
                    ),
                    Stream.merge(
                      Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants })),
                      Stream.map(store.actions, (actions) =>
                        Message.ReceivedRefusals({ refusals: refusalsOf(actions) })
                      )
                    )
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
      messages: [Message.ReceivedLog, Message.FoundLogUnavailable, Message.FailedFollowLog],
      modelToDependencies: (model) => ({
        workspaceId: model.workspaceId,
        turnId: Option.getOrNull(followed(model))
      }),
      handler: function* () {
        return ({ workspaceId, turnId }) =>
          turnId === null
            ? Stream.empty
            : logMessagesOf(
                turnId,
                Stream.unwrap(
                  Effect.flatMap(Api.asMember(workspaceId), (client) => client.turns.watchLog({ params: { turnId } }))
                )
              )
      }
    }
  )
}))
