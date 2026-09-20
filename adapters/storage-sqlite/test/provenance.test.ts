import { expect, test } from "bun:test";
import { Event, Log } from "@amends/core/journal";
import { DateTime, Effect } from "effect";
import { Operations } from "./operations.ts";
import { alice, bob, boundTo, future, request, runHost, temporary } from "./invitation-support.ts";
import { inDatabase, views } from "./support.ts";

test("bootstrap, acceptance and removal retain truthful attribution after reopening storage", async () =>
  temporary(async (filename) => {
    const workspace = await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        yield* Operations.invite(workspace.id, alice, request(workspace.id, yield* future));
        const member = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          invitation.details.id,
        );
        yield* Operations.removeMember(workspace.id, alice, member.id);
        const bound = yield* boundTo(workspace.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toHaveLength(5);
        return workspace;
      }),
    );
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspace.id);
        const batches = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
        const decoded = yield* Effect.forEach(batches, (batch) =>
          Effect.forEach(batch.entries, (entry) =>
            Effect.map(Event.storageCodec.decode(entry), (event) => ({
              ...entry,
              event,
            })),
          ),
        );
        const [bootstrap, firstInvitation, secondInvitation, acceptance, removal] = decoded;
        if (!bootstrap || !firstInvitation || !secondInvitation || !acceptance || !removal)
          return yield* Effect.die("Missing operation history");
        const groups = [bootstrap, firstInvitation, secondInvitation, acceptance, removal];
        expect(new Set(groups.map((group) => group[0]?.event.provenance?.correlationId)).size).toBe(
          5,
        );
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
        const [removed, revoked] = removal;
        if (!removed || !revoked || !removed.event.provenance || !revoked.event.provenance)
          return yield* Effect.die("Missing removal provenance");
        expect(removed.event.name).toBe("workspace.member.removed");
        expect(removed.event.provenance.causedBy).toBeNull();
        expect(revoked.event.name).toBe("workspace.invitation.revoked");
        expect(revoked.event.provenance.causedBy).toEqual({
          workspaceId: workspace.id,
          logId: removed.logId,
          commitId: removed.commitId,
          id: removed.id,
        });
        expect(DateTime.isDateTime(revoked.event.provenance.occurredAt)).toBe(true);
      }),
    );
  }));
