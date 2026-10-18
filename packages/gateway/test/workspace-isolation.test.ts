import { Connection as ConnectionContract } from "@amends-dev/connection"
import { BuiltinRoles, Role, Assignment } from "@amends-dev/core/authorization"
import { Delivery, ChannelId, DeliveryId } from "@amends-dev/core/channel"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import {
  ThreadActivity,
  ThreadActivityKind,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadId,
  ThreadMessageId,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { TurnId } from "@amends-dev/core/turn"
import { Invitation, MemberId } from "@amends-dev/core/workspace"
import type { Store } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { type Bound, forWorkspace, otherWorkspaceId, workspaceId } from "./support.ts"

/** One store's write of a record that names another workspace, and how to look for it after. */
interface Attempt {
  readonly store: string
  readonly write: Effect.Effect<void, unknown, Store.Transaction>
  readonly kept: (on: Bound) => Effect.Effect<Option.Option<unknown>, unknown>
}

/**
 * Every store refuses a record that names another workspace than the one it is bound to, so a
 * workspace's data stays its own whatever a caller asks a store to write. Core relies on this
 * rather than checking each fact's workspace again as it applies it.
 */
describe("workspace isolation", () => {
  const { initialized } = Support
  it.effect("every store refuses a record that names another workspace and keeps none of it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* storage.connect()
        const bound = yield* forWorkspace(host, workspaceId)
        const workspace = yield* initialized(bound)
        const other = yield* forWorkspace(host, otherWorkspaceId)
        const elsewhere = { workspaceId: otherWorkspaceId }
        const now = yield* DateTime.now
        const memberId = workspace.ownerMemberId
        const [assignment] = yield* bound.assignments.listActiveByMember(memberId)
        const role = yield* bound.roles.get(BuiltinRoles.MemberId)
        if (assignment === undefined || Option.isNone(role))
          return yield* Effect.die("An initialized workspace has its owner and roles")
        const threadId = ThreadId.ThreadId.make("foreign-thread")
        const messageId = ThreadMessageId.ThreadMessageId.make("foreign-message")

        const attempts: ReadonlyArray<Attempt> = [
          {
            store: "RoleStore",
            write: bound.roles.insert(
              Object.assign({}, role.value, { id: Role.RoleId.make("foreign-role") }, elsewhere)
            ),
            kept: (on) => on.roles.get(Role.RoleId.make("foreign-role"))
          },
          {
            store: "AssignmentStore",
            write: bound.assignments.insert(
              Object.assign({}, assignment, elsewhere, {
                id: assignment.id.replace(/^/, "foreign-") as typeof assignment.id,
                source: Assignment.Source.isAnyOf(["Role"])(assignment.source)
                  ? Object.assign({}, assignment.source, {
                      scope: { _tag: "Workspace" as const, workspaceId: otherWorkspaceId }
                    })
                  : assignment.source
              })
            ),
            kept: (on) => on.assignments.get(assignment.id.replace(/^/, "foreign-") as typeof assignment.id)
          },
          {
            store: "InvitationStore",
            write: bound.invitations.insert({
              details: {
                id: Invitation.InvitationId.make("foreign-invitation"),
                workspaceId: otherWorkspaceId,
                inviterMemberId: memberId,
                issuedAt: now,
                expiresAt: DateTime.add(now, { hours: 1 }),
                recipientId: Identity.HumanId.make("someone"),
                recipientEmail: "someone@example.com",
                roleId: BuiltinRoles.MemberId
              },
              state: { _tag: "Pending" }
            }),
            kept: (on) => on.invitations.get(Invitation.InvitationId.make("foreign-invitation"))
          },
          {
            store: "ConnectionStore",
            write: bound.connections.insert({
              id: ConnectionContract.ConnectionId.make("foreign-connection"),
              workspaceId: otherWorkspaceId,
              integration: "test-models",
              name: "Foreign",
              settings: {},
              auth: "none",
              status: "active",
              createdBy: memberId,
              createdAt: now
            }),
            kept: (on) => on.connections.get(ConnectionContract.ConnectionId.make("foreign-connection"))
          },
          {
            store: "AgentStore",
            write: bound.agents.insert({
              id: Identity.AgentId.make("foreign-agent"),
              workspaceId: otherWorkspaceId,
              memberId: MemberId.MemberId.make("foreign-agent-member"),
              instructions: "",
              harness: { _tag: "Auto" },
              model: { connectionId: ConnectionContract.ConnectionId.make("foreign-connection"), id: "model" },
              sandbox: null,
              createdBy: memberId,
              createdAt: now
            }),
            kept: (on) => on.agents.get(Identity.AgentId.make("foreign-agent"))
          },
          {
            store: "TurnStore",
            write: bound.turns.insert({
              id: TurnId.TurnId.make("foreign-turn"),
              workspaceId: otherWorkspaceId,
              groupId: Group.GeneralId,
              threadId,
              agentId: Identity.AgentId.make("foreign-agent"),
              memberId: MemberId.MemberId.make("foreign-agent-member"),
              participationId: ThreadParticipationId.ThreadParticipationId.make("foreign-participation"),
              retry: null,
              status: "queued",
              acceptedThroughSequence: 1,
              logAfter: null,
              selection: null,
              messageIds: [],
              failure: null,
              cancelReason: null,
              createdAt: now,
              startedAt: null,
              finishedAt: null
            }),
            kept: (on) => on.turns.get(TurnId.TurnId.make("foreign-turn"))
          },
          {
            store: "TaskStore",
            write: bound.tasks.insert({
              threadId,
              workspaceId: otherWorkspaceId,
              groupId: Group.GeneralId,
              status: "triage",
              priority: "none",
              assignee: null,
              createdBy: { _tag: "Member", memberId },
              createdAt: now
            }),
            kept: (on) => on.tasks.get(threadId)
          },
          {
            store: "ChannelStore",
            write: bound.channels.insert({
              id: ChannelId.ChannelId.make("foreign-channel"),
              workspaceId: otherWorkspaceId,
              connectionId: ConnectionContract.ConnectionId.make("connection"),
              groupId: Group.GeneralId,
              name: "Foreign",
              opensTasks: true,
              status: "active",
              createdBy: memberId,
              createdAt: now
            }),
            kept: (on) => on.channels.get(ChannelId.ChannelId.make("foreign-channel"))
          },
          {
            store: "ChannelBindingStore",
            write: bound.channelBindings.insert({
              threadId,
              workspaceId: otherWorkspaceId,
              channelId: ChannelId.ChannelId.make("channel"),
              groupId: Group.GeneralId,
              conversation: { id: "conversation", details: {} },
              boundAt: now
            }),
            kept: (on) => on.channelBindings.get(threadId)
          },
          {
            store: "ContactStore",
            write: bound.contacts.insert({
              id: Identity.ContactId.make("foreign-contact"),
              workspaceId: otherWorkspaceId,
              channelId: ChannelId.ChannelId.make("channel"),
              externalId: "someone",
              name: "Someone",
              createdAt: now
            }),
            kept: (on) => on.contacts.get(Identity.ContactId.make("foreign-contact"))
          },
          {
            store: "DeliveryStore",
            write: bound.deliveries.insert(
              Delivery.requested({
                id: DeliveryId.DeliveryId.make("foreign-delivery"),
                workspaceId: otherWorkspaceId,
                channelId: ChannelId.ChannelId.make("channel"),
                threadId,
                groupId: Group.GeneralId,
                conversationId: "conversation",
                messageId,
                sequence: 1,
                requestedAt: now
              })
            ),
            kept: (on) => on.deliveries.get(DeliveryId.DeliveryId.make("foreign-delivery"))
          },
          {
            store: "ThreadMessageStore",
            write: bound.messages.insert({
              id: messageId,
              workspaceId: otherWorkspaceId,
              threadId,
              author: { _tag: "Member", memberId },
              via: null,
              publishedAt: now,
              content: ThreadMessage.published("Hello", [])
            }),
            kept: (on) => on.messages.get(messageId)
          },
          {
            store: "ThreadActivityStore",
            write: bound.activities.insert(
              ThreadActivityKind.makeRecordUnsafe(
                ThreadMessageActivity.Published,
                {
                  id: ThreadActivity.ThreadActivityId.make("foreign-activity"),
                  workspaceId: otherWorkspaceId,
                  threadId,
                  sequence: 1,
                  occurredAt: now
                },
                { messageId }
              )
            ),
            kept: (on) => on.activities.get(ThreadActivity.ThreadActivityId.make("foreign-activity"))
          }
        ]
        for (const attempt of attempts) {
          expect(yield* Effect.flip(bound.store.transaction(attempt.write))).toMatchObject({
            _tag: "StoreError",
            store: attempt.store,
            reason: { _tag: "Rejected", description: expect.stringMatching(/workspace/i) }
          })
          for (const on of [bound, other]) expect(yield* attempt.kept(on)).toEqual(Option.none())
        }
      })
    )
  )
})
