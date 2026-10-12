import type * as Core from "@amends-dev/core";
import {
  Channel,
  ChannelIntake,
  ChannelService,
  DeliveryExecution,
} from "@amends-dev/core/channel";
import { ConnectionService } from "@amends-dev/core/connection";
import { Group, GroupFollowService, GroupService } from "@amends-dev/core/group";
import type { Actor, Identity } from "@amends-dev/core/identity";
import { Notification } from "@amends-dev/core/notification";
import { TaskService } from "@amends-dev/core/task";
import {
  type Thread,
  ThreadMessageService,
  ThreadParticipation,
  ThreadService,
} from "@amends-dev/core/thread";
import { Member, type Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
import {
  alice,
  bob,
  boundTo,
  future,
  request,
  takeDeliveryJobs,
  takePosted,
  takeTurnJobs,
  testTransport,
} from "./support.ts";
import { CoreError } from "@amends-dev/core/error";

const as = <A, E, R extends Core.Operations | Actor.Actor>(
  id: Workspace.Id,
  identity: Identity.MemberReference,
  program: Effect.Effect<A, E, R>,
) => Effect.flatMap(Gateway.Gateway, (gateway) => gateway.asMember(id, identity, program));
/** Run a step of a job service in the workspace, as a host does for what its channels receive. */
const asHost = <A, E>(id: Workspace.Id, program: Effect.Effect<A, E, Core.JobServices>) =>
  Effect.flatMap(Gateway.Gateway, (gateway) => Effect.scoped(gateway.inWorkspace(id, program)));
const intake = <A, E>(
  id: Workspace.Id,
  step: (channelIntake: ChannelIntake.ChannelIntake["Service"]) => Effect.Effect<A, E>,
) => asHost(id, Effect.flatMap(ChannelIntake.ChannelIntake, step));
const deliver = <A, E>(
  id: Workspace.Id,
  step: (deliveryExecution: DeliveryExecution.DeliveryExecution["Service"]) => Effect.Effect<A, E>,
) => asHost(id, Effect.flatMap(DeliveryExecution.DeliveryExecution, step));

/** The external system's conversation, as its transport identifies it. */
const conversation = { id: "conv-1", details: { room: "C1" } };
const customer = { id: "U1", name: "  Dana Customer  " };
const receivedAt = "2026-10-10T12:00:00.000Z";
/** What the system sends the host: a `Received` as JSON, which the test transport reads as is. */
const body = (events: ReadonlyArray<Record<string, unknown>>, answer?: string) =>
  JSON.stringify(answer === undefined ? { events } : { events, answer });
const received = (
  messageId: string,
  text: string,
  options: { readonly sender?: typeof customer; readonly title?: string } = {},
) => ({
  _tag: "MessageReceived",
  conversation,
  messageId,
  sender: options.sender ?? customer,
  text,
  ...(options.title === undefined ? {} : { title: options.title }),
  receivedAt,
});
/** What an intake of the expected kind names, or a failed expectation. */
const opened = (intake: ChannelIntake.Intake | undefined) =>
  intake?._tag === "Opened" || intake?._tag === "Replied"
    ? intake
    : expect.fail(`Expected a thread opened or replied to, not ${intake?._tag}`);
/** Who takes part in the thread, by key. */
const participantsOf = (bound: Support.Bound, threadId: Thread.Id) =>
  Effect.map(bound.participations.listByThread(threadId), (records) =>
    records
      .filter((record) => record.status === "active")
      .map((record) =>
        ThreadParticipation.keyOf(ThreadParticipation.referenceOf(record.participant)),
      )
      .toSorted(),
  );
/** What a recipient was told, by thread sequence, with where each stands. */
const toldOf = (bound: Support.Bound, recipient: Notification.Recipient) =>
  Effect.map(bound.notifications.listLatestByRecipient(recipient, { limit: 20 }), (records) =>
    records
      .map((record) => ({ sequence: record.thread?.sequence ?? 0, state: record.state }))
      .sort((left, right) => left.sequence - right.sequence),
  );

/**
 * Channels: a connection's conversations becoming threads, what their contacts write and what is
 * carried back to them, and the channel operations.
 */
const { runGateway } = Support;
describe("channels", () => {
  /**
   * A workspace owned by alice, who follows its general group, with bob as a member, a connection
   * to the test channels, and a channel over it into the general group that opens tasks.
   */
  const prepare = Effect.gen(function* () {
    const workspace = yield* Operations.createWorkspace(alice.id, Member.Name.make("Alice"));
    const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
    const bobMember = yield* Operations.acceptInvitation(
      workspace.id,
      bob.id,
      invitation.details.id,
    );
    yield* Operations.renameMember(workspace.id, bob, Member.Name.make("Bob"));
    yield* as(
      workspace.id,
      alice,
      Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
        groupFollowService.follow({
          groupId: Group.GeneralId,
          memberId: workspace.ownerMemberId,
        }),
      ),
    );
    const connection = yield* as(
      workspace.id,
      alice,
      Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
        connectionService.create({
          integration: "test-channels",
          name: "Support desk",
          settings: {},
          auth: "none",
        }),
      ),
    );
    const channel = yield* as(
      workspace.id,
      alice,
      Effect.flatMap(ChannelService.ChannelService, (channelService) =>
        channelService.create({
          connectionId: connection.id,
          groupId: Group.GeneralId,
          name: "Support",
          opensTasks: true,
        }),
      ),
    );
    yield* takeTurnJobs(workspace.id);
    yield* takeDeliveryJobs(workspace.id);
    yield* takePosted;
    const bound = yield* boundTo(workspace.id);
    return { workspace, bobMember, connection, channel, bound };
  });

  it.effect(
    "a conversation received opens a bound thread as a task in triage, with its contact and the group's followers, and is received again into nothing",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, channel, bound } = yield* prepare;
            expect(channel).toMatchObject({
              connectionId: expect.any(String),
              groupId: Group.GeneralId,
              name: "Support",
              opensTasks: true,
              status: "active",
              createdBy: workspace.ownerMemberId,
            });
            const first = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: { "x-signature": "ok" },
                body: body(
                  [
                    received("m1", "I cannot log in since this morning.", {
                      title: " Login fails ",
                    }),
                  ],
                  "ack",
                ),
              }),
            );
            expect(first.answer).toBe("ack");
            expect(first.intakes).toMatchObject([{ _tag: "Opened" }]);
            const { threadId, messageId } = opened(first.intakes[0]);
            // The thread is the contact's, titled as the system said, in the channel's group.
            const thread = yield* as(
              workspace.id,
              bob,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.get(threadId),
              ),
            );
            const binding = yield* as(
              workspace.id,
              bob,
              Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                channelService.getBinding(threadId),
              ),
            );
            if (thread.createdBy._tag !== "Contact")
              return expect.fail("Expected a contact's thread");
            const contactId = thread.createdBy.contactId;
            const contacts = yield* bound.contacts.getMany([contactId]);
            expect(thread).toMatchObject({
              groupId: Group.GeneralId,
              title: "Login fails",
              origin: null,
              createdBy: { _tag: "Contact" },
            });
            expect(binding).toEqual({
              threadId,
              workspaceId: workspace.id,
              channelId: channel.id,
              groupId: Group.GeneralId,
              conversation,
              boundAt: thread.createdAt,
            });
            expect(contacts).toMatchObject([
              { id: contactId, channelId: channel.id, externalId: "U1", name: "Dana Customer" },
            ]);
            // The opening message came through the channel, from the contact.
            const message = yield* bound.messages.get(messageId);
            expect(message).toMatchObject(
              Option.some({
                threadId,
                author: { _tag: "Contact", contactId },
                via: { _tag: "Channel", channelId: channel.id, externalMessageId: "m1" },
                content: { _tag: "Text", text: "I cannot log in since this morning." },
              }),
            );
            // It is a task in triage, created by the contact; triage and alice, who follows the
            // group, take part beside the contact, and bob does not.
            const task = yield* as(
              workspace.id,
              bob,
              Effect.flatMap(TaskService.TaskService, (taskService) => taskService.get(threadId)),
            );
            expect(task).toMatchObject({
              status: "triage",
              assignee: null,
              createdBy: { _tag: "Contact", contactId },
            });
            expect(yield* participantsOf(bound, threadId)).toEqual(
              [`Contact:${contactId}`, `Member:${workspace.ownerMemberId}`, "Triage"].toSorted(),
            );
            // Alice is told of the message, triage of the message and the task; the contact,
            // its author, of nothing, so nothing is delivered.
            expect(
              yield* toldOf(bound, Notification.ofMember(workspace.ownerMemberId, alice)),
            ).toEqual([{ sequence: 1, state: { _tag: "Pending" } }]);
            expect(yield* toldOf(bound, { _tag: "Triage" })).toEqual([
              { sequence: 1, state: { _tag: "Pending" } },
              { sequence: 2, state: { _tag: "Pending" } },
            ]);
            expect(yield* toldOf(bound, { _tag: "Contact", id: contactId })).toEqual([]);
            expect(yield* takeDeliveryJobs(workspace.id)).toEqual([]);
            // The system sending the same message again is a retry, and takes in nothing more.
            const again = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: body([received("m1", "I cannot log in since this morning.")]),
              }),
            );
            expect(again.intakes).toEqual([{ _tag: "Ignored", reason: "duplicate" }]);
            expect(yield* bound.activities.listByThread(threadId)).toHaveLength(2);
            // A message with nothing to keep, and a post of our own, are taken in as nothing.
            expect(
              (yield* intake(workspace.id, (channelIntake) =>
                channelIntake.receive(channel.id, {
                  headers: {},
                  body: body([
                    received("m2", "   "),
                    received("m3", "Looking into it", { sender: { id: "bot", name: "Amends" } }),
                  ]),
                }),
              )).intakes,
            ).toEqual([
              { _tag: "Ignored", reason: "empty" },
              { _tag: "Ignored", reason: "echo" },
            ]);
            // A request the transport cannot read is rejected, and one for a channel that does
            // not exist is not found.
            expect(
              yield* Effect.flip(
                intake(workspace.id, (channelIntake) =>
                  channelIntake.receive(channel.id, { headers: {}, body: "not json" }),
                ),
              ),
            ).toMatchObject({ _tag: "CoreError.Invalid", reason: { _tag: "Unverified" } });
            expect(
              yield* Effect.flip(
                intake(workspace.id, (channelIntake) =>
                  channelIntake.receive(Channel.Id.make("missing"), {
                    headers: {},
                    body: body([]),
                  }),
                ),
              ),
            ).toEqual(
              new CoreError.NotFound({ resource: "Channel", id: Channel.Id.make("missing") }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "a member's reply is carried to the conversation by the thread's delivery job, which settles the contact's notification, and the contact's replies, edits, and deletions come back in",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, bobMember, channel, bound } = yield* prepare;
            const first = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: body([received("m1", "Where is my order?")]),
              }),
            );
            const { threadId, messageId } = opened(first.intakes[0]);
            const author = Option.getOrThrow(yield* bound.messages.get(messageId)).author;
            if (author._tag !== "Contact") return expect.fail("Expected a contact's message");
            const contact: Notification.Recipient = { _tag: "Contact", id: author.contactId };
            // Bob, a member of the group, replies; the contact is told, which asks the thread's
            // delivery job to carry it.
            const reply = yield* as(
              workspace.id,
              bob,
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.publish({
                  threadId,
                  text: "It ships tomorrow.",
                  mentions: [],
                }),
              ),
            );
            expect(yield* toldOf(bound, contact)).toEqual([
              { sequence: 3, state: { _tag: "Pending" } },
            ]);
            expect(yield* takeDeliveryJobs(workspace.id)).toEqual([threadId]);
            // The job accepts what the contact was told into one delivery of the message, which
            // settles the notification, and readies it with the text and bob's name.
            const deliveries = yield* deliver(workspace.id, (deliveryExecution) =>
              deliveryExecution.accept(threadId),
            );
            expect(deliveries).toMatchObject([
              {
                channelId: channel.id,
                threadId,
                conversationId: conversation.id,
                messageId: reply.id,
                sequence: 3,
                status: "requested",
                attempts: 0,
              },
            ]);
            const delivery = deliveries[0]!;
            expect(yield* toldOf(bound, contact)).toMatchObject([
              {
                sequence: 3,
                state: { _tag: "Accepted", by: { _tag: "Delivery", deliveryId: delivery.id } },
              },
            ]);
            // Accepting again finds the message delivered already, and nothing new.
            expect(
              yield* deliver(workspace.id, (deliveryExecution) =>
                deliveryExecution.accept(threadId),
              ),
            ).toEqual([delivery]);
            const ready = yield* deliver(workspace.id, (deliveryExecution) =>
              deliveryExecution.start(delivery.id),
            );
            expect(ready).toMatchObject({
              _tag: "Ready",
              delivery,
              conversation,
              outgoing: { text: "It ships tomorrow.", author: "Bob" },
              access: { connection: { integration: "test-channels" }, credential: null },
            });
            // The job posts through the transport and records the id the system gave the message.
            if (ready._tag !== "Ready") return expect.fail("Expected a delivery ready to post");
            const posted = yield* testTransport.post(ready.conversation, ready.outgoing);
            yield* deliver(workspace.id, (deliveryExecution) =>
              deliveryExecution.recordSent(delivery.id, {
                externalMessageId: posted.messageId,
                attempts: 1,
              }),
            );
            expect(yield* takePosted).toMatchObject([
              { conversation, outgoing: { text: "It ships tomorrow.", author: "Bob" } },
            ]);
            expect(yield* bound.deliveries.get(delivery.id)).toMatchObject(
              Option.some({
                status: "sent",
                externalMessageId: posted.messageId,
                attempts: 1,
                failure: null,
              }),
            );
            expect(
              yield* deliver(workspace.id, (deliveryExecution) =>
                deliveryExecution.start(delivery.id),
              ),
            ).toEqual({ _tag: "Idle" });
            expect(yield* bound.deliveries.listRequestedByThread(threadId)).toEqual([]);
            // The system sending our post back is an echo.
            expect(
              (yield* intake(workspace.id, (channelIntake) =>
                channelIntake.receive(channel.id, {
                  headers: {},
                  body: body([
                    received(posted.messageId, "It ships tomorrow.", {
                      sender: { id: "U-amends", name: "Amends" },
                    }),
                  ]),
                }),
              )).intakes,
            ).toEqual([{ _tag: "Ignored", reason: "echo" }]);
            // The contact replies, which tells the members and no contact, then edits and
            // deletes their own message; an edit that changes nothing, and of a message that is
            // not theirs, take in nothing.
            const replied = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: body([received("m2", "Thanks!")]),
              }),
            );
            expect(replied.intakes).toMatchObject([{ _tag: "Replied", threadId }]);
            const contactMessageId = opened(replied.intakes[0]).messageId;
            expect(yield* toldOf(bound, Notification.ofMember(bobMember.id, bob))).toEqual([
              { sequence: 4, state: { _tag: "Pending" } },
            ]);
            expect(yield* takeDeliveryJobs(workspace.id)).toEqual([]);
            const edit = (messageId: string, text: string) => ({
              _tag: "MessageEdited",
              conversation,
              messageId,
              sender: customer,
              text,
              editedAt: receivedAt,
            });
            const edited = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: body([
                  edit("m2", "Thanks a lot!"),
                  edit("m2", "Thanks a lot!"),
                  edit("m-unknown", "Mine now"),
                  {
                    _tag: "MessageDeleted",
                    conversation,
                    messageId: "m2",
                    sender: customer,
                    deletedAt: receivedAt,
                  },
                ]),
              }),
            );
            expect(edited.intakes).toEqual([
              { _tag: "Edited", threadId, messageId: contactMessageId },
              { _tag: "Ignored", reason: "unchanged" },
              { _tag: "Ignored", reason: "unknown" },
              { _tag: "Deleted", threadId, messageId: contactMessageId },
            ]);
            expect(yield* bound.messages.get(contactMessageId)).toMatchObject(
              Option.some({ content: { _tag: "Deleted" } }),
            );
            // A message deleted before its delivery is posted fails the delivery as it stands.
            const late = yield* as(
              workspace.id,
              bob,
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.publish({ threadId, text: "Never mind.", mentions: [] }),
              ),
            );
            const [lateDelivery] = yield* deliver(workspace.id, (deliveryExecution) =>
              deliveryExecution.accept(threadId),
            );
            yield* as(
              workspace.id,
              bob,
              Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
                threadMessageService.delete(late.id),
              ),
            );
            expect(
              yield* deliver(workspace.id, (deliveryExecution) =>
                deliveryExecution.start(lateDelivery!.id),
              ),
            ).toEqual({ _tag: "Idle" });
            expect(yield* bound.deliveries.get(lateDelivery!.id)).toMatchObject(
              Option.some({
                status: "failed",
                failure: "The message was deleted before it was sent.",
                attempts: 0,
              }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "channels are read by members and managed by administrators, and a removed channel receives nothing",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, channel, connection, bound } = yield* prepare;
            const channels = (identity: Identity.MemberReference) =>
              as(
                workspace.id,
                identity,
                Effect.flatMap(
                  ChannelService.ChannelService,
                  (channelService) => channelService.list,
                ),
              );
            expect(yield* channels(bob)).toEqual([channel]);
            expect(
              yield* as(
                workspace.id,
                bob,
                Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                  channelService.get(channel.id),
                ),
              ),
            ).toEqual(channel);
            // A member creates no channel and redirects none; an administrator does both, into a
            // group they belong to, over a connection that gives channels.
            expect(
              yield* Effect.flip(
                as(
                  workspace.id,
                  bob,
                  Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                    channelService.create({
                      connectionId: connection.id,
                      groupId: Group.GeneralId,
                      name: "Sales",
                      opensTasks: false,
                    }),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
            const team = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.createTeam({
                  name: "Sales",
                  memberIds: [workspace.ownerMemberId],
                  visibility: "Private",
                }),
              ),
            );
            expect(
              yield* Effect.flip(
                as(
                  workspace.id,
                  bob,
                  Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                    channelService.redirect({ channelId: channel.id, groupId: team.id }),
                  ),
                ),
              ),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
            const models = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ConnectionService.ConnectionService, (connectionService) =>
                connectionService.create({
                  integration: "test-tools",
                  name: "Tools",
                  settings: {},
                  auth: "none",
                }),
              ),
            );
            expect(
              yield* Effect.flip(
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                    channelService.create({
                      connectionId: models.id,
                      groupId: Group.GeneralId,
                      name: "Sales",
                      opensTasks: false,
                    }),
                  ),
                ),
              ),
            ).toEqual(
              new CoreError.Invalid({
                reason: new CoreError.ConnectionUnusable({ connectionId: models.id }),
              }),
            );
            const redirected = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                channelService.redirect({ channelId: channel.id, groupId: team.id }),
              ),
            );
            expect(redirected).toEqual(Channel.change(channel, { groupId: team.id }));
            // Reading a channel is a permission, not group membership: bob still lists it, and
            // a new conversation opens in Sales, which he cannot read.
            expect(yield* channels(bob)).toEqual([redirected]);
            const inSales = yield* intake(workspace.id, (channelIntake) =>
              channelIntake.receive(channel.id, {
                headers: {},
                body: body([received("m1", "Pricing?")]),
              }),
            );
            const { threadId } = opened(inSales.intakes[0]);
            expect(yield* bound.threads.get(threadId)).toMatchObject(
              Option.some({ groupId: team.id }),
            );
            // A thread that came through no channel has no binding.
            const plain = yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startInGroup({
                  groupId: Group.GeneralId,
                  text: "Hello",
                  mentions: [],
                }),
              ),
            );
            expect(
              yield* Effect.flip(
                as(
                  workspace.id,
                  alice,
                  Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                    channelService.getBinding(plain.thread.id),
                  ),
                ),
              ),
            ).toEqual(new CoreError.NotFound({ resource: "ChannelBinding", id: plain.thread.id }));
            // Removed, the channel is listed no more and receives nothing; its threads stay.
            yield* as(
              workspace.id,
              alice,
              Effect.flatMap(ChannelService.ChannelService, (channelService) =>
                channelService.remove(channel.id),
              ),
            );
            expect(yield* channels(alice)).toEqual([]);
            expect(
              yield* Effect.flip(
                intake(workspace.id, (channelIntake) =>
                  channelIntake.receive(channel.id, { headers: {}, body: body([]) }),
                ),
              ),
            ).toEqual(new CoreError.NotFound({ resource: "Channel", id: channel.id }));
            expect(yield* bound.channelBindings.get(threadId)).toMatchObject(
              Option.some({ channelId: channel.id }),
            );
          }),
        ),
      ),
  );
});
