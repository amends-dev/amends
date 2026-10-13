import { Agent } from "@amends-dev/core/agent";
import { BuiltinRoles, Role, Assignment } from "@amends-dev/core/authorization";
import { Channel, Delivery } from "@amends-dev/core/channel";
import { Connection } from "@amends-dev/core/connection";
import { Group } from "@amends-dev/core/group";
import { Identity } from "@amends-dev/core/identity";
import {
  Thread,
  ThreadActivity,
  ThreadActivityKind,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadParticipation,
} from "@amends-dev/core/thread";
import { Turn } from "@amends-dev/core/turn";
import { Invitation, Member } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Store } from "@amends-dev/core/journal";
import * as Support from "./support.ts";
import { type Bound, forWorkspace, otherWorkspaceId, workspaceId } from "./support.ts";
import { withStorage } from "./fixture.ts";

/** One store's write of a record that names another workspace, and how to look for it after. */
interface Attempt {
  readonly store: string;
  readonly write: Effect.Effect<void, unknown, Store.Transaction>;
  readonly kept: (on: Bound) => Effect.Effect<Option.Option<unknown>, unknown>;
}

/**
 * Every store refuses a record that names another workspace than the one it is bound to, so a
 * workspace's data stays its own whatever a caller asks a store to write. Core relies on this
 * rather than checking each fact's workspace again as it applies it.
 */
describe("workspace isolation", () => {
  const { initialized } = Support;
  it.effect("every store refuses a record that names another workspace and keeps none of it", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const host = yield* storage.connect();
        const bound = yield* forWorkspace(host, workspaceId);
        const workspace = yield* initialized(bound);
        const other = yield* forWorkspace(host, otherWorkspaceId);
        const elsewhere = { workspaceId: otherWorkspaceId };
        const now = yield* DateTime.now;
        const memberId = workspace.ownerMemberId;
        const [assignment] = yield* bound.assignments.listActiveByMember(memberId);
        const role = yield* bound.roles.get(BuiltinRoles.MemberId);
        if (assignment === undefined || Option.isNone(role))
          return yield* Effect.die("An initialized workspace has its owner and roles");
        const threadId = Thread.Id.make("foreign-thread");
        const messageId = ThreadMessage.Id.make("foreign-message");

        const attempts: ReadonlyArray<Attempt> = [
          {
            store: "RoleStore",
            write: bound.roles.insert(
              Object.assign({}, role.value, { id: Role.Id.make("foreign-role") }, elsewhere),
            ),
            kept: (on) => on.roles.get(Role.Id.make("foreign-role")),
          },
          {
            store: "AssignmentStore",
            write: bound.assignments.insert(
              Object.assign({}, assignment, elsewhere, {
                id: assignment.id.replace(/^/, "foreign-") as typeof assignment.id,
                source: Assignment.Source.isAnyOf(["Role"])(assignment.source)
                  ? Object.assign({}, assignment.source, {
                      scope: { _tag: "Workspace" as const, workspaceId: otherWorkspaceId },
                    })
                  : assignment.source,
              }),
            ),
            kept: (on) =>
              on.assignments.get(assignment.id.replace(/^/, "foreign-") as typeof assignment.id),
          },
          {
            store: "InvitationStore",
            write: bound.invitations.insert({
              details: {
                id: Invitation.Id.make("foreign-invitation"),
                workspaceId: otherWorkspaceId,
                inviterMemberId: memberId,
                issuedAt: now,
                expiresAt: DateTime.add(now, { hours: 1 }),
                recipientId: Identity.HumanId.make("someone"),
                roleId: BuiltinRoles.MemberId,
              },
              state: { _tag: "Pending" },
            }),
            kept: (on) => on.invitations.get(Invitation.Id.make("foreign-invitation")),
          },
          {
            store: "ConnectionStore",
            write: bound.connections.insert({
              id: Connection.Id.make("foreign-connection"),
              workspaceId: otherWorkspaceId,
              integration: "test-models",
              name: "Foreign",
              settings: {},
              auth: "none",
              status: "active",
              createdBy: memberId,
              createdAt: now,
            }),
            kept: (on) => on.connections.get(Connection.Id.make("foreign-connection")),
          },
          {
            store: "AgentStore",
            write: bound.agents.insert({
              id: Agent.Id.make("foreign-agent"),
              workspaceId: otherWorkspaceId,
              memberId: Member.Id.make("foreign-agent-member"),
              instructions: "",
              harness: { _tag: "Auto" },
              model: { connectionId: Connection.Id.make("foreign-connection"), id: "model" },
              sandbox: null,
              createdBy: memberId,
              createdAt: now,
            }),
            kept: (on) => on.agents.get(Agent.Id.make("foreign-agent")),
          },
          {
            store: "TurnStore",
            write: bound.turns.insert({
              id: Turn.Id.make("foreign-turn"),
              workspaceId: otherWorkspaceId,
              groupId: Group.GeneralId,
              threadId,
              agentId: Identity.AgentId.make("foreign-agent"),
              memberId: Member.Id.make("foreign-agent-member"),
              participationId: ThreadParticipation.Id.make("foreign-participation"),
              retry: null,
              status: "queued",
              acceptedThroughSequence: 1,
              logAfter: 0,
              selection: null,
              messageIds: [],
              failure: null,
              cancelReason: null,
              createdAt: now,
              startedAt: null,
              finishedAt: null,
            }),
            kept: (on) => on.turns.get(Turn.Id.make("foreign-turn")),
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
              createdAt: now,
            }),
            kept: (on) => on.tasks.get(threadId),
          },
          {
            store: "ChannelStore",
            write: bound.channels.insert({
              id: Channel.Id.make("foreign-channel"),
              workspaceId: otherWorkspaceId,
              connectionId: Connection.Id.make("connection"),
              groupId: Group.GeneralId,
              name: "Foreign",
              opensTasks: true,
              status: "active",
              createdBy: memberId,
              createdAt: now,
            }),
            kept: (on) => on.channels.get(Channel.Id.make("foreign-channel")),
          },
          {
            store: "ChannelBindingStore",
            write: bound.channelBindings.insert({
              threadId,
              workspaceId: otherWorkspaceId,
              channelId: Channel.Id.make("channel"),
              groupId: Group.GeneralId,
              conversation: { id: "conversation", details: {} },
              boundAt: now,
            }),
            kept: (on) => on.channelBindings.get(threadId),
          },
          {
            store: "ContactStore",
            write: bound.contacts.insert({
              id: Identity.ContactId.make("foreign-contact"),
              workspaceId: otherWorkspaceId,
              channelId: Channel.Id.make("channel"),
              externalId: "someone",
              name: "Someone",
              createdAt: now,
            }),
            kept: (on) => on.contacts.get(Identity.ContactId.make("foreign-contact")),
          },
          {
            store: "DeliveryStore",
            write: bound.deliveries.insert(
              Delivery.requested({
                id: Delivery.Id.make("foreign-delivery"),
                workspaceId: otherWorkspaceId,
                channelId: Channel.Id.make("channel"),
                threadId,
                groupId: Group.GeneralId,
                conversationId: "conversation",
                messageId,
                sequence: 1,
                requestedAt: now,
              }),
            ),
            kept: (on) => on.deliveries.get(Delivery.Id.make("foreign-delivery")),
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
              content: ThreadMessage.published("Hello", []),
            }),
            kept: (on) => on.messages.get(messageId),
          },
          {
            store: "ThreadActivityStore",
            write: bound.activities.insert(
              ThreadActivityKind.makeRecordUnsafe(
                ThreadMessageActivity.Published,
                {
                  id: ThreadActivity.Id.make("foreign-activity"),
                  workspaceId: otherWorkspaceId,
                  threadId,
                  sequence: 1,
                  occurredAt: now,
                },
                { messageId },
              ),
            ),
            kept: (on) => on.activities.get(ThreadActivity.Id.make("foreign-activity")),
          },
        ];
        for (const attempt of attempts) {
          expect(yield* Effect.flip(bound.store.transaction(attempt.write))).toMatchObject({
            _tag: "StoreError",
            store: attempt.store,
            reason: { _tag: "Rejected", description: expect.stringMatching(/workspace/i) },
          });
          for (const on of [bound, other]) expect(yield* attempt.kept(on)).toEqual(Option.none());
        }
      }),
    ),
  );
});
