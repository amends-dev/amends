import { Event } from "@amends-dev/core/journal";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { withStorage } from "./fixture.ts";
import * as Operations from "./operations.ts";
import * as Support from "./support.ts";
import { alice, bob, boundTo, forWorkspace, future, journalLog, request } from "./support.ts";

/** Attribution recorded with each operation's facts. */
const { gateway } = Support;
describe("provenance", () => {
  it.effect(
    "bootstrap, acceptance and removal retain truthful attribution after reopening storage",
    () =>
      withStorage((storage) =>
        Effect.gen(function* () {
          const workspace = yield* Effect.scoped(
            Effect.gen(function* () {
              const host = yield* storage.connect();
              return yield* Effect.gen(function* () {
                const workspace = yield* Operations.createWorkspace(alice.id);
                const invitation = yield* Operations.invite(
                  workspace.id,
                  alice,
                  request(yield* future),
                );
                yield* Operations.invite(workspace.id, alice, request(yield* future));
                const member = yield* Operations.acceptInvitation(
                  workspace.id,
                  bob.id,
                  invitation.details.id,
                );
                yield* Operations.removeMember(workspace.id, alice, member.id);
                const bound = yield* boundTo(workspace.id);
                expect(yield* bound.store.read(journalLog, { limit: 10 })).toHaveLength(5);
                return workspace;
              }).pipe(Effect.provide(gateway(host)));
            }),
          );
          const bound = yield* forWorkspace(yield* storage.connect(), workspace.id);
          const batches = yield* bound.store.read(journalLog, { limit: 10 });
          const decoded = yield* Effect.forEach(batches, (batch) =>
            Effect.forEach(batch.entries, (entry) =>
              Effect.map(Event.storageCodec.decode(entry), (event) => ({ ...entry, event })),
            ),
          );
          const [bootstrap, firstInvitation, secondInvitation, acceptance, removal] = decoded;
          if (!bootstrap || !firstInvitation || !secondInvitation || !acceptance || !removal)
            return yield* Effect.die("Missing operation history");
          const groups = [bootstrap, firstInvitation, secondInvitation, acceptance, removal];
          expect(
            new Set(groups.map((group) => group[0]?.event.provenance?.correlationId)).size,
          ).toBe(5);
          for (const group of groups) {
            expect(new Set(group.map(({ event }) => event.provenance?.correlationId)).size).toBe(1);
            for (const { event } of group) expect(event.provenance?.workspaceId).toBe(workspace.id);
          }
          for (const { event } of bootstrap)
            expect(event.provenance).toMatchObject({
              performedBy: { _tag: "Identity", identity: alice },
              causedBy: null,
            });
          for (const group of [firstInvitation, secondInvitation, removal])
            for (const { event } of group)
              expect(event.provenance?.performedBy).toEqual({
                _tag: "Member",
                memberId: workspace.ownerMemberId,
                identity: alice,
              });
          for (const { event } of acceptance)
            expect(event.provenance).toMatchObject({
              performedBy: { _tag: "Identity", identity: bob },
              causedBy: null,
            });
          // The removal, the member's departure from the general group, then the revocation.
          const [removed, departed, revoked] = removal;
          if (
            !removed ||
            !departed ||
            !revoked ||
            !removed.event.provenance ||
            !departed.event.provenance ||
            !revoked.event.provenance
          )
            return yield* Effect.die("Missing removal provenance");
          expect(removed.event.name).toBe("workspace.member.removed");
          expect(removed.event.provenance.causedBy).toBeNull();
          expect(departed.event.name).toBe("group.membership.removed");
          expect(revoked.event.name).toBe("workspace.invitation.revoked");
          for (const caused of [departed, revoked])
            expect(caused.event.provenance?.causedBy).toEqual({
              workspaceId: workspace.id,
              logId: removed.logId,
              commitId: removed.commitId,
              id: removed.id,
            });
          expect(DateTime.isDateTime(revoked.event.provenance.occurredAt)).toBe(true);
        }),
      ),
  );
});
