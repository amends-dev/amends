import { BuiltinRoles, Role, RoleFacts } from "@amends/core/authorization";
import {
  type Checkpoint,
  Fact,
  Journal,
  Log,
  Projection,
  Publication,
  Store,
  Subject,
} from "@amends/core/journal";
import { MemberPermissions } from "@amends/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Context, Deferred, Effect, Fiber, Option, Schema, Stream } from "effect";
import type { Harness } from "./harness.ts";
import {
  alice,
  type Bound,
  forWorkspace,
  journalLog,
  otherWorkspaceId,
  Support,
  testProvenance,
  workspaceId,
} from "./support.ts";

const byName = (live: ReadonlyArray<Checkpoint.LiveVersion>) =>
  live.toSorted((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

/** Logs across hosts and workspaces, live projections, and rebuilding them from the journal. */
export const journal = (harness: Harness) => {
  const { core, initialized } = Support.make(harness);
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
              BuiltinRoles.ViewerId,
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
      "a new log's first commit makes every registered projection live, and live commits record no progress",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            expect(yield* bound.checkpoints.listLive(journalLog)).toEqual([]);
            yield* initialized(bound);
            const live = yield* bound.checkpoints.listLive(journalLog);
            expect(live.length).toBeGreaterThan(0);
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
  });
};
