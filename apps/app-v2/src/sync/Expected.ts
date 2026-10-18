/**
 * What an action the person writes is expected to create, as the server will create it, so their
 * browser shows it at once and the server's own record takes its place when the action's commit
 * arrives: a thread started in a group, with its opening message, and a reply in a thread. Each
 * takes the ID core derives for it from the action's key, the request key the server runs the
 * action under. Any other action is expected to create nothing shown before then.
 */

import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import type * as Crypto from "effect/Crypto"
import type * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type * as PlatformError from "effect/PlatformError"

/** An action the person wrote: who wrote it, in which workspace, under which key, and when. */
export interface Action {
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly memberId: MemberId.MemberId
  readonly key: Request.Key
  readonly writtenAt: DateTime.Utc
}

/** What an action with `Payload` is expected to create. */
export type Expectation<Payload> = (
  payload: Payload,
  action: Action
) => Effect.Effect<ReadonlyArray<ReplicaRecord.ReplicaRecord>, PlatformError.PlatformError, Crypto.Crypto>

const { cases } = ReplicaRecord.ReplicaRecord

/** Derive IDs as the server does when it runs `action`. */
const asRequest = <A, E, R>(action: Action, effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, Request.Current, action)

/** The message `action` posts in `threadId`, as it reads before the server publishes it. */
const message = (
  action: Action,
  threadId: Thread.Thread["id"],
  { text, mentions }: Pick<ThreadMessage.PublishInput, "text" | "mentions">
) =>
  Effect.map(ThreadMessage.newId(threadId), (id) =>
    cases.ThreadMessage.make({
      value: {
        id,
        workspaceId: action.workspaceId,
        threadId,
        author: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
        via: null,
        publishedAt: action.writtenAt,
        content: ThreadMessage.Content.cases.Text.make({ text, mentions, revision: 1, editedAt: null })
      }
    })
  )

/** A thread started in a group, with its opening message. */
export const threadStarted: Expectation<Thread.StartInGroupInput> = (input, action) =>
  asRequest(
    action,
    Effect.gen(function* () {
      const threadId = yield* Thread.newId(input.groupId)
      const thread = cases.Thread.make({
        value: {
          id: threadId,
          workspaceId: action.workspaceId,
          groupId: input.groupId,
          title: input.title ?? null,
          origin: input.origin ?? null,
          createdBy: ThreadMessage.Author.cases.Member.make({ memberId: action.memberId }),
          createdAt: action.writtenAt
        }
      })
      return [thread, yield* message(action, threadId, input)]
    })
  )

/** A reply in a thread. */
export const messagePosted: Expectation<ThreadMessage.PublishInput> = (input, action) =>
  asRequest(
    action,
    Effect.map(message(action, input.threadId, input), (posted) => [posted])
  )
