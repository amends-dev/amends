import { BuiltinRoles } from "@amends/core/authorization";
import { Entry } from "@amends/core/journal";
import { InvitationApplication, InvitationFacts } from "@amends/core/workspace";
import { Gateway, WorkspaceEvents } from "@amends/gateway";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Deferred, Effect, Exit, Fiber, Option, Stream } from "effect";
import type { Harness } from "./harness.ts";
import { alice, bob, boundTo, forWorkspace, Support, workspaceId } from "./support.ts";

const issue = InvitationApplication.Service.use((invitations) =>
  Effect.flatMap(DateTime.now, (now) =>
    invitations.issue({
      recipientId: bob.id,
      roleId: BuiltinRoles.ViewerId,
      expiresAt: DateTime.add(now, { hours: 1 }),
    }),
  ),
);

/** Publishing committed changes to the host's event bus, and native commit observers. */
export const commitPublication = (harness: Harness) => {
  const { gateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: commit publication`, () => {
    it.effect(
      "gateway operations publish into the host's shared workspace bus after durable projection writes",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const host = yield* storage.connect();
            yield* Effect.gen(function* () {
              const gateway = yield* Gateway.Service;
              const registry = yield* WorkspaceEvents.Service;
              const first = yield* gateway.createWorkspace(alice.id, { name: "First" });
              const second = yield* gateway.createWorkspace(alice.id, { name: "Second" });
              const a = yield* registry.forWorkspace(first.id);
              const b = yield* registry.forWorkspace(second.id);
              const changesA = yield* a.subscribe;
              const changesB = yield* b.subscribe;
              const invitationA = yield* gateway.asMember(first.id, alice, issue);
              const batchesA = yield* changesA.pipe(Stream.take(1), Stream.runCollect);
              expect(batchesA).toHaveLength(1);
              expect(batchesA[0]?.workspaceId).toBe(first.id);
              expect(batchesA[0]?.events.map((event) => event.name)).toEqual([
                InvitationFacts.Issued.name,
              ]);
              const records = yield* boundTo(first.id);
              expect(yield* records.invitations.get(invitationA.details.id)).toEqual(
                Option.some(invitationA),
              );
              const confirmed = batchesA[0];
              if (confirmed === undefined) return yield* Effect.die("Missing committed batch");
              const stored = yield* records.store.get(
                Entry.LogId.make("journal"),
                confirmed.commitId,
              );
              expect(Option.isSome(stored)).toBe(true);
              if (Option.isSome(stored))
                expect(stored.value.entries.map((entry) => entry.id)).toEqual(
                  confirmed.events.map((event) => event.id),
                );
              yield* gateway.asMember(second.id, alice, issue);
              const batchesB = yield* changesB.pipe(Stream.take(1), Stream.runCollect);
              expect(batchesB.map((batch) => batch.workspaceId)).toEqual([second.id]);
              yield* gateway.asMember(
                first.id,
                alice,
                InvitationApplication.Service.use((invitations) => invitations.list),
              );
              const revoked = yield* gateway.asMember(
                first.id,
                alice,
                InvitationApplication.Service.use((invitations) =>
                  invitations.revoke(invitationA.details.id),
                ),
              );
              const nextA = yield* changesA.pipe(Stream.take(1), Stream.runCollect);
              expect(nextA[0]?.events.map((event) => event.name)).toEqual([
                InvitationFacts.Revoked.name,
              ]);
              expect(yield* records.invitations.get(invitationA.details.id)).toEqual(
                Option.some(revoked),
              );
              expect(yield* registry.forWorkspace(first.id)).toBe(a);
            }).pipe(Effect.provide(gateway(host)));
          }),
        ),
    );

    it.effect(
      "native commit observers skip rollback and complete despite a pending cancellation",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const committed = yield* Deferred.make<void>();
            const release = yield* Deferred.make<void>();
            let calls = 0;
            const observer = Effect.gen(function* () {
              // Hold the confirmed-commit boundary open deterministically for this test.
              yield* Deferred.succeed(committed, undefined);
              yield* Deferred.await(release);
              calls++;
            });
            expect(
              yield* Effect.flip(
                bound.store.transaction(Effect.fail("rollback"), { onCommit: observer }),
              ),
            ).toBe("rollback");
            expect(calls).toBe(0);
            const writer = yield* bound.store
              .transaction(Effect.succeed("committed"), { onCommit: observer })
              .pipe(Effect.forkChild);
            yield* Deferred.await(committed);
            const fiberId = yield* Effect.fiberId;
            yield* Effect.sync(() => writer.interruptUnsafe(fiberId));
            yield* Deferred.succeed(release, undefined);
            expect(Exit.hasInterrupts(yield* Fiber.await(writer))).toBe(true);
            expect(calls).toBe(1);
            // The host and workspace transaction remain usable after cancellation.
            expect(yield* bound.store.transaction(Effect.succeed("next"))).toBe("next");
          }),
        ),
    );
  });
};
