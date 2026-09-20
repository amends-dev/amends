import { testProvenance } from "./support.ts";
import { expect, test } from "bun:test";
import { BuiltinRoles, RoleFacts } from "@amends/core/authorization";
import { Journal, Log, Store } from "@amends/core/journal";
import { MemberPermissions } from "@amends/core/workspace";
import { SqliteDatabase } from "../src/index.ts";
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import { SqlClient } from "effect/unstable/sql";

import {
  alice,
  workspaceId,
  otherWorkspaceId,
  type Bound,
  views,
  core,
  inDatabase,
  initialized,
  temporary,
} from "./support.ts";
test("separate connections observe live appends; identical log IDs stay isolated by workspace", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.scoped(
        Effect.gen(function* () {
          const storage = yield* views;
          const a = yield* storage.forWorkspace(workspaceId);
          const b = yield* storage.forWorkspace(otherWorkspaceId);
          const otherContext = yield* Layer.build(SqliteDatabase.layer(filename));
          const otherStorage = yield* views.pipe(Effect.provide(otherContext));
          const otherA = yield* otherStorage.forWorkspace(workspaceId);
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
          yield* writer.append("from another connection", {
            expectedAfter: Option.some(first.position),
          });
          const batches = yield* Fiber.join(tail);
          expect(batches[0]?.entries[0]?.payload).toBe("from another connection");
          expect(
            yield* Effect.flip(
              a.store.transaction(a.store.waitForAppend(Log.Id.make("execution"), Option.none())),
            ),
          ).toMatchObject({ _tag: "JournalStore.Failure" });
        }),
      ),
    );
  }));

test("replay restores ownership, membership, and recorded roles without regenerating permission bundles", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        // A recorded policy change must survive replay even when the current template differs.
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(
            RoleFacts.PermissionsChanged,
            {
              workspaceId,
              roleId: BuiltinRoles.OwnerId,
              permissions: [MemberPermissions.Read.name],
            },
            testProvenance(workspaceId),
          ),
        ).pipe(Effect.provide(core(bound)));
        const roleIds = [BuiltinRoles.ViewerId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId];
        const roles = yield* Effect.forEach(roleIds, (id) => bound.roles.get(id));
        const assignments = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
        const sql = yield* SqlClient.SqlClient;
        // Clear only this temporary test database's read models to exercise recovery.
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM members`;
            yield* sql`DELETE FROM assignments`;
            yield* sql`DELETE FROM roles`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        expect(yield* bound.workspace.get).toEqual(Option.none());
        yield* Effect.gen(function* () {
          yield* (yield* Journal.Service).replay;
        }).pipe(Effect.provide(core(bound)));
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
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toHaveLength(2);
      }),
    );
  }));
