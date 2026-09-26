import type * as Core from "@amends/core";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import {
  Assignment,
  AssignmentFacts,
  Grant,
  type Permission,
  type Target,
} from "@amends/core/authorization";
import { Group, GroupApplication, GroupMembershipApplication } from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Entry, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Member, MemberApplication, MemberFacts } from "@amends/core/workspace";
import {
  Notification,
  NotificationApplication,
  NotificationInbox,
  NotificationSource,
  NotificationStore,
} from "@amends/core/notification";
import {
  Thread,
  ThreadApplication,
  ThreadActivity,
  ThreadActivityRecording,
  ThreadActivityStore,
  ThreadActivityReading,
  ThreadMessageStore,
  ThreadMessageApplication,
  ThreadParticipation,
  ThreadParticipationAdmission,
  ThreadParticipationFacts,
  ThreadParticipationActivity,
  ThreadParticipationApplication,
  ThreadParticipationStore,
  ThreadPermissions,
} from "@amends/core/thread";
import { Gateway } from "@amends/gateway";
import { Context, DateTime, Effect, Option } from "effect";
import { TestClock } from "effect/testing";
import {
  type Bound,
  boundTo,
  otherWorkspaceId,
  replacing,
  runHost,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";
import type { Harness } from "./harness.ts";

/** Resolving a notification's source under current access, without writing. */

export const notificationSources = (harness: Harness) => {
  const { core, initialized, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: notification sources`, () => {
    /** Narrow a stored participation to its member participant for assertions. */
    const memberParticipant = (record: ThreadParticipation.Record) => {
      if (record.participant._tag !== "Member") throw new Error("Expected a member participant");
      return record.participant;
    };

    const humanId = Member.Id.make("human");
    const otherId = Member.Id.make("other");
    const agentId = Member.Id.make("agent");
    const identityFor = (id: Member.Id): Identity.MemberReference =>
      id === agentId
        ? { _tag: "Agent", id: Identity.AgentId.make("agent") }
        : { _tag: "Human", id: Identity.HumanId.make(id) };
    const actorFor = (memberId: Member.Id) =>
      Actor.Value.make({ workspaceId, memberId, identity: identityFor(memberId) });
    const asActor = <A, E, R>(effect: Effect.Effect<A, E, R>, actor: Actor.Value) =>
      effect.pipe(Effect.provideService(Actor.Service, actor));
    const run = <A, E, R>(bound: Bound, actor: Actor.Value, effect: Effect.Effect<A, E, R>) =>
      asActor(effect, actor).pipe(Effect.provide(core(bound)));
    const facts = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
        Effect.provide(core(bound)),
      );
    const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 100 });
    const notifications = (bound: Bound, id: Member.Id) =>
      bound.notifications.listByRecipient(Notification.ofMember(id, identityFor(id)), {
        limit: 100,
      });
    const create = (memberIds: ReadonlyArray<Member.Id>) =>
      Effect.flatMap(GroupApplication.Service, (s) =>
        s.createPrivateTeam({ name: "Engineering", memberIds }),
      );
    const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
      Effect.flatMap(ThreadApplication.Service, (s) =>
        s.startInGroup({ groupId, mentions, text: "Opening" }),
      );
    const reply = (threadId: Thread.Id, mentions: ReadonlyArray<Member.Id> = [], text = "Reply") =>
      Effect.flatMap(ThreadMessageApplication.Service, (s) =>
        s.publish({ threadId, mentions, text }),
      );
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
      facts(
        bound,
        Effect.flatMap(Journal.Service, (j) =>
          j.publish(AssignmentFacts.Created, {
            workspaceId: bound.workspace.workspaceId,
            assignmentId: Assignment.Id.make(
              `${memberId}:${permission.name}:${JSON.stringify(target ?? "workspace")}`,
            ),
            memberId,
            source: {
              _tag: "Direct",
              grant: Grant.make(
                permission,
                target === undefined
                  ? { _tag: "Workspace", workspaceId: bound.workspace.workspaceId }
                  : { _tag: "Target", target },
              ),
            },
          }),
        ),
      );
    const seed = (bound: Bound) =>
      facts(
        bound,
        Effect.flatMap(Journal.Service, (j) =>
          j.commit(
            Effect.gen(function* () {
              for (const memberId of [humanId, otherId, agentId])
                yield* j.publish(MemberFacts.Added, {
                  workspaceId: bound.workspace.workspaceId,
                  memberId,
                  identity: identityFor(memberId),
                });
            }),
          ),
        ),
      );
    const prepare = Effect.fnUntraced(function* () {
      const bound = yield* boundTo(workspaceId);
      const workspace = yield* initialized(bound);
      const owner = Actor.Value.make({
        workspaceId,
        memberId: workspace.ownerMemberId,
        identity: { _tag: "Human", id: workspace.createdBy },
      });
      yield* seed(bound);
      const group = yield* run(bound, owner, create([owner.memberId, humanId, agentId]));
      // Mentioning everyone, the author included, enrolls and notifies all three.
      const first = yield* run(bound, owner, start(group.id, [owner.memberId, humanId, agentId]));
      return { bound, owner, group, first, human: actorFor(humanId), agent: actorFor(agentId) };
    });

    const changed = <A extends object>(record: A, changes: Partial<A>): A =>
      Object.assign({}, record, changes);
    const resolve = (id: Notification.Id) =>
      Effect.flatMap(NotificationApplication.Service, (s) => s.resolveSource(id));
    const inboxGet = (id: Notification.Id) =>
      Effect.flatMap(NotificationApplication.Service, (s) => s.get(id));
    const noteFor = Effect.fnUntraced(function* (bound: Bound, id: Member.Id) {
      const note = (yield* notifications(bound, id))[0];
      if (!note) return yield* Effect.die("Missing notification");
      return note;
    });
    const withNote = (bound: Bound, note: Notification.Record): Bound => ({
      ...bound,
      context: Context.add(bound.context, NotificationStore.Service, {
        ...bound.notifications,
        get: () => Effect.succeedSome(note),
      }),
    });
    const snapshot = Effect.fnUntraced(function* (bound: Bound, threadId: Thread.Id) {
      return {
        history: yield* history(bound),
        participants: yield* bound.participations.listByThread(threadId),
        human: yield* notifications(bound, humanId),
        agent: yield* notifications(bound, agentId),
        checkpoint: yield* bound.checkpoints.get({
          logId: Log.Id.make("journal"),
          name: "notifications",
          version: 1,
        }),
      };
    });

    it.effect(
      "humans and agents resolve only authorized source content using a direct read without side effects",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              expectTypeOf<
                Extract<Core.Operations, NotificationSource.Service | ThreadActivityReading.Service>
              >().toEqualTypeOf<never>();
              const { bound, owner, first, human, agent } = yield* prepare();
              for (const actor of [human, agent])
                yield* grant(
                  bound,
                  actor.memberId,
                  ThreadPermissions.Read,
                  threadTarget(first.thread.id),
                );
              const before = yield* snapshot(bound, first.thread.id);
              let lookups = 0;
              const readOnly = {
                ...bound,
                context: Context.add(bound.context, Store.Service, {
                  ...bound.store,
                  transaction: () => Effect.die("Source reads must not open a transaction"),
                  read: () => Effect.die("Source reads must not scan log batches"),
                  readFacts: () => Effect.die("Source reads must not scan journal facts"),
                  getEntry: (logId, entryId) => {
                    lookups++;
                    return bound.store.getEntry(logId, entryId);
                  },
                }),
              };
              for (const actor of [human, agent]) {
                const note = yield* noteFor(bound, actor.memberId);
                const result = yield* run(readOnly, actor, resolve(note.id));
                expect(result).toEqual({ activity: first.activity, message: first.message });
                expect(Object.keys(result).sort()).toEqual(["activity", "message"]);
                expect(result).toEqual(
                  (yield* run(
                    bound,
                    owner,
                    Effect.flatMap(ThreadApplication.Service, (s) =>
                      s.readTimeline(first.thread.id, { limit: 1 }),
                    ),
                  ))[0],
                );
              }
              expect(lookups).toBe(2);
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "notification ownership and active identity are checked before touching source storage",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, human, agent } = yield* prepare();
              const note = yield* noteFor(bound, humanId);
              const protectedBound = {
                ...bound,
                context: Context.add(bound.context, Store.Service, {
                  ...bound.store,
                  getEntry: () => Effect.die("Source must not be read"),
                }),
              };
              for (const actor of [owner, agent])
                expect(
                  yield* Effect.flip(run(protectedBound, actor, resolve(note.id))),
                ).toMatchObject({
                  _tag: "NotificationApplication.NotFound",
                });
              expect(
                yield* Effect.flip(
                  run(protectedBound, human, resolve(Notification.Id.make("missing"))),
                ),
              ).toMatchObject({ _tag: "NotificationApplication.NotFound" });
              expect(
                yield* Effect.flip(
                  run(protectedBound, { ...human, identity: owner.identity }, resolve(note.id)),
                ),
              ).toMatchObject({ _tag: "Authorization.InvalidActor" });
              yield* run(
                bound,
                owner,
                Effect.flatMap(MemberApplication.Service, (s) => s.remove(humanId)),
              );
              expect(
                yield* Effect.flip(run(protectedBound, human, resolve(note.id))),
              ).toMatchObject({
                _tag: "Authorization.InvalidActor",
              });
            }),
          ),
        ),
    );

    it.effect(
      "current grants and group access control historical sources independently of participation",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human } = yield* prepare();
              const note = yield* noteFor(bound, humanId);
              expect(yield* run(bound, human, inboxGet(note.id))).toEqual(note);
              expect(yield* Effect.flip(run(bound, human, resolve(note.id)))).toEqual(
                new NotificationApplication.SourceUnavailable({ notificationId: note.id }),
              );
              const assignment = yield* grant(
                bound,
                humanId,
                ThreadPermissions.Read,
                threadTarget(first.thread.id),
              );
              const service = yield* NotificationApplication.Service.pipe(
                Effect.provide(core(bound)),
              );
              const part = Option.getOrThrow(
                yield* bound.participations.get(
                  note.participationId ?? ThreadParticipation.Id.make("missing"),
                ),
              );
              yield* run(
                bound,
                human,
                Effect.flatMap(ThreadParticipationApplication.Service, (s) =>
                  s.unfollow({ threadId: first.thread.id, participationId: part.id }),
                ),
              );
              expect(yield* asActor(service.resolveSource(note.id), human)).toEqual({
                activity: first.activity,
                message: first.message,
              });
              yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (j) =>
                  j.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: assignment.payload.assignmentId,
                    memberId: assignment.payload.memberId,
                  }),
                ),
              );
              expect(
                yield* Effect.flip(asActor(service.resolveSource(note.id), human)),
              ).toMatchObject({
                _tag: "NotificationApplication.SourceUnavailable",
              });
              yield* grant(bound, humanId, ThreadPermissions.Read);
              yield* run(
                bound,
                human,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(part).groupMembershipId,
                  }),
                ),
              );
              expect(yield* run(bound, human, inboxGet(note.id))).toEqual(note);
              expect(
                yield* Effect.flip(asActor(service.resolveSource(note.id), human)),
              ).toMatchObject({
                _tag: "NotificationApplication.SourceUnavailable",
              });
              yield* run(
                bound,
                owner,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.add({ groupId: group.id, memberId: humanId }),
                ),
              );
              expect(yield* asActor(service.resolveSource(note.id), human)).toEqual({
                activity: first.activity,
                message: first.message,
              });
              expect(yield* bound.participations.get(part.id)).toMatchObject({
                value: { status: "ended" },
              });
              expect(yield* notifications(bound, humanId)).toEqual([note]);
            }),
          ),
        ),
    );

    it.effect(
      "the inbox lists the reader's notifications newest first with the sources they can read",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group, first, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadPermissions.Read);
              yield* TestClock.adjust("1 second");
              const second = yield* run(bound, owner, reply(first.thread.id, [humanId], "Second"));
              const inbox = (options: NotificationInbox.Options) =>
                run(
                  bound,
                  human,
                  Effect.flatMap(NotificationApplication.Service, (s) => s.inbox(options)),
                );
              const [older, newer] = yield* notifications(bound, humanId);
              if (!older || !newer) return yield* Effect.die("Missing notifications");
              expect(yield* inbox({ limit: 10 })).toEqual([
                { notification: newer, source: second },
                {
                  notification: older,
                  source: { activity: first.activity, message: first.message },
                },
              ]);
              expect(
                yield* inbox({
                  limit: 1,
                  before: { recordedAt: newer.recordedAt, id: newer.id },
                }),
              ).toEqual([
                {
                  notification: older,
                  source: { activity: first.activity, message: first.message },
                },
              ]);
              // What the reader saw stays in the inbox and leaves what is pending.
              const seen = yield* run(
                bound,
                human,
                Effect.flatMap(NotificationApplication.Service, (s) => s.acknowledge(older.id)),
              );
              expect((yield* inbox({ limit: 10 })).map((item) => item.notification)).toEqual([
                newer,
                seen,
              ]);
              expect(
                (yield* inbox({ limit: 10, pendingOnly: true })).map((item) => item.notification),
              ).toEqual([newer]);
              // Leaving the group keeps the notifications without what they point to.
              const part = Option.getOrThrow(
                yield* bound.participations.get(
                  newer.participationId ?? ThreadParticipation.Id.make("missing"),
                ),
              );
              yield* run(
                bound,
                human,
                Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                  s.leave({
                    groupId: group.id,
                    membershipId: memberParticipant(part).groupMembershipId,
                  }),
                ),
              );
              expect(yield* inbox({ limit: 10 })).toEqual([
                { notification: newer },
                { notification: seen },
              ]);
              // Nobody else reads this inbox.
              expect(
                yield* run(
                  bound,
                  owner,
                  Effect.flatMap(NotificationApplication.Service, (s) => s.inbox({ limit: 10 })),
                ),
              ).toEqual([]);
            }),
          ),
        ),
    );

    it.effect(
      "discarded agent notifications remain readable history without becoming pending work",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, first, agent } = yield* prepare();
              yield* grant(bound, agentId, ThreadPermissions.Read);
              const note = yield* noteFor(bound, agentId);
              const participationId = note.participationId;
              if (participationId === undefined) return yield* Effect.die("Missing participation");
              yield* run(
                bound,
                agent,
                Effect.flatMap(ThreadParticipationApplication.Service, (s) =>
                  s.unfollow({ threadId: first.thread.id, participationId }),
                ),
              );
              const before = yield* snapshot(bound, first.thread.id);
              expect(yield* run(bound, agent, resolve(note.id))).toEqual({
                activity: first.activity,
                message: first.message,
              });
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              expect((yield* notifications(bound, agentId))[0]?.state).toEqual({
                _tag: "Discarded",
                reason: "participation-ended",
              });
            }),
          ),
        ),
    );

    it.effect(
      "missing or unsupported sources are unavailable and lookups stay scoped to the workspace journal",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, first, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadPermissions.Read);
              const note = yield* noteFor(bound, humanId);
              const nonActivity = (yield* history(bound))
                .flatMap((b) => b.entries)
                .find((e) => e.fact?.name === MemberFacts.Added.name);
              if (!nonActivity) return yield* Effect.die("Missing fixture fact");
              for (const source of [
                { logId: note.source.logId, entryId: Entry.Id.make("missing") },
                { logId: Log.Id.make("another-log"), entryId: note.source.entryId },
                { logId: nonActivity.logId, entryId: nonActivity.id },
              ])
                expect(
                  yield* Effect.flip(
                    run(withNote(bound, changed(note, { source })), human, resolve(note.id)),
                  ),
                ).toMatchObject({ _tag: "NotificationApplication.SourceUnavailable" });
              const entry = Option.getOrThrow(
                yield* bound.store.getEntry(note.source.logId, note.source.entryId),
              );
              const header = entry.fact;
              if (!header) return yield* Effect.die("Missing fact header");
              const context = Context.add(bound.context, Store.Service, {
                ...bound.store,
                getEntry: () =>
                  Effect.succeedSome(changed(entry, { fact: changed(header, { version: 999 }) })),
              });
              expect(
                yield* Effect.flip(run({ ...bound, context }, human, resolve(note.id))),
              ).toMatchObject({ _tag: "NotificationApplication.SourceUnavailable" });
              expect(yield* bound.store.getEntry(Log.Id.make("another-log"), entry.id)).toEqual(
                Option.none(),
              );
              const foreign = yield* boundTo(otherWorkspaceId);
              expect(yield* foreign.store.getEntry(entry.logId, entry.id)).toEqual(Option.none());
              entry.payload.fill(0);
              expect(
                Option.getOrThrow(
                  yield* bound.store.getEntry(note.source.logId, note.source.entryId),
                ).payload,
              ).not.toEqual(entry.payload);
              expect(yield* run(bound, human, resolve(note.id))).toEqual({
                activity: first.activity,
                message: first.message,
              });
            }),
          ),
        ),
    );

    it.effect(
      "notification recipient selection, participation, and source metadata must agree",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, human } = yield* prepare();
              yield* grant(bound, humanId, ThreadPermissions.Read);
              const note = yield* noteFor(bound, humanId);
              const agentNote = yield* noteFor(bound, agentId);
              const badNotes: Array<Notification.Record> = [
                changed(note, { participationId: agentNote.participationId }),
                changed(note, { participationId: ThreadParticipation.Id.make("missing") }),
                changed(note, { recordedAt: DateTime.makeUnsafe(123456) }),
              ];
              const { participationId: _ignored, ...withoutParticipation } = note;
              badNotes.push(withoutParticipation);
              for (const bad of badNotes)
                expect(
                  yield* Effect.flip(run(withNote(bound, bad), human, resolve(note.id))),
                ).toMatchObject({ _tag: "NotificationApplication.InvalidResponse" });
              const original = Option.getOrThrow(
                yield* bound.participations.get(
                  note.participationId ?? ThreadParticipation.Id.make("missing"),
                ),
              );
              for (const participant of [
                changed(original, { id: ThreadParticipation.Id.make("wrong") }),
                changed(original, { workspaceId: otherWorkspaceId }),
                changed(original, { threadId: Thread.Id.make("wrong") }),
                changed(original, { joinedAtSequence: 999 }),
                changed(original, {
                  participant: { ...memberParticipant(original), identity: identityFor(agentId) },
                }),
              ]) {
                const context = Context.add(bound.context, ThreadParticipationStore.Service, {
                  ...bound.participations,
                  get: () => Effect.succeedSome(participant),
                });
                expect(
                  yield* Effect.flip(run({ ...bound, context }, human, resolve(note.id))),
                ).toMatchObject({ _tag: "NotificationApplication.InvalidResponse" });
              }
              const context = Context.add(bound.context, ThreadParticipationStore.Service, {
                ...bound.participations,
                get: () => Effect.succeedNone,
              });
              expect(
                yield* Effect.flip(run({ ...bound, context }, human, resolve(note.id))),
              ).toMatchObject({ _tag: "NotificationApplication.InvalidResponse" });
            }),
          ),
        ),
    );

    it.effect("malformed journal entries and divergent timeline records fail closed", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, first, human } = yield* prepare();
            yield* grant(bound, humanId, ThreadPermissions.Read);
            const note = yield* noteFor(bound, humanId);
            const entry = Option.getOrThrow(
              yield* bound.store.getEntry(note.source.logId, note.source.entryId),
            );
            const header = entry.fact;
            if (!header) return yield* Effect.die("Missing fact header");
            for (const bad of [
              changed(entry, { id: Entry.Id.make("wrong") }),
              changed(entry, { logId: Log.Id.make("wrong") }),
              changed(entry, { payload: new Uint8Array([255]) }),
              changed(entry, {
                fact: changed(header, {
                  provenance: changed(header.provenance, { workspaceId: otherWorkspaceId }),
                }),
              }),
            ]) {
              const context = Context.add(bound.context, Store.Service, {
                ...bound.store,
                getEntry: () => Effect.succeedSome(bad),
              });
              expect(
                yield* Effect.flip(run({ ...bound, context }, human, resolve(note.id))),
              ).toMatchObject({ _tag: "NotificationApplication.InvalidResponse" });
            }
            const stored = Option.getOrThrow(yield* bound.activities.get(first.activity.id));
            for (const activity of [
              Object.assign({}, stored, { id: ThreadActivity.Id.make("wrong") }),
              Object.assign({}, stored, { sequence: 2 }),
            ]) {
              const context = Context.add(bound.context, ThreadActivityStore.Service, {
                ...bound.activities,
                get: () => Effect.succeedSome(activity),
              });
              const error = yield* Effect.flip(run({ ...bound, context }, human, resolve(note.id)));
              expect([
                "NotificationApplication.InvalidResponse",
                "ThreadActivityReading.InvalidResponse",
              ]).toContain(error._tag);
            }
            const missingActivity = Context.add(bound.context, ThreadActivityStore.Service, {
              ...bound.activities,
              get: () => Effect.succeedNone,
            });
            expect(
              yield* Effect.flip(
                run({ ...bound, context: missingActivity }, human, resolve(note.id)),
              ),
            ).toMatchObject({ _tag: "NotificationApplication.InvalidResponse" });
            const wrongMessage = Context.add(bound.context, ThreadMessageStore.Service, {
              ...bound.messages,
              ...replacing(
                bound.messages,
                first.message.id,
                Option.some({ ...first.message, threadId: Thread.Id.make("wrong") }),
              ),
            });
            expect(
              yield* Effect.flip(run({ ...bound, context: wrongMessage }, human, resolve(note.id))),
            ).toMatchObject({ _tag: "ThreadActivityReading.InvalidResponse" });
          }),
        ),
      ),
    );

    it.effect("source failures remain failures and a denied read never loads message content", () =>
      harness.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, human } = yield* prepare();
            const note = yield* noteFor(bound, humanId);
            const guarded = Context.add(bound.context, ThreadMessageStore.Service, {
              ...bound.messages,
              get: () => Effect.die("Message must not be read without permission"),
              getMany: () => Effect.die("Message must not be read without permission"),
            });
            expect(
              yield* Effect.flip(run({ ...bound, context: guarded }, human, resolve(note.id))),
            ).toMatchObject({ _tag: "NotificationApplication.SourceUnavailable" });
            const failure = new Store.Failure({ operation: "getEntry", cause: "injected" });
            const failing = Context.add(bound.context, Store.Service, {
              ...bound.store,
              getEntry: () => Effect.fail(failure),
            });
            expect(
              yield* Effect.flip(run({ ...bound, context: failing }, human, resolve(note.id))),
            ).toBe(failure);
          }),
        ),
      ),
    );

    it.effect(
      "follow and ending sources use the same typed resolver and omit internal identities",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, group } = yield* prepare();
              const first = yield* run(bound, owner, start(group.id, [agentId]));
              const ownerPart = (yield* bound.participations.listByThread(first.thread.id)).find(
                (p) => ThreadParticipation.memberOf(p.participant) === owner.memberId,
              );
              if (!ownerPart) return yield* Effect.die("Missing owner");
              const events = yield* facts(
                bound,
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      const recorder = yield* ThreadActivityRecording.make();
                      const admissions = yield* ThreadParticipationAdmission.make();
                      const occurredAt = yield* DateTime.now;
                      const sequence = yield* recorder.nextSequence(first.thread.id);
                      const admitted = yield* admissions.ensure(
                        first.thread,
                        [{ _tag: "Member", memberId: humanId }],
                        sequence,
                        occurredAt,
                      );
                      const participant = admitted.participants[0];
                      if (!participant) return yield* Effect.die("Missing participant");
                      const recipients = [
                        {
                          participationId: ownerPart.id,
                          recipient: ThreadParticipation.recipientOf(ownerPart.participant),
                          requestsWork: false,
                        },
                      ];
                      const followed = yield* recorder.record({
                        threadId: first.thread.id,
                        sequence,
                        occurredAt,
                        kind: ThreadParticipationActivity.Followed,
                        details: { participationId: participant.id },
                        recipients,
                      });
                      yield* journal
                        .publish(ThreadParticipationFacts.Ended, {
                          workspaceId,
                          groupId: first.thread.groupId,
                          threadId: first.thread.id,
                          participationId: participant.id,
                          reason: "unfollowed",
                        })
                        .pipe(Publication.withOccurredAt(occurredAt));
                      const ended = yield* recorder.record({
                        threadId: first.thread.id,
                        sequence: yield* recorder.nextSequence(first.thread.id),
                        occurredAt,
                        kind: ThreadParticipationActivity.Ended,
                        details: { participationId: participant.id, reason: "unfollowed" },
                        recipients,
                      });
                      return [followed, ended];
                    }),
                  ),
                ),
              );
              const timeline = yield* run(
                bound,
                owner,
                Effect.flatMap(ThreadApplication.Service, (s) =>
                  s.readTimeline(first.thread.id, { limit: 10 }),
                ),
              );
              const notes = yield* bound.notifications.listByRecipient(
                Notification.ofMember(owner.memberId, owner.identity),
                {
                  limit: 100,
                },
              );
              for (const event of events) {
                const note = notes.find((n) => n.source.entryId === event.id);
                if (!note) return yield* Effect.die("Missing source notification");
                const result = yield* run(bound, owner, resolve(note.id));
                expect(result).toEqual(
                  timeline.find((item) => item.activity.id === event.payload.activity.id),
                );
                if (!("participant" in result)) return yield* Effect.die("Wrong source subject");
                expect(Object.keys(result.participant).sort()).toEqual([
                  "id",
                  "joinedAt",
                  "joinedAtSequence",
                  "participant",
                  "threadId",
                  "workspaceId",
                ]);
                expect(Object.keys(result.participant.participant).sort()).toEqual([
                  "_tag",
                  "memberId",
                ]);
              }
            }),
          ),
        ),
    );

    it.effect(
      "source resolution observes staged publication, revocation, and group departure in an outer transaction",
      () =>
        harness.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, owner, first, group, human } = yield* prepare();
              const assignment = yield* grant(bound, humanId, ThreadPermissions.Read);
              const note = yield* noteFor(bound, humanId);
              const before = yield* snapshot(bound, first.thread.id);
              const operation = Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    const result = yield* reply(first.thread.id, [humanId], "Staged reply");
                    const latest = (yield* notifications(bound, humanId)).find(
                      (n) => n.id !== note.id,
                    );
                    if (!latest) return yield* Effect.die("Missing staged notification");
                    expect(yield* asActor(resolve(latest.id), human)).toEqual(result);
                    yield* journal.publish(AssignmentFacts.Revoked, {
                      workspaceId,
                      assignmentId: assignment.payload.assignmentId,
                      memberId: assignment.payload.memberId,
                    });
                    return yield* asActor(resolve(latest.id), human);
                  }).pipe(Publication.withActor),
                ),
              );
              expect(yield* Effect.flip(run(bound, owner, operation))).toMatchObject({
                _tag: "NotificationApplication.SourceUnavailable",
              });
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
              const admission = Option.getOrThrow(
                yield* bound.groupMemberships.findActive(group.id, humanId),
              );
              const leave = Effect.flatMap(Journal.Service, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* asActor(
                      Effect.flatMap(GroupMembershipApplication.Service, (s) =>
                        s.leave({ groupId: group.id, membershipId: admission.id }),
                      ),
                      human,
                    );
                    return yield* asActor(resolve(note.id), human);
                  }),
                ),
              );
              expect(yield* Effect.flip(run(bound, owner, leave))).toMatchObject({
                _tag: "NotificationApplication.SourceUnavailable",
              });
              expect(yield* snapshot(bound, first.thread.id)).toEqual(before);
            }),
          ),
        ),
    );

    it.effect(
      "source references resolve after reopening and gateway exposes source-unavailable without leaking content",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runHost(
                storage,
                Effect.gen(function* () {
                  const { bound, first, human } = yield* prepare();
                  yield* grant(bound, humanId, ThreadPermissions.Read);
                  return { first, human, note: yield* noteFor(bound, humanId) };
                }),
              ),
            );
            yield* runGateway(
              storage,
              Effect.gen(function* () {
                const gateway = yield* Gateway.Service;
                expect(
                  yield* gateway.asMember(
                    workspaceId,
                    saved.human.identity,
                    resolve(saved.note.id),
                  ),
                ).toEqual({ activity: saved.first.activity, message: saved.first.message });
                const bound = yield* boundTo(workspaceId);
                const unavailable = changed(saved.note, {
                  id: Notification.Id.make("missing-source"),
                  source: { logId: Log.Id.make("journal"), entryId: Entry.Id.make("missing") },
                });
                yield* bound.store.transaction(bound.notifications.insert(unavailable));
                expect(
                  yield* Effect.flip(
                    gateway.asMember(workspaceId, saved.human.identity, resolve(unavailable.id)),
                  ),
                ).toMatchObject({ _tag: "NotificationApplication.SourceUnavailable" });
                expect(
                  yield* Effect.flip(
                    gateway.asMember(
                      workspaceId,
                      saved.human.identity,
                      resolve(Notification.Id.make("missing")),
                    ),
                  ),
                ).toMatchObject({ _tag: "NotificationApplication.NotFound" });
                const invalid = { id: saved.note.id };
                Reflect.set(invalid, "id", "");
                expect(
                  yield* Effect.flip(
                    gateway.asMember(workspaceId, saved.human.identity, resolve(invalid.id)),
                  ),
                ).toMatchObject({ _tag: "Gateway.InvalidInput" });
              }),
            );
          }),
        ),
    );
  });
};
