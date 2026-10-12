import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  Role,
  RoleFacts,
  type Permission,
  type Target,
} from "@amends-dev/core/authorization";
import {
  Group,
  GroupService,
  GroupQuery,
  GroupMembershipService,
  GroupMembershipFacts,
  GroupMembershipStore,
  GroupPermissions,
  GroupMembership,
} from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Notification } from "@amends-dev/core/notification";
import {
  Checkpoint,
  Entry,
  Fact,
  Journal,
  Publication,
  Store,
  Subject,
} from "@amends-dev/core/journal";
import { Member, MemberService, MemberFacts } from "@amends-dev/core/workspace";
import {
  Thread,
  ThreadService,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityKind,
  ThreadActivityResolvers,
  ThreadActivityStore,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadMessageStore,
  ThreadMessageFacts,
  ThreadMessageTimeline,
  ThreadParticipation,
  ThreadParticipationService,
  ThreadParticipationTimeline,
  ThreadPermissions,
  ThreadCommand,
  ThreadQuery,
} from "@amends-dev/core/thread";
import { Gateway } from "@amends-dev/gateway";
import { Cause, Context, DateTime, Effect, Exit, Layer, Option, Schema } from "effect";
import * as Support from "./support.ts";
import {
  type Bound,
  boundTo,
  listOldestFirst,
  otherWorkspaceId,
  placed,
  placedIn,
  replacing,
  runHost,
  testProvenance,
  threadInternals,
  workspaceId,
} from "./support.ts";
import { withStorage } from "./fixture.ts";

/** Thread discovery, metadata, timeline pages, and participant summaries. */

/** A message's text, which a deleted message no longer has. */
const textOf = (message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Content.isAnyOf(["Text"])(message.content) ? message.content.text : null;

const { core, initialized, runGateway } = Support;
describe("thread reads", () => {
  const readerId = Member.Id.make("reader");
  const otherId = Member.Id.make("other");
  const agentId = Member.Id.make("agent");
  const readerIdentity = Identity.MemberReference.cases.Human.make({
    id: Identity.HumanId.make("reader"),
  });
  const identityFor = (id: Member.Id): Identity.MemberReference =>
    id === agentId
      ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
      : { _tag: "Human", id: Identity.HumanId.make(id) };
  const actorFor = (memberId: Member.Id, workspace = workspaceId) =>
    Actor.Actor.of({ workspaceId: workspace, memberId, identity: identityFor(memberId) });
  const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Actor["Service"]) =>
    effect.pipe(Effect.provideService(Actor.Actor, actor));
  const run = <A, E, R>(
    bound: Bound,
    actor: Actor.Actor["Service"],
    effect: Effect.Effect<A, E, R>,
  ) => asActor(effect, actor).pipe(Effect.provide(core(bound)));
  const publish = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
      Effect.provide(core(bound)),
    );
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 100 });
  const get = (id: Thread.Id) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) => threadService.get(id));
  /** Readable threads of a group as records in ID order; listing order has its own test. */
  const list = (id: Group.Id) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      Effect.map(threadService.listInGroup(id, { limit: 100 }), (items) =>
        items.map((item) => item.thread).toSorted((a, b) => (a.id < b.id ? -1 : 1)),
      ),
    );
  const timeline = (id: Thread.Id, options: ThreadActivityStore.ReadOptions = { limit: 10 }) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.readTimeline(id, options),
    );
  const participants = (id: Thread.Id, options: ThreadParticipation.ListOptions = { limit: 100 }) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.listParticipants(id, options),
    );
  const create = (memberIds: ReadonlyArray<Member.Id>, name = "Engineering") =>
    Effect.flatMap(GroupService.GroupService, (groupService) =>
      groupService.createTeam({ name, memberIds }),
    );
  const opening = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ groupId, mentions, text: "Opening proposal" }),
    );
  const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
    Effect.flatMap(opening(groupId, mentions), placed);
  const threadTarget = (threadId: Thread.Id): Target.Reference => ({
    _tag: "Thread",
    workspaceId,
    threadId,
  });
  const grant = (
    bound: Bound,
    memberId: Member.Id,
    permission: Permission.Definition,
    target?: Target.Reference,
  ) =>
    publish(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.publish(AssignmentFacts.Created, {
          workspaceId: bound.store.workspaceId,
          assignmentId: Assignment.Id.make(
            `${memberId}:${permission.name}:${JSON.stringify(target ?? "workspace")}`,
          ),
          memberId,
          source: {
            _tag: "Direct",
            grant: Grant.make(
              permission,
              target === undefined
                ? { _tag: "Workspace", workspaceId: bound.store.workspaceId }
                : { _tag: "Target", target },
            ),
          },
        }),
      ),
    );
  const seed = (bound: Bound) =>
    publish(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.gen(function* () {
            for (const memberId of [readerId, otherId, agentId])
              yield* journal.publish(MemberFacts.Added, {
                workspaceId: bound.store.workspaceId,
                memberId,
                identity: identityFor(memberId),
                name: Member.Name.make(memberId),
              });
          }),
        ),
      ),
    );
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId);
    const workspace = yield* initialized(bound);
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy },
    });
    yield* seed(bound);
    const group = yield* run(bound, owner, create([owner.memberId, readerId, otherId, agentId]));
    const hidden = yield* run(bound, owner, create([otherId], "Private"));
    const first = yield* run(bound, owner, start(group.id, [otherId]));
    // Mentioning every member, the author included, enrolls and notifies them all.
    const second = yield* run(
      bound,
      owner,
      start(group.id, [owner.memberId, readerId, otherId, agentId]),
    );
    yield* grant(bound, otherId, ThreadPermissions.Start, {
      _tag: "Group",
      workspaceId,
      groupId: hidden.id,
    });
    const secret = yield* run(bound, actorFor(otherId), start(hidden.id));
    return {
      bound,
      owner,
      group,
      hidden,
      first,
      second,
      secret,
      reader: actorFor(readerId),
      agent: actorFor(agentId),
    };
  });
  /** Seed nonmonotonic timestamps and canonical activity to isolate pagination behavior. */
  const append = (bound: Bound, thread: Thread.Thread, sequence: number) =>
    publish(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.gen(function* () {
            const time = DateTime.makeUnsafe(10_000 - sequence * 1000);
            const message: ThreadMessage.ThreadMessage = {
              id: ThreadMessage.Id.make(`${thread.id}-message-${sequence}`),
              workspaceId: thread.workspaceId,
              threadId: thread.id,
              author: thread.createdBy,
              via: null,
              publishedAt: time,
              content: ThreadMessage.published(`Message ${sequence}`, []),
            };
            const record = ThreadActivityKind.makeRecordUnsafe(
              ThreadMessageActivity.Published,
              {
                id: ThreadActivity.Id.make(`${thread.id}-activity-${sequence}`),
                workspaceId: thread.workspaceId,
                threadId: thread.id,
                sequence,
                occurredAt: time,
              },
              { messageId: message.id },
            );
            yield* journal.publish(
              ThreadMessageFacts.Published,
              Object.assign({ groupId: thread.groupId }, message),
            );
            const recipients = (yield* bound.participations.listByThread(thread.id))
              .filter((p) => p.status === "active")
              .map((p) => {
                const recipient = ThreadParticipation.recipientOf(p.participant);
                // A person's message asks the agents it reaches for work.
                return {
                  participationId: p.id,
                  recipient,
                  requestsWork: Notification.Recipient.isAnyOf(["Agent"])(recipient),
                };
              });
            yield* journal.publish(ThreadActivityFacts.Recorded, {
              groupId: thread.groupId,
              activity: record,
              recipients,
            });
            const activity = yield* ThreadActivityKind.decode(
              ThreadMessageActivity.Published,
              record,
            );
            return { activity, message };
          }),
        ),
      ),
    );

  it.effect(
    "a default Viewer reads a narrowed thread without joining, exposing routing identities, or changing notifications",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, reader, group, first, second } = yield* prepare();
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(AssignmentFacts.Created, {
                  workspaceId,
                  assignmentId: Assignment.Id.make("viewer"),
                  memberId: readerId,
                  source: {
                    _tag: "Role",
                    roleId: BuiltinRoles.MemberId,
                    scope: { _tag: "Workspace", workspaceId },
                  },
                }),
              ),
            );
            const before = yield* history(bound);
            const beforeParts = yield* bound.participations.listByThread(first.thread.id);
            const beforeNotifications = yield* listOldestFirst(
              bound.notifications,
              Notification.ofMember(readerId, readerIdentity),
              {
                limit: 100,
              },
            );
            expect(
              beforeParts.some((p) => ThreadParticipation.memberOf(p.participant) === readerId),
            ).toBe(false);
            expect(yield* run(bound, reader, get(first.thread.id))).toEqual(first.thread);
            expect(yield* run(bound, reader, list(group.id))).toEqual(
              [first.thread, second.thread].toSorted((a, b) => (a.id < b.id ? -1 : 1)),
            );
            expect(yield* run(bound, reader, timeline(first.thread.id))).toEqual([
              { activity: first.activity, message: first.message },
            ]);
            const current = yield* run(bound, reader, participants(first.thread.id));
            expect(
              current.flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? []).sort(),
            ).toEqual(
              beforeParts.flatMap((p) => ThreadParticipation.memberOf(p.participant) ?? []).sort(),
            );
            for (const p of current)
              expect(Object.keys(p).sort()).toEqual(
                [
                  "id",
                  "workspaceId",
                  "threadId",
                  "participant",
                  "joinedAt",
                  "joinedAtSequence",
                ].sort(),
              );
            expect(yield* bound.participations.listByThread(first.thread.id)).toEqual(beforeParts);
            expect(
              yield* listOldestFirst(
                bound.notifications,
                Notification.ofMember(readerId, readerIdentity),
                { limit: 100 },
              ),
            ).toEqual(beforeNotifications);
            expect(yield* history(bound)).toEqual(before);
          }),
        ),
      ),
  );

  it.effect(
    "exact thread grants filter discovery and suffice without group-read, member-read, participation, or agent-use grants",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, reader, agent, group, first, second } = yield* prepare();
            expect(yield* run(bound, reader, list(group.id))).toEqual([]);
            expect(yield* Effect.flip(run(bound, reader, get(first.thread.id)))).toMatchObject({
              _tag: "Authorization.Denied",
              requirement: { permission: { name: "thread.read" } },
            });
            yield* grant(bound, readerId, GroupPermissions.Read);
            expect(yield* Effect.flip(run(bound, reader, timeline(first.thread.id)))).toMatchObject(
              {
                _tag: "Authorization.Denied",
              },
            );
            const assignment = yield* grant(
              bound,
              readerId,
              ThreadPermissions.Read,
              threadTarget(first.thread.id),
            );
            yield* grant(bound, agentId, ThreadPermissions.Read, threadTarget(first.thread.id));
            expect(yield* run(bound, reader, list(group.id))).toEqual([first.thread]);
            expect(yield* run(bound, agent, timeline(first.thread.id))).toHaveLength(1);
            expect(yield* run(bound, agent, participants(first.thread.id))).toHaveLength(2);
            expect(yield* Effect.flip(run(bound, reader, get(second.thread.id)))).toMatchObject({
              _tag: "Authorization.Denied",
            });
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(AssignmentFacts.Revoked, {
                  workspaceId,
                  assignmentId: assignment.payload.assignmentId,
                  memberId: assignment.payload.memberId,
                }),
              ),
            );
            expect(yield* run(bound, reader, list(group.id))).toEqual([]);
          }),
        ),
      ),
  );

  it.effect(
    "ownership, group management, and broad read grants cannot bypass the audience or reveal private thread metadata",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, reader, hidden, secret, first } = yield* prepare();
            yield* grant(bound, readerId, ThreadPermissions.Read);
            for (const actor of [owner, reader])
              for (const id of [secret.thread.id, Thread.Id.make("missing")]) {
                const calls: ReadonlyArray<
                  Effect.Effect<
                    unknown,
                    ThreadService.ReadError,
                    ThreadService.ThreadService | Actor.Actor
                  >
                > = [get(id), timeline(id), participants(id)];
                for (const call of calls)
                  expect(yield* Effect.flip(run(bound, actor, call))).toEqual(
                    new ThreadService.NotFound({ threadId: id }),
                  );
              }
            expect(yield* Effect.flip(run(bound, owner, list(hidden.id)))).toEqual(
              new ThreadService.GroupNotFound({ groupId: hidden.id }),
            );
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId: BuiltinRoles.OwnerId,
                  permissions: [],
                }),
              ),
            );
            expect(yield* Effect.flip(run(bound, owner, get(first.thread.id)))).toMatchObject({
              _tag: "Authorization.Denied",
            });
          }),
        ),
      ),
  );

  it.effect(
    "a view opens at the newest activity and pages back to the first, always oldest first",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first } = yield* prepare();
            const opening = { activity: first.activity, message: first.message };
            const added = [opening];
            for (const sequence of [2, 3, 4, 5])
              added.push(yield* append(bound, first.thread, sequence));
            const read = (options: ThreadActivityStore.ReadOptions) =>
              run(bound, owner, timeline(first.thread.id, options));
            expect(yield* read({ limit: 2, from: "newest" })).toEqual(added.slice(3));
            expect(yield* read({ limit: 2, from: "newest", beforeSequence: 4 })).toEqual(
              added.slice(1, 3),
            );
            expect(yield* read({ limit: 2, from: "newest", beforeSequence: 2 })).toEqual([opening]);
            expect(yield* read({ limit: 2, from: "newest", beforeSequence: 1 })).toEqual([]);
            // A range between two sequences, from either end.
            expect(yield* read({ afterSequence: 1, beforeSequence: 5, limit: 2 })).toEqual(
              added.slice(1, 3),
            );
            expect(
              yield* read({ afterSequence: 1, beforeSequence: 5, limit: 2, from: "newest" }),
            ).toEqual(added.slice(2, 4));
            // More than the thread holds returns all of it, still oldest first.
            expect(yield* read({ limit: 50, from: "newest" })).toEqual(added);
            for (const options of [
              { limit: 2, beforeSequence: 0 },
              { limit: 2, afterSequence: 3, beforeSequence: 3 },
              { limit: 2, from: "latest" },
            ]) {
              expect(
                yield* Effect.flip(run(bound, owner, timeline(first.thread.id, options as never))),
              ).toMatchObject({ _tag: "SchemaError" });
              expect(
                yield* Effect.flip(bound.activities.readPage(first.thread.id, options as never)),
              ).toMatchObject({ _tag: "ThreadActivityStore.Failure" });
            }
          }),
        ),
      ),
  );

  it.effect(
    "timeline pages follow sequence rather than timestamps, with exclusive cursors and no repeats across later appends",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first, second } = yield* prepare();
            const added = [];
            for (const sequence of [2, 3, 4])
              added.push(yield* append(bound, first.thread, sequence));
            expect(
              DateTime.isGreaterThan(
                added[0]?.activity.occurredAt ?? first.activity.occurredAt,
                added[1]?.activity.occurredAt ?? first.activity.occurredAt,
              ),
            ).toBe(true);
            const page1 = yield* run(bound, owner, timeline(first.thread.id, { limit: 2 }));
            expect(page1).toEqual([{ activity: first.activity, message: first.message }, added[0]]);
            const page2 = yield* run(
              bound,
              owner,
              timeline(first.thread.id, { afterSequence: 2, limit: 2 }),
            );
            expect(page2).toEqual(added.slice(1));
            expect(
              yield* run(bound, owner, timeline(first.thread.id, { afterSequence: 4, limit: 2 })),
            ).toEqual([]);
            const fifth = yield* append(bound, first.thread, 5);
            expect(
              yield* run(bound, owner, timeline(first.thread.id, { afterSequence: 4, limit: 2 })),
            ).toEqual([fifth]);
            expect(
              yield* run(bound, owner, timeline(second.thread.id, { afterSequence: 0, limit: 2 })),
            ).toEqual([{ activity: second.activity, message: second.message }]);
            expect(
              yield* run(bound, owner, timeline(first.thread.id, { afterSequence: 100, limit: 2 })),
            ).toEqual([]);
            expect(
              yield* run(
                bound,
                owner,
                timeline(first.thread.id, {
                  afterSequence: Number.MAX_SAFE_INTEGER,
                  limit: Number.MAX_SAFE_INTEGER,
                }),
              ),
            ).toEqual([]);
            for (const options of [
              { limit: 0 },
              { limit: 1.5 },
              { limit: 2, afterSequence: -1 },
              { limit: 2, afterSequence: 1.5 },
            ]) {
              expect(
                yield* Effect.flip(run(bound, owner, timeline(first.thread.id, options))),
              ).toMatchObject({ _tag: "SchemaError" });
              expect(
                yield* Effect.flip(bound.activities.readPage(first.thread.id, options)),
              ).toMatchObject({ _tag: "ThreadActivityStore.Failure" });
            }
            const foreign = yield* boundTo(otherWorkspaceId);
            expect(yield* foreign.activities.readPage(first.thread.id, { limit: 10 })).toEqual([]);
          }),
        ),
      ),
  );

  it.effect(
    "departures and readmission change access and current participation without restoring old participation",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, reader, group, first, second } = yield* prepare();
            yield* grant(bound, readerId, ThreadPermissions.Read);
            yield* run(
              bound,
              reader,
              Effect.gen(function* () {
                const threadService = yield* ThreadService.ThreadService;
                expect(yield* threadService.get(first.thread.id)).toEqual(first.thread);
                const admission = Option.getOrThrow(
                  yield* bound.groupMemberships.findActive(group.id, readerId),
                );
                yield* Effect.flatMap(
                  GroupMembershipService.GroupMembershipService,
                  (groupMembershipService) =>
                    groupMembershipService.leave({
                      groupId: group.id,
                      membershipId: admission.id,
                    }),
                );
                expect(yield* Effect.flip(threadService.get(first.thread.id))).toEqual(
                  new ThreadService.NotFound({ threadId: first.thread.id }),
                );
                expect(
                  yield* Effect.flip(threadService.listInGroup(group.id, { limit: 100 })),
                ).toMatchObject({
                  _tag: "ThreadService.GroupNotFound",
                });
                yield* asActor(
                  Effect.flatMap(
                    GroupMembershipService.GroupMembershipService,
                    (groupMembershipService) =>
                      groupMembershipService.add({ groupId: group.id, memberId: readerId }),
                  ),
                  owner,
                );
                expect(
                  yield* threadService.readTimeline(first.thread.id, { limit: 10 }),
                ).toHaveLength(1);
                expect(
                  (yield* threadService.listParticipants(second.thread.id, {
                    limit: 100,
                  })).some((p) => ThreadParticipation.memberOf(p.participant) === readerId),
                ).toBe(false);
                yield* asActor(
                  Effect.flatMap(MemberService.MemberService, (memberService) =>
                    memberService.remove(readerId),
                  ),
                  owner,
                );
                const calls: ReadonlyArray<
                  Effect.Effect<unknown, ThreadService.ReadError, Actor.Actor>
                > = [
                  threadService.get(first.thread.id),
                  threadService.listInGroup(group.id, { limit: 100 }),
                  threadService.readTimeline(first.thread.id, { limit: 10 }),
                  threadService.listParticipants(first.thread.id, { limit: 100 }),
                ];
                for (const call of calls)
                  expect(yield* Effect.flip(call)).toMatchObject({
                    _tag: "Authorization.InvalidActor",
                  });
              }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "reads neither open a transaction nor advance checkpoints, and custom-role revocation stays live",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, reader, first, group } = yield* prepare();
            const roleId = Role.Id.make("conversation-reader");
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* journal.publish(RoleFacts.Created, {
                      workspaceId,
                      roleId,
                      name: "Conversation reader",
                      permissions: [ThreadPermissions.Read.name],
                    });
                    yield* journal.publish(AssignmentFacts.Created, {
                      workspaceId,
                      assignmentId: Assignment.Id.make("conversation-reader"),
                      memberId: readerId,
                      source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } },
                    });
                  }),
                ),
              ),
            );
            const before = yield* history(bound);
            const readOnly = {
              ...bound,
              context: bound.context.pipe(
                Context.add(Store.Store, {
                  ...bound.store,
                  transaction: () => Effect.die("Read opened a transaction"),
                }),
                Context.add(Checkpoint.Checkpoint, {
                  ...bound.checkpoints,
                  set: () => Effect.die("Read advanced a checkpoint"),
                }),
              ),
            };
            yield* run(
              readOnly,
              reader,
              Effect.gen(function* () {
                expectTypeOf<
                  Effect.Services<ReturnType<ThreadService.ThreadService["Service"]["get"]>>
                >().toEqualTypeOf<Actor.Actor>();
                expectTypeOf<
                  Effect.Services<
                    ReturnType<ThreadService.ThreadService["Service"]["readTimeline"]>
                  >
                >().toEqualTypeOf<Actor.Actor>();
                yield* get(first.thread.id);
                yield* list(group.id);
                yield* timeline(first.thread.id);
                yield* participants(first.thread.id);
              }),
            );
            expect(yield* history(bound)).toEqual(before);
            yield* run(
              bound,
              reader,
              Effect.gen(function* () {
                const threadService = yield* ThreadService.ThreadService;
                yield* publish(
                  bound,
                  Effect.flatMap(Journal.Journal, (journal) =>
                    journal.publish(RoleFacts.PermissionsChanged, {
                      workspaceId,
                      roleId,
                      permissions: [],
                    }),
                  ),
                );
                expect(yield* Effect.flip(threadService.get(first.thread.id))).toMatchObject({
                  _tag: "Authorization.Denied",
                });
                expect(yield* threadService.listInGroup(group.id, { limit: 100 })).toEqual([]);
              }),
            );
          }),
        ),
      ),
  );

  it.effect(
    "staged message activity, departure, and permission changes are visible inside the caller's transaction",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, reader, group, first } = yield* prepare();
            const assignment = yield* grant(bound, readerId, ThreadPermissions.Read);
            const before = yield* history(bound);
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, readerId),
            );
            const outer = Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  const message: ThreadMessage.ThreadMessage = {
                    id: ThreadMessage.Id.make("staged-message"),
                    workspaceId,
                    threadId: first.thread.id,
                    author: { _tag: "Member", memberId: owner.memberId },
                    via: null,
                    publishedAt: first.message.publishedAt,
                    content: ThreadMessage.published("Staged text", []),
                  };
                  yield* journal.publish(
                    ThreadMessageFacts.Published,
                    Object.assign({ groupId: first.thread.groupId }, message),
                  );
                  yield* journal.publish(ThreadActivityFacts.Recorded, {
                    groupId: first.thread.groupId,
                    activity: ThreadActivityKind.makeRecordUnsafe(
                      ThreadMessageActivity.Published,
                      {
                        id: ThreadActivity.Id.make("staged-activity"),
                        workspaceId,
                        threadId: first.thread.id,
                        sequence: 2,
                        occurredAt: message.publishedAt,
                      },
                      { messageId: message.id },
                    ),
                    recipients: [],
                  });
                  expect(
                    (yield* asActor(timeline(first.thread.id), reader)).map((item) =>
                      "message" in item ? textOf(item.message) : null,
                    ),
                  ).toEqual([textOf(first.message), "Staged text"]);
                  yield* journal.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: assignment.payload.assignmentId,
                    memberId: assignment.payload.memberId,
                  });
                  expect(yield* asActor(list(group.id), reader)).toEqual([]);
                  expect(
                    yield* Effect.flip(asActor(timeline(first.thread.id), reader)),
                  ).toMatchObject({ _tag: "Authorization.Denied" });
                  yield* journal.publish(GroupMembershipFacts.Removed, {
                    workspaceId,
                    groupId: group.id,
                    membershipId: admission.id,
                    memberId: readerId,
                    reason: "removed",
                  });
                  expect(yield* Effect.flip(asActor(get(first.thread.id), reader))).toMatchObject({
                    _tag: "ThreadService.NotFound",
                  });
                  return yield* Effect.fail("rollback");
                }).pipe(Publication.withActor),
              ),
            );
            expect(yield* Effect.flip(run(bound, owner, outer))).toBe("rollback");
            expect(yield* history(bound)).toEqual(before);
            expect(yield* run(bound, reader, timeline(first.thread.id))).toEqual([
              { activity: first.activity, message: first.message },
            ]);
          }),
        ),
      ),
  );

  it.effect(
    "new group members can read earlier history without joining or receiving earlier notifications",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, first } = yield* prepare();
            const memberId = Member.Id.make("visitor");
            const identity = Identity.MemberReference.cases.Human.make({
              id: Identity.HumanId.make("visitor"),
            });
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(MemberFacts.Added, {
                  workspaceId,
                  memberId,
                  identity,
                  name: Member.Name.make(identity.id),
                }),
              ),
            );
            yield* grant(bound, memberId, ThreadPermissions.Read);
            const visitor = Actor.Actor.of({ workspaceId, memberId, identity });
            expect(yield* Effect.flip(run(bound, visitor, get(first.thread.id)))).toMatchObject({
              _tag: "ThreadService.NotFound",
            });
            yield* run(
              bound,
              owner,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.add({ groupId: group.id, memberId }),
              ),
            );
            expect(yield* run(bound, visitor, timeline(first.thread.id))).toHaveLength(1);
            expect(
              (yield* run(bound, visitor, participants(first.thread.id))).some(
                (p) => ThreadParticipation.memberOf(p.participant) === memberId,
              ),
            ).toBe(false);
            expect(
              yield* listOldestFirst(
                bound.notifications,
                Notification.ofMember(memberId, identity),
                {
                  limit: 10,
                },
              ),
            ).toEqual([]);
          }),
        ),
      ),
  );

  it.effect(
    "current-participant reads exclude inactive workspace members even with stale active admission projections",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first, second } = yield* prepare();
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId }),
              ),
            );
            expect(
              (yield* run(bound, owner, participants(second.thread.id))).some(
                (p) => ThreadParticipation.memberOf(p.participant) === agentId,
              ),
            ).toBe(false);
            expect(
              yield* Effect.flip(run(bound, actorFor(agentId), get(first.thread.id))),
            ).toMatchObject({ _tag: "Authorization.InvalidActor" });
            const impostor = Actor.Actor.of({
              workspaceId,
              memberId: owner.memberId,
              identity: readerIdentity,
            });
            expect(yield* Effect.flip(run(bound, impostor, get(first.thread.id)))).toMatchObject({
              _tag: "Authorization.InvalidActor",
              reason: "identity-mismatch",
            });
            expect(
              yield* Effect.flip(
                run(bound, actorFor(readerId, otherWorkspaceId), get(first.thread.id)),
              ),
            ).toMatchObject({ _tag: "Authorization.WorkspaceMismatch" });
          }),
        ),
      ),
  );

  it.effect(
    "gateway reads expose not-found and input outcomes while rejecting foreign thread IDs",
    () =>
      withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Gateway;
            const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("owner"), {
              name: "Workspace",
              memberName: "owner",
            });
            const other = yield* gateway.createWorkspace(Identity.HumanId.make("foreign-owner"), {
              name: "Foreign",
              memberName: "foreign-owner",
            });
            const bound = yield* boundTo(workspace.id);
            yield* seed(bound);
            const owner = { _tag: "Human" as const, id: workspace.createdBy };
            const foreignOwner = { _tag: "Human" as const, id: other.createdBy };
            const group = yield* gateway.asMember(
              workspace.id,
              owner,
              create([workspace.ownerMemberId, readerId]),
            );
            const opened = yield* gateway
              .asMember(workspace.id, owner, opening(group.id, [workspace.ownerMemberId]))
              .pipe(Effect.flatMap(placedIn(bound)));
            const foreignGroup = yield* gateway.asMember(
              other.id,
              foreignOwner,
              create([other.ownerMemberId]),
            );
            const foreignThread = yield* gateway.asMember(
              other.id,
              foreignOwner,
              opening(foreignGroup.id),
            );
            expect(
              yield* Effect.flip(
                gateway.asMember(workspace.id, readerIdentity, get(opened.thread.id)),
              ),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            yield* grant(bound, readerId, ThreadPermissions.Read);
            expect(
              yield* gateway.asMember(workspace.id, readerIdentity, get(opened.thread.id)),
            ).toEqual(opened.thread);
            expect(
              yield* gateway.asMember(workspace.id, readerIdentity, timeline(opened.thread.id)),
            ).toEqual([{ activity: opened.activity, message: opened.message }]);
            expect(
              yield* gateway.asMember(workspace.id, readerIdentity, participants(opened.thread.id)),
            ).toHaveLength(1);
            for (const id of [foreignThread.thread.id, Thread.Id.make("missing")])
              expect(
                yield* Effect.flip(gateway.asMember(workspace.id, readerIdentity, get(id))),
              ).toEqual(new ThreadService.NotFound({ threadId: id }));
            expect(
              yield* Effect.flip(
                gateway.asMember(
                  workspace.id,
                  readerIdentity,
                  timeline(opened.thread.id, { limit: 0 }),
                ),
              ),
            ).toMatchObject({ _tag: "GatewayErrors.InvalidInput" });
          }),
        ),
      ),
  );

  it.effect("a storage failure reaches a timeline reader as it is, and records nothing", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, first } = yield* prepare();
          const before = yield* history(bound);
          const failing = {
            ...bound,
            context: Context.add(bound.context, ThreadActivityStore.ThreadActivityStore, {
              ...bound.activities,
              readPage: () =>
                Effect.fail(
                  new ThreadActivityStore.Failure({
                    operation: "readPage",
                    cause: "failed storage",
                  }),
                ),
            }),
          };
          expect(yield* Effect.flip(run(failing, owner, timeline(first.thread.id)))).toMatchObject({
            _tag: "ThreadActivityStore.Failure",
          });
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    ),
  );

  it.effect("batch reads return each stored record once and omit absent or foreign IDs", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group, first, second } = yield* prepare();
          const foreign = yield* boundTo(otherWorkspaceId);
          const byId = <A extends { readonly id: string }>(records: ReadonlyArray<A>) =>
            [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const memberIds = [owner.memberId, agentId, agentId, Member.Id.make("missing")];
          const members = [
            ...Option.toArray(yield* bound.members.get(owner.memberId)),
            ...Option.toArray(yield* bound.members.get(agentId)),
          ];
          expect(byId(yield* bound.members.getMany(memberIds))).toEqual(byId(members));
          const admissions = yield* bound.groupMemberships.listByGroup(group.id);
          const admissionIds = admissions.map((admission) => admission.id);
          expect(
            byId(
              yield* bound.groupMemberships.getMany([
                ...admissionIds,
                GroupMembership.Id.make("missing"),
              ]),
            ),
          ).toEqual(byId(admissions));
          const participations = yield* bound.participations.listByThread(second.thread.id);
          const participationIds = participations.map((participation) => participation.id);
          expect(
            byId(
              yield* bound.participations.getMany([
                ...participationIds,
                ThreadParticipation.Id.make("missing"),
              ]),
            ),
          ).toEqual(byId(participations));
          const messageIds = [second.message.id, first.message.id];
          const messages = [
            ...Option.toArray(yield* bound.messages.get(first.message.id)),
            ...Option.toArray(yield* bound.messages.get(second.message.id)),
          ];
          expect(
            byId(
              yield* bound.messages.getMany([
                ...messageIds,
                first.message.id,
                ThreadMessage.Id.make("missing"),
              ]),
            ),
          ).toEqual(byId(messages));
          expect(messages).toHaveLength(2);
          // A thread's first activity is its opening message; counts are per kind.
          yield* append(bound, first.thread, 2);
          const threadIds = [
            first.thread.id,
            second.thread.id,
            first.thread.id,
            Thread.Id.make("missing"),
          ];
          const openings = [
            ...Option.toArray(yield* bound.activities.get(first.activity.id)),
            ...Option.toArray(yield* bound.activities.get(second.activity.id)),
          ];
          expect(byId(yield* bound.activities.getFirst(threadIds))).toEqual(byId(openings));
          const byThread = (counts: ReadonlyArray<ThreadMessageStore.Count>) =>
            [...counts].sort((a, b) => (a.threadId < b.threadId ? -1 : 1));
          expect(byThread(yield* bound.messages.countByThread(threadIds))).toEqual(
            byThread([
              { threadId: first.thread.id, count: 2 },
              { threadId: second.thread.id, count: 1 },
            ]),
          );
          // A group's threads by start: newest first, equal times in descending ID order.
          const started = (yield* bound.threads.listByGroup(group.id)).toSorted(
            (a, b) =>
              DateTime.toEpochMillis(b.createdAt) - DateTime.toEpochMillis(a.createdAt) ||
              (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
          );
          expect(started).toHaveLength(2);
          expect(yield* bound.threads.listByStart(group.id, { limit: 10 })).toEqual(started);
          const [newest, oldest] = started;
          if (newest === undefined || oldest === undefined)
            return yield* Effect.die("Missing threads");
          expect(yield* bound.threads.listByStart(group.id, { limit: 1 })).toEqual([newest]);
          expect(
            yield* bound.threads.listByStart(group.id, {
              before: { createdAt: newest.createdAt, threadId: newest.id },
              limit: 10,
            }),
          ).toEqual([oldest]);
          for (const empty of [
            bound.members.getMany([]),
            bound.groupMemberships.getMany([]),
            bound.participations.getMany([]),
            bound.messages.getMany([]),
            bound.activities.getFirst([]),
            bound.messages.countByThread([]),
            bound.messages.countByThread([Thread.Id.make("missing")]),
            bound.threads.listByStart(Group.Id.make("missing"), { limit: 10 }),
            foreign.members.getMany(memberIds),
            foreign.groupMemberships.getMany(admissionIds),
            foreign.participations.getMany(participationIds),
            foreign.messages.getMany(messageIds),
            foreign.activities.getFirst(threadIds),
            foreign.messages.countByThread(threadIds),
            foreign.threads.listByStart(group.id, { limit: 10 }),
          ])
            expect(yield* empty).toEqual([]);
        }),
      ),
    ),
  );

  it.effect(
    "current participants page in ID order and are found by participant, active ones only",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, group, hidden, first, second, reader } = yield* prepare();
            const foreign = yield* boundTo(otherWorkspaceId);
            const byId = <A extends { readonly id: string }>(records: ReadonlyArray<A>) =>
              [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            const member = (memberId: Member.Id): ThreadParticipation.Reference => ({
              _tag: "Member",
              memberId,
            });
            const all = () => bound.participations.listByThread(second.thread.id);
            const own = (yield* all()).find(
              (p) => ThreadParticipation.memberOf(p.participant) === readerId,
            );
            if (own === undefined) return yield* Effect.die("Missing participation");
            // The reader leaves the thread: their participation ends and is no longer current.
            yield* run(
              bound,
              reader,
              Effect.flatMap(
                ThreadParticipationService.ThreadParticipationService,
                (threadParticipationService) =>
                  threadParticipationService.unfollow({
                    threadId: second.thread.id,
                    participationId: own.id,
                  }),
              ),
            );
            const active = byId((yield* all()).filter((p) => p.status === "active"));
            expect(active).toHaveLength(3);
            const head = yield* bound.participations.pageActiveByThread(second.thread.id, {
              limit: 2,
            });
            const last = head.at(-1);
            if (last === undefined) return yield* Effect.die("Empty page");
            const tail = yield* bound.participations.pageActiveByThread(second.thread.id, {
              after: last.id,
              limit: 2,
            });
            expect([...head, ...tail]).toEqual(active);
            expect(tail).toHaveLength(1);
            // The operation pages the same way, showing public references.
            const shown = yield* run(bound, owner, participants(second.thread.id, { limit: 2 }));
            const cursor = shown.at(-1)?.id;
            if (cursor === undefined) return yield* Effect.die("Empty page");
            const rest = yield* run(
              bound,
              owner,
              participants(second.thread.id, { after: cursor, limit: 2 }),
            );
            expect([...shown, ...rest]).toEqual(active.map(ThreadParticipation.toSummary));
            const requested = [
              member(owner.memberId),
              member(readerId),
              member(agentId),
              member(Member.Id.make("missing")),
              { _tag: "Triage" as const },
            ];
            expect(
              byId(yield* bound.participations.findActive(second.thread.id, requested)),
            ).toEqual(
              active.filter((p) => ThreadParticipation.memberOf(p.participant) !== otherId),
            );
            for (const empty of [
              bound.participations.findActive(second.thread.id, []),
              bound.participations.findActive(first.thread.id, [member(agentId)]),
              foreign.participations.findActive(second.thread.id, requested),
              foreign.participations.pageActiveByThread(second.thread.id, { limit: 10 }),
            ])
              expect(yield* empty).toEqual([]);
            // Admissions are found for the members asked about, current ones only.
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, readerId),
            );
            yield* run(
              bound,
              owner,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.remove({
                    groupId: group.id,
                    membershipId: admission.id,
                  }),
              ),
            );
            const current = (yield* bound.groupMemberships.listByGroup(group.id)).filter(
              (a) => a.status === "active" && [owner.memberId, agentId].includes(a.memberId),
            );
            expect(current).toHaveLength(2);
            expect(
              byId(
                yield* bound.groupMemberships.findActiveMany(group.id, [
                  owner.memberId,
                  agentId,
                  readerId,
                  Member.Id.make("missing"),
                ]),
              ),
            ).toEqual(byId(current));
            for (const empty of [
              bound.groupMemberships.findActiveMany(group.id, []),
              bound.groupMemberships.findActiveMany(hidden.id, [owner.memberId]),
              foreign.groupMemberships.findActiveMany(group.id, [owner.memberId]),
            ])
              expect(yield* empty).toEqual([]);
          }),
        ),
      ),
  );

  it.effect("participant pages skip lapsed admissions yet fill every page", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group, second } = yield* prepare();
          const before = yield* history(bound);
          const admission = Option.getOrThrow(
            yield* bound.groupMemberships.findActive(group.id, agentId),
          );
          const oldAdmission = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.GroupMembershipStore, {
              ...bound.groupMemberships,
              ...replacing(
                bound.groupMemberships,
                admission.id,
                Option.some(Object.assign({}, admission, { status: "removed" as const })),
              ),
            }),
          };
          expect(
            (yield* run(oldAdmission, owner, participants(second.thread.id))).some(
              (p) => ThreadParticipation.memberOf(p.participant) === agentId,
            ),
          ).toBe(false);
          // Paging one at a time skips the lapsed participant yet fills every page, so reading
          // until an empty page still reaches everyone after it.
          const expected = (yield* run(bound, owner, participants(second.thread.id))).filter(
            (p) => ThreadParticipation.memberOf(p.participant) !== agentId,
          );
          const paged: Array<ThreadParticipation.Summary> = [];
          for (;;) {
            const after = paged.at(-1)?.id;
            const page = yield* run(
              oldAdmission,
              owner,
              participants(
                second.thread.id,
                after === undefined ? { limit: 1 } : { after, limit: 1 },
              ),
            );
            if (page.length === 0) break;
            expect(page).toHaveLength(1);
            paged.push(...page);
          }
          expect(paged).toEqual(expected);
          // With the first participant lapsed, filling a page reads on and stops at its limit.
          const everyone = yield* run(bound, owner, participants(second.thread.id));
          const lapsed = everyone[0];
          if (
            lapsed === undefined ||
            !ThreadParticipation.Reference.isAnyOf(["Member"])(lapsed.participant)
          )
            return yield* Effect.die("Expected a member first");
          const lapsedAdmission = Option.getOrThrow(
            yield* bound.groupMemberships.findActive(group.id, lapsed.participant.memberId),
          );
          const firstLapsed = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.GroupMembershipStore, {
              ...bound.groupMemberships,
              ...replacing(
                bound.groupMemberships,
                lapsedAdmission.id,
                Option.some(Object.assign({}, lapsedAdmission, { status: "removed" as const })),
              ),
            }),
          };
          expect(
            yield* run(firstLapsed, owner, participants(second.thread.id, { limit: 2 })),
          ).toEqual(everyone.slice(1, 3));
          expect(yield* history(bound)).toEqual(before);
        }),
      ),
    ),
  );

  it.effect(
    "a kind defined outside the thread domain records, stores, rebuilds, and reads in timelines",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, first } = yield* prepare();
            // Kinds only this test defines: nothing in the thread domain or storage knows them.
            const Noted = ThreadActivityKind.make("test.noted", {
              version: 1,
              details: Schema.Struct({
                noteId: Schema.NonEmptyString,
                text: Schema.String,
                at: Schema.DateTimeUtcFromString,
                tags: Schema.Array(Schema.String),
              }),
              subject: ({ noteId }) => Subject.make("note", noteId),
              newActivity: false,
            });
            const Pinged = ThreadActivityKind.make("test.pinged", {
              version: 1,
              details: Schema.Struct({ count: Schema.Int }),
              subject: () => Subject.make("thread", first.thread.id),
              occurrence: () => null,
              newActivity: true,
            });
            const Happened = Fact.make("test.activity.happened", {
              version: 1,
              payload: Schema.String,
              subject: () => Subject.make("test", "happened"),
            });
            const record = <K extends ThreadActivityKind.Definition>(
              kind: K,
              details: K["details"]["Type"],
              expectedSequence?: number,
            ) =>
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.commit(
                  Effect.flatMap(ThreadCommand.ThreadCommand, (threadCommand) =>
                    threadCommand.publishActivity({
                      thread: first.thread,
                      occurredAt: DateTime.makeUnsafe("2026-09-24T12:00:00.000Z"),
                      ...(expectedSequence === undefined ? {} : { expectedSequence }),
                      step: () =>
                        Effect.map(journal.publish(Happened, kind.name), (cause) => ({
                          value: undefined,
                          kind,
                          details,
                          recipients: [],
                          cause,
                        })),
                    }),
                  ),
                ),
              ).pipe(
                Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
                Effect.provide(threadInternals.pipe(Layer.provideMerge(core(bound)))),
              );
            const at = DateTime.makeUnsafe("2026-09-24T11:00:00.000Z");
            const note = { noteId: "note-1", text: "Checked", at, tags: ["a", "b"] };
            const latest = yield* bound.threads.getLatest([first.thread.id]);
            const noted = yield* record(Noted, note);
            // Storage keeps the shared shape, with the details in their encoded form.
            const stored = Option.getOrThrow(
              yield* bound.activities.get(noted.event.payload.activity.id),
            );
            expect(stored).toEqual(noted.event.payload.activity);
            expect(stored).toMatchObject({
              kind: "test.noted",
              version: 1,
              subject: "note:note-1",
              newActivity: false,
              details: { noteId: "note-1", at: "2026-09-24T11:00:00.000Z", tags: ["a", "b"] },
            });
            expect((yield* ThreadActivityKind.decode(Noted, stored)).details).toEqual(note);
            // One activity per note, and it does not move the thread's latest activity.
            const before = yield* history(bound);
            expect(yield* Effect.flip(record(Noted, note))).toMatchObject({
              _tag: "Projection.Failure",
            });
            expect(yield* history(bound)).toEqual(before);
            expect(yield* bound.threads.getLatest([first.thread.id])).toEqual(latest);
            // Repeatable activity that counts as new moves it each time.
            yield* record(Pinged, { count: 1 });
            const pinged = yield* record(Pinged, { count: 2 });
            const position = pinged.event.payload.activity.sequence;
            expect(yield* bound.threads.getLatest([first.thread.id])).toMatchObject([
              { sequence: position },
            ]);
            // An expected position records only there.
            expect(yield* Effect.flip(record(Pinged, { count: 3 }, position + 2))).toMatchObject({
              _tag: "ThreadCommand.PositionChanged",
              expected: position + 2,
              actual: position + 1,
            });
            yield* record(Pinged, { count: 3 }, position + 1);
            // Timelines read it through the resolver its owning domain registers.
            const resolver = Effect.succeed({
              kinds: [Noted, Pinged],
              resolve: (
                _thread: Thread.Thread,
                listed: ReadonlyArray<ThreadActivity.ThreadActivity>,
              ) =>
                Effect.forEach(listed, (activity) =>
                  Effect.gen(function* () {
                    const decoded =
                      activity.kind === Noted.name
                        ? yield* ThreadActivityKind.decode(Noted, activity)
                        : yield* ThreadActivityKind.decode(Pinged, activity);
                    // Items of kinds declared here are not in core's item union.
                    return { activity: decoded } as unknown as ThreadActivityKind.Item;
                  }).pipe(Effect.orDie),
                ),
            } satisfies ThreadActivityResolvers.Resolver);
            // Fresh: core builds its own reader, over only the resolvers core registers.
            const reading = Layer.fresh(ThreadQuery.layer).pipe(
              Layer.provide(
                Layer.mergeAll(
                  GroupQuery.layer,
                  ThreadActivityResolvers.layer([
                    ThreadMessageTimeline.resolver,
                    ThreadParticipationTimeline.resolver,
                    resolver,
                  ]),
                ),
              ),
              Layer.provideMerge(core(bound)),
            );
            const items = yield* Effect.flatMap(ThreadQuery.ThreadQuery, (threadQuery) =>
              threadQuery.readTimeline(first.thread.id, { limit: 10 }),
            ).pipe(Effect.provideService(Actor.Actor, owner), Effect.provide(reading));
            expect(items.map((item) => item.activity.kind)).toEqual([
              ThreadMessageActivity.Published.name,
              "test.noted",
              "test.pinged",
              "test.pinged",
              "test.pinged",
            ]);
            expect(items[1]?.activity).toMatchObject({ details: note });
            // A host that registers no resolver for a kind says so rather than guessing.
            const unresolved = yield* Effect.exit(run(bound, owner, timeline(first.thread.id)));
            expect(Exit.isFailure(unresolved) && Cause.squash(unresolved.cause)).toEqual(
              new ThreadActivityResolvers.Unknown({ kind: "test.noted" }),
            );
            // Rebuilding restores the same rows from the recorded facts.
            const rows = yield* bound.activities.listByThread(first.thread.id);
            yield* storage.discardProjections;
            yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect(yield* bound.activities.listByThread(first.thread.id)).toEqual(rows);
          }),
        ),
      ),
  );
});
