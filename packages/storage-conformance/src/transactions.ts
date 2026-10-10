import { BuiltinRoles } from "@amends-dev/core/authorization";

import { Journal, Store } from "@amends-dev/core/journal";

import { WorkspaceInitialization } from "@amends-dev/core/workspace";

import { describe, expect, it } from "@effect/vitest";

import { Context, Deferred, Effect, Fiber, Option, Result } from "effect";

import type { Harness } from "./harness.ts";
import {
  alice,
  bob,
  failingLate,
  forWorkspace,
  journalLog,
  otherWorkspaceId,
  Support,
  workspaceId,
} from "./support.ts";

/** Atomic commits: concurrent writers, rollback, interruption, foreign handles, and work after a commit. */
export const transactions = (harness: Harness) => {
  const { core, initialized } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: transactions`, () => {
    it.effect(
      "initialization commits once under competing requests and never replaces ownership",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const results = yield* Effect.forEach(
              [alice.id, bob.id],
              (creator) => initialized(bound, creator).pipe(Effect.result),
              { concurrency: "unbounded" },
            );
            expect(results.filter((result) => Result.isSuccess(result))).toHaveLength(1);
            expect(results.filter((result) => Result.isFailure(result))).toHaveLength(1);
            const before = yield* bound.workspace.get;
            const log = yield* bound.store.read(journalLog, { limit: 10 });
            expect(yield* Effect.flip(initialized(bound, bob.id))).toMatchObject({
              _tag: "WorkspaceInitialization.AlreadyInitialized",
            });
            expect(yield* bound.workspace.get).toEqual(before);
            expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual(log);
          }),
        ),
    );

    it.effect(
      "a late failure rolls back workspace, membership, roles, assignments, the log, and live projections",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const failure = new Store.Failure({
              operation: "commit",
              cause: "injected late failure",
            });
            const broken = failingLate(bound, failure);
            const footprint = yield* storage.footprint;
            expect(yield* Effect.flip(initialized(broken))).toBe(failure);
            expect(yield* bound.workspace.get).toEqual(Option.none());
            expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
            expect(yield* bound.roles.get(BuiltinRoles.OwnerId)).toEqual(Option.none());
            expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual([]);
            expect(yield* storage.footprint).toBe(footprint);
            const workspace = yield* initialized(bound);
            expect(workspace.createdBy).toBe(alice.id);
          }),
        ),
    );

    it.effect("interruption rolls back initialization and leaves the host usable", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const ready = yield* Deferred.make<void>();
          const program = Effect.gen(function* () {
            const journal = yield* Journal.Service;
            return yield* journal.commit(
              Effect.gen(function* () {
                yield* WorkspaceInitialization.initialize(alice.id, { name: "Test workspace" });
                yield* Deferred.succeed(ready, undefined);
                return yield* Effect.never;
              }),
            );
          }).pipe(Effect.provide(core(bound)));
          const fiber = yield* program.pipe(Effect.forkChild);
          yield* Deferred.await(ready);
          yield* Fiber.interrupt(fiber);
          expect(yield* bound.workspace.get).toEqual(Option.none());
          expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
          expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual([]);
          yield* initialized(bound);
        }),
      ),
    );

    it.effect(
      "work asked to run after a commit runs once it is done, in order, and never after a rollback",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const ran: Array<string> = [];
            const note = (name: string) =>
              Effect.sync(() => {
                ran.push(name);
              });
            const afterCommit = (effect: Effect.Effect<void>) =>
              Effect.flatMap(Store.Transaction, (storeTransaction) =>
                storeTransaction.afterCommit(effect),
              );
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* afterCommit(note("first"));
                yield* afterCommit(note("second"));
                expect(ran).toEqual([]);
              }),
            );
            expect(ran).toEqual(["first", "second"]);
            const rolledBack = yield* Effect.exit(
              bound.store.transaction(
                afterCommit(note("rolled back")).pipe(Effect.andThen(Effect.fail("abandon"))),
              ),
            );
            expect(rolledBack._tag).toBe("Failure");
            expect(ran).toEqual(["first", "second"]);
            // A failure is logged and stops neither the commit nor the work after it, which may
            // commit again, since the workspace is no longer held.
            yield* bound.store.transaction(
              afterCommit(Effect.die("broken")).pipe(
                Effect.andThen(
                  afterCommit(
                    bound.store
                      .transaction(note("committed again"))
                      .pipe(Effect.orDie, Effect.timeout("5 seconds"), Effect.orDie),
                  ),
                ),
              ),
            );
            expect(ran).toEqual(["first", "second", "committed again"]);
            const expired = yield* bound.store.transaction(Store.Transaction);
            expect(yield* Effect.flip(expired.afterCommit(note("late")))).toMatchObject({
              _tag: "JournalStore.Failure",
            });
            expect(ran).toEqual(["first", "second", "committed again"]);
          }),
        ),
    );

    it.effect(
      "workspace stores reject foreign and expired transactions, including escaped native append handles",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const host = yield* storage.connect();
            const a = yield* forWorkspace(host, workspaceId);
            const b = yield* forWorkspace(host, otherWorkspaceId);
            const expired = yield* a.store.transaction(Effect.context<Store.Transaction>());
            expect(
              yield* Effect.flip(a.members.findActive(alice).pipe(Effect.provide(expired))),
            ).toMatchObject({ _tag: "MemberStore.Failure" });
            expect(yield* Effect.flip(a.store.transaction(b.workspace.get))).toMatchObject({
              _tag: "WorkspaceStore.Failure",
            });
            expect(
              yield* Effect.flip(a.store.transaction(b.store.read(journalLog, { limit: 1 }))),
            ).toMatchObject({ _tag: "JournalStore.Failure" });
            const native = Context.get(expired, Store.Transaction);
            expect(
              yield* Effect.flip(
                a.store.transaction(
                  native.append({ logId: journalLog, entries: [{ payload: new Uint8Array([1]) }] }),
                ),
              ),
            ).toMatchObject({ _tag: "JournalStore.Failure" });
            expect(yield* a.store.read(journalLog, { limit: 1 })).toEqual([]);
          }),
        ),
    );

    it.effect(
      "another host's writer reports the busy workspace as contention without retrying",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const a = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const b = yield* forWorkspace(yield* storage.connect({ failFast: true }), workspaceId);
            const ready = yield* Deferred.make<void>();
            const release = yield* Deferred.make<void>();
            const owner = yield* Effect.gen(function* () {
              const journal = yield* Journal.Service;
              return yield* journal.commit(
                Effect.gen(function* () {
                  const record = yield* WorkspaceInitialization.initialize(alice.id, {
                    name: "Test workspace",
                  });
                  yield* Deferred.succeed(ready, undefined);
                  yield* Deferred.await(release);
                  return record;
                }),
              );
            }).pipe(Effect.provide(core(a)), Effect.forkChild);
            yield* Deferred.await(ready);
            expect(yield* Effect.flip(initialized(b, bob.id))).toMatchObject({
              _tag: "JournalStore.Conflict",
            });
            yield* Deferred.succeed(release, undefined);
            const workspace = yield* Fiber.join(owner);
            expect(yield* Effect.flip(initialized(b, bob.id))).toMatchObject({
              _tag: "WorkspaceInitialization.AlreadyInitialized",
            });
            expect(yield* b.workspace.get).toEqual(Option.some(workspace));
          }),
        ),
    );
  });
};
