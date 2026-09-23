import { BuiltinRoles, RoleFacts } from "@amends/core/authorization";
import { Journal, Log, Publication, Store } from "@amends/core/journal";
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

/** Logs across hosts and workspaces, and rebuilding projections from the journal. */
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
  });
};
