import { Notification } from "@amends-dev/core/notification";
import * as Core from "@amends-dev/core";
import { BuiltinRoles, Role, RoleFacts } from "@amends-dev/core/authorization";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import {
  type Checkpoint,
  Fact,
  Journal,
  Log,
  Projection,
  Publication,
  Store,
  Subject,
} from "@amends-dev/core/journal";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipation,
  ThreadParticipationActivity,
} from "@amends-dev/core/thread";
import { InvitationService, Member, MemberPermissions } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import type { Harness } from "./harness.ts";
import {
  alice,
  bob,
  type Bound,
  charlie,
  forWorkspace,
  future,
  journalLog,
  listOldestFirst,
  otherWorkspaceId,
  publishedMessage,
  request,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

const byName = (live: ReadonlyArray<Checkpoint.LiveVersion>) =>
  live.toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

/** Logs across hosts and workspaces, live projections, and rebuilding them from the journal. */
export const journal = (harness: Harness) => {
  const { core, initialized, seed } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: journal`, () => {
    it.live(
      "separate hosts observe live appends; identical log IDs stay isolated by workspace",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const host = yield* storage.connect();
            const a = yield* forWorkspace(host, workspaceId);
            const b = yield* forWorkspace(host, otherWorkspaceId);
            const otherA = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const open = (bound: Bound) =>
              Log.Service.pipe(
                Effect.map((logs) =>
                  logs.open({ id: Log.Id.make("execution"), schema: Schema.String }),
                ),
                Effect.provide(core(bound)),
              );
            const logA = yield* open(a);
            const logB = yield* open(b);
            const writer = yield* open(otherA);
            const first = yield* logA.append("a", { expectedAfter: Option.none() });
            yield* logB.append("b", { expectedAfter: Option.none() });
            expect((yield* logA.read({ limit: 10 }))[0]?.entries[0]?.payload).toBe("a");
            expect((yield* logB.read({ limit: 10 }))[0]?.entries[0]?.payload).toBe("b");
            expect(
              yield* Effect.flip(writer.append("conflict", { expectedAfter: Option.none() })),
            ).toMatchObject({ _tag: "JournalStore.Conflict" });
            const waiting = yield* Deferred.make<void>();
            const watched = {
              ...a,
              context: Context.add(a.context, Store.Service, {
                ...a.store,
                waitForAppend: (id, after) =>
                  Deferred.succeed(waiting, undefined).pipe(
                    Effect.andThen(a.store.waitForAppend(id, after)),
                  ),
              }),
            };
            const reader = yield* open(watched);
            const tail = yield* reader
              .tail({ after: first.position, limit: 1 })
              .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
            yield* Deferred.await(waiting);
            yield* writer.append("from another host", {
              expectedAfter: Option.some(first.position),
            });
            const batches = yield* Fiber.join(tail);
            expect(batches[0]?.entries[0]?.payload).toBe("from another host");
            expect(
              yield* Effect.flip(
                a.store.transaction(a.store.waitForAppend(Log.Id.make("execution"), Option.none())),
              ),
            ).toMatchObject({ _tag: "JournalStore.Failure" });
          }),
        ),
    );

    it.effect(
      "a log's head is its latest batch, per log and workspace, and a transaction sees its own",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const host = yield* storage.connect();
            const a = yield* forWorkspace(host, workspaceId);
            const b = yield* forWorkspace(host, otherWorkspaceId);
            const execution = Log.Id.make("execution");
            const logs = yield* Log.Service.pipe(Effect.provide(core(a)));
            const log = logs.open({ id: execution, schema: Schema.String });
            expect(yield* a.store.head(execution)).toEqual(Option.none());
            const first = yield* log.append("first");
            const second = yield* log.append("second");
            expect(second.position).toBeGreaterThan(first.position);
            expect(yield* a.store.head(execution)).toEqual(Option.some(second.position));
            expect(yield* log.head).toEqual(Option.some(second.position));
            expect(yield* a.store.head(journalLog)).toEqual(Option.none());
            expect(yield* b.store.head(execution)).toEqual(Option.none());
            // A transaction's own append is visible to it before commit, and rolls back with it.
            const staged = yield* Effect.flip(
              logs.commit(
                Effect.gen(function* () {
                  const appended = yield* log.append("staged");
                  expect(yield* a.store.head(execution)).toEqual(Option.some(appended.position));
                  return yield* Effect.fail("rollback" as const);
                }),
              ),
            );
            expect(staged).toBe("rollback");
            expect(yield* a.store.head(execution)).toEqual(Option.some(second.position));
          }),
        ),
    );

    it.effect(
      "replay restores ownership, membership, and recorded roles without regenerating permission bundles",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const workspace = yield* initialized(bound);
            // A recorded policy change must survive replay even when the current template differs.
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal
                .publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId: BuiltinRoles.OwnerId,
                  permissions: [MemberPermissions.Read.name],
                })
                .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId))),
            ).pipe(Effect.provide(core(bound)));
            const roleIds = [
              BuiltinRoles.MemberId,
              BuiltinRoles.AdministratorId,
              BuiltinRoles.OwnerId,
            ];
            const roles = yield* Effect.forEach(roleIds, (id) => bound.roles.get(id));
            const assignments = yield* bound.assignments.listActiveByMember(
              workspace.ownerMemberId,
            );
            yield* storage.discardProjections;
            expect(yield* bound.workspace.get).toEqual(Option.none());
            expect(yield* bound.members.list).toEqual([]);
            yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
              Effect.provide(core(bound)),
            );
            expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
            expect(yield* bound.members.get(workspace.ownerMemberId)).toMatchObject({
              _tag: "Some",
              value: { identity: alice, status: "active" },
            });
            expect(yield* Effect.forEach(roleIds, (id) => bound.roles.get(id))).toEqual(roles);
            expect(assignments).toHaveLength(1);
            expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual(
              assignments,
            );
            expect(yield* bound.store.read(journalLog, { limit: 10 })).toHaveLength(2);
          }),
        ),
    );

    it.effect(
      "projections rebuild in any order to the same read models, each from facts and its own records",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const workspace = yield* initialized(bound);
            const owner = Actor.Value.make({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            const human = Actor.Value.make({
              workspaceId,
              memberId: Member.Id.make("human"),
              identity: bob,
            });
            const agent = Actor.Value.make({
              workspaceId,
              memberId: Member.Id.make("agent"),
              identity: { _tag: "Agent", id: Identity.AgentId.make("agent") },
            });
            yield* seed(bound, [human, agent], [human, agent]);
            const as = <A, E, R>(actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
              program.pipe(
                Effect.provideService(Actor.Service, actor),
                Effect.provide(core(bound)),
              );
            // History that every projection records something from.
            const group = yield* as(
              owner,
              Effect.flatMap(GroupService.Service, (groupService) =>
                groupService.createTeam({
                  name: "Team",
                  memberIds: [owner.memberId, human.memberId, agent.memberId],
                }),
              ),
            );
            yield* as(
              owner,
              Effect.flatMap(GroupFollowService.Service, (groupFollowService) =>
                groupFollowService.follow({ groupId: group.id, memberId: owner.memberId }),
              ),
            );
            const started = yield* as(
              owner,
              Effect.flatMap(ThreadService.Service, (threadService) =>
                threadService.startInGroup({
                  groupId: group.id,
                  text: "Hello",
                  mentions: [owner.memberId, human.memberId, agent.memberId],
                }),
              ),
            );
            const reply = (mentions: ReadonlyArray<Member.Id>) =>
              as(
                owner,
                Effect.flatMap(ThreadMessageService.Service, (threadMessageService) =>
                  threadMessageService.publish({
                    threadId: started.thread.id,
                    text: "Reply",
                    mentions,
                  }),
                ),
              );
            yield* reply([agent.memberId]);
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, agent.memberId),
            );
            yield* as(
              agent,
              Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
                groupMembershipService.leave({ groupId: group.id, membershipId: admission.id }),
              ),
            );
            const expiresAt = yield* future;
            yield* as(
              owner,
              Effect.flatMap(InvitationService.Service, (invitationService) =>
                invitationService.issue(request(expiresAt, charlie.id)),
              ),
            );
            const byId = <A extends { readonly id: string }>(values: ReadonlyArray<A>) =>
              values.toSorted((left, right) => (left.id < right.id ? -1 : 1));
            const actors = [owner, human, agent];
            const snapshot = Effect.gen(function* () {
              const threads = byId(yield* bound.threads.listByGroup(group.id));
              const threadIds = threads.map((thread) => thread.id);
              const activities = yield* Effect.forEach(threadIds, (id) =>
                bound.activities.listByThread(id),
              );
              return {
                workspace: yield* bound.workspace.get,
                members: byId(yield* bound.members.list),
                roles: yield* Effect.forEach(
                  [BuiltinRoles.MemberId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId],
                  (id) => bound.roles.get(id),
                ),
                assignments: yield* Effect.forEach(actors, (actor) =>
                  Effect.map(bound.assignments.listActiveByMember(actor.memberId), byId),
                ),
                invitations: (yield* bound.invitations.list).toSorted((left, right) =>
                  left.details.id < right.details.id ? -1 : 1,
                ),
                groups: yield* bound.groups.getMany([group.id]),
                groupLatest: yield* bound.groups.getLatest([group.id]),
                admissions: yield* bound.groupMemberships.listByGroup(group.id),
                follows: yield* bound.groupFollows.listActiveByGroup(group.id),
                threads,
                threadLatest: yield* bound.threads.getLatest(threadIds),
                participations: yield* Effect.forEach(threadIds, (id) =>
                  bound.participations.listByThread(id),
                ),
                messages: byId(
                  yield* bound.messages.getMany(
                    activities.flat().flatMap((activity) => publishedMessage(activity) ?? []),
                  ),
                ),
                activities,
                notifications: yield* Effect.forEach(actors, (actor) =>
                  listOldestFirst(
                    bound.notifications,
                    Notification.ofMember(actor.memberId, actor.identity),
                    { limit: 100 },
                  ),
                ),
              };
            });
            const live = yield* snapshot;
            expect(live.follows).toHaveLength(1);
            expect(live.invitations).toHaveLength(1);
            expect(live.groupLatest).toHaveLength(1);
            expect(live.threadLatest).toHaveLength(1);
            expect(live.messages).toHaveLength(2);
            // Leaving ended the agent's participation with the departure, not in the thread.
            expect(live.activities.flat().map((activity) => activity.kind)).not.toContain(
              ThreadParticipationActivity.Ended.name,
            );
            expect(
              live.participations
                .flat()
                .filter((p) => ThreadParticipation.memberOf(p.participant) === agent.memberId)
                .map((p) => p.status),
            ).toEqual(["ended"]);
            // Leaving settled the agent's pending notifications.
            expect(live.notifications[2]?.map((notification) => notification.state._tag)).toEqual([
              "Discarded",
              "Discarded",
            ]);
            const rebuild = (projections: ReadonlyArray<(typeof Core.projections)[number]>) =>
              Effect.gen(function* () {
                yield* storage.discardProjections;
                yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
                  Effect.provide(
                    Journal.layer({ logId: journalLog, projections }).pipe(
                      Layer.provideMerge(Log.layer),
                      Layer.provide(Layer.succeedContext(bound.context)),
                    ),
                  ),
                );
                return { state: yield* snapshot, footprint: yield* storage.footprint };
              });
            const registered = yield* rebuild(Core.projections);
            expect(registered.state).toEqual(live);
            // Reversed, each projection rebuilds before those whose records it used to require.
            expect(yield* rebuild(Core.projections.toReversed())).toEqual(registered);
            // The registered journal accepts the rebuilt projections as live.
            yield* reply([]);
          }),
        ),
    );

    it.effect(
      "a new log's first commit makes every registered projection live, and live commits record no progress",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            expect(yield* bound.checkpoints.listLive(journalLog)).toEqual([]);
            yield* initialized(bound);
            const live = yield* bound.checkpoints.listLive(journalLog);
            expect(live.length).toBeGreaterThan(0);
            // Live versions read in binary name order, however they were written.
            const names = live.map(({ name }) => name);
            expect(names).toEqual(names.toSorted((left, right) => (left < right ? -1 : 1)));
            for (const version of live)
              expect(
                yield* bound.checkpoints.get(Object.assign({ logId: journalLog }, version)),
              ).toEqual(Option.none());
          }),
        ),
    );

    it.effect(
      "commits stop while a registered projection isn't live or another runs unregistered, until replay settles both",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            yield* initialized(bound);
            const withCore = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              program.pipe(
                Effect.provideService(Publication.Service, testProvenance(workspaceId)),
                Effect.provide(core(bound)),
              );
            const role = (id: string) =>
              withCore(
                Effect.flatMap(Journal.Service, (journal) =>
                  journal.publish(RoleFacts.Created, {
                    workspaceId,
                    roleId: Role.Id.make(id),
                    name: id,
                    permissions: [],
                  }),
                ),
              );
            const replay = withCore(Effect.flatMap(Journal.Service, (journal) => journal.replay));
            const live = byName(yield* bound.checkpoints.listLive(journalLog));
            // A version live here that this host does not run would miss this host's commits.
            yield* bound.store.transaction(
              bound.checkpoints.setLive(journalLog, [...live, { name: "elsewhere", version: 1 }]),
            );
            expect(yield* Effect.flip(role("blocked"))).toMatchObject({
              _tag: "Projection.Unregistered",
              key: { logId: journalLog, name: "elsewhere", version: 1 },
            });
            yield* replay;
            expect(byName(yield* bound.checkpoints.listLive(journalLog))).toEqual(live);
            yield* role("allowed");
            // Discarded projections are not live, so commits wait for them to be rebuilt.
            yield* storage.discardProjections;
            expect(yield* Effect.flip(role("waiting"))).toMatchObject({
              _tag: "Projection.Behind",
            });
            yield* replay;
            expect(byName(yield* bound.checkpoints.listLive(journalLog))).toEqual(live);
            expect(yield* bound.roles.get(Role.Id.make("allowed"))).toMatchObject({ _tag: "Some" });
            expect(yield* bound.roles.get(Role.Id.make("blocked"))).toEqual(Option.none());
            yield* role("rebuilt");
            expect(yield* bound.roles.get(Role.Id.make("rebuilt"))).toMatchObject({ _tag: "Some" });
          }),
        ),
    );

    it.effect("a projection registered later rebuilds from the log's history, then goes live", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const logId = Log.Id.make("rebuild-conformance");
          const Counted = Fact.make("conformance.counted", {
            subject: () => Subject.make("test", "counted"),
            version: 1,
            payload: Schema.String,
          });
          const applied = new Map<string, number>();
          const counting = (name: string) =>
            Projection.make(name, { version: 1 }).on(Counted, () =>
              Effect.sync(() => applied.set(name, (applied.get(name) ?? 0) + 1)),
            );
          yield* Effect.gen(function* () {
            const original = yield* Journal.make({ logId, projections: [counting("first")] });
            for (const text of ["one", "two", "three"]) yield* original.publish(Counted, text);
            const extended = yield* Journal.make({
              logId,
              projections: [counting("first"), counting("second")],
            });
            expect(yield* Effect.flip(extended.publish(Counted, "early"))).toMatchObject({
              _tag: "Projection.Behind",
              key: { logId, name: "second", version: 1 },
            });
            yield* extended.replay;
            expect(Object.fromEntries(applied)).toEqual({ first: 3, second: 3 });
            expect(byName(yield* bound.checkpoints.listLive(logId))).toEqual([
              { name: "first", version: 1 },
              { name: "second", version: 1 },
            ]);
            yield* extended.publish(Counted, "four");
            expect(Object.fromEntries(applied)).toEqual({ first: 4, second: 4 });
            // Rebuild progress stays where the rebuild ended; the first projection never needed any.
            expect(
              yield* bound.checkpoints.get({ logId, name: "second", version: 1 }),
            ).toMatchObject({ _tag: "Some", value: { position: 2 } });
            expect(yield* bound.checkpoints.get({ logId, name: "first", version: 1 })).toEqual(
              Option.none(),
            );
            // The original journal does not run the new projection, so it can no longer publish.
            expect(yield* Effect.flip(original.publish(Counted, "stale"))).toMatchObject({
              _tag: "Projection.Unregistered",
              key: { logId, name: "second", version: 1 },
            });
          }).pipe(
            Effect.provideService(Publication.Service, testProvenance(workspaceId)),
            Effect.provide(core(bound)),
          );
        }),
      ),
    );

    it.effect("a projection another host retires rebuilds only the commits it missed", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const newerHost = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const olderHost = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const logId = Log.Id.make("retire-conformance");
          const Counted = Fact.make("conformance.counted", {
            subject: () => Subject.make("test", "counted"),
            version: 1,
            payload: Schema.String,
          });
          const applied: Array<string> = [];
          const recording = Projection.make("recording", { version: 1 }).on(Counted, (event) =>
            Effect.sync(() => applied.push(event.payload)),
          );
          const on =
            (bound: Bound) =>
            <A, E, R>(program: Effect.Effect<A, E, R>) =>
              program.pipe(
                Effect.provideService(Publication.Service, testProvenance(workspaceId)),
                Effect.provide(core(bound)),
              );
          const newer = yield* on(newerHost)(Journal.make({ logId, projections: [recording] }));
          const older = yield* on(olderHost)(Journal.make({ logId, projections: [] }));
          yield* on(olderHost)(older.publish(Counted, "one"));
          yield* on(newerHost)(
            Effect.gen(function* () {
              yield* newer.replay;
              yield* newer.commit(
                Effect.andThen(newer.publish(Counted, "two"), newer.publish(Counted, "three")),
              );
            }),
          );
          // The older host boots without the projection, retiring it, and keeps writing.
          yield* on(olderHost)(older.replay);
          expect(yield* olderHost.checkpoints.listLive(logId)).toEqual([]);
          expect(
            yield* olderHost.checkpoints.get({ logId, name: "recording", version: 1 }),
          ).toMatchObject({ _tag: "Some", value: { position: 1, index: 1 } });
          yield* on(olderHost)(older.publish(Counted, "four"));
          yield* on(newerHost)(newer.replay);
          expect(applied).toEqual(["one", "two", "three", "four"]);
          expect(yield* newerHost.checkpoints.listLive(logId)).toEqual([
            { name: "recording", version: 1 },
          ]);
        }),
      ),
    );
  });
};
