import { expect } from "bun:test";
import { BuiltinRoles } from "@amends/core/authorization";
import { Actor } from "@amends/core/identity";
import { Checkpoint, Store } from "@amends/core/journal";
import {
  InvitationApplication,
  OwnershipApplication,
  WorkspaceProjection,
} from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Context, Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { alice, bob, setup, host, future, boundTo, core, journalLog } from "./support.ts";

const { it, withDatabase } = await setup();
it("ownership transfer rolls back fully, serializes competing requests, and replays over PostgreSQL", async () =>
  withDatabase(async (url) => {
    const saved = await Effect.runPromise(
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        const workspace = yield* gateway.createWorkspace(alice.id, { name: "Ownership" });
        const invitation = yield* gateway.asMember(
          workspace.id,
          alice,
          Effect.flatMap(InvitationApplication.Service, (service) =>
            Effect.flatMap(future, (expiresAt) =>
              service.issue({ recipientId: bob.id, roleId: BuiltinRoles.ViewerId, expiresAt }),
            ),
          ),
        );
        const member = yield* gateway.inWorkspace(
          workspace.id,
          Effect.flatMap(InvitationApplication.Service, (service) =>
            service.accept(invitation.details.id, bob.id),
          ),
        );
        const view = yield* gateway.asMember(
          workspace.id,
          alice,
          Effect.flatMap(OwnershipApplication.Service, (service) => service.get),
        );
        const input = { memberId: member.id, expectedOwnerAssignmentId: view.ownerAssignmentId };
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(journalLog, { limit: 20 });
        const previousAssignments = yield* bound.assignments.listActiveByMember(
          workspace.ownerMemberId,
        );
        const recipientAssignments = yield* bound.assignments.listActiveByMember(member.id);
        const failure = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected ownership failure",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              key.name === WorkspaceProjection.definition.name && cursor.index === 4
                ? Effect.fail(failure)
                : bound.checkpoints.set(key, cursor),
          }),
        };
        expect(
          yield* Effect.flatMap(OwnershipApplication.Service, (service) =>
            service.transfer(input),
          ).pipe(
            Effect.provide(core(broken)),
            Effect.provideService(Actor.Service, {
              workspaceId: workspace.id,
              memberId: workspace.ownerMemberId,
              identity: alice,
            }),
            Effect.flip,
          ),
        ).toBe(failure);
        expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
        expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual(
          previousAssignments,
        );
        expect(yield* bound.assignments.listActiveByMember(member.id)).toEqual(
          recipientAssignments,
        );
        expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
        const results = yield* Effect.forEach(
          [1, 2],
          () =>
            gateway
              .asMember(
                workspace.id,
                alice,
                Effect.flatMap(OwnershipApplication.Service, (service) => service.transfer(input)),
              )
              .pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter(({ _tag }) => _tag === "Success")).toHaveLength(1);
        expect(results.filter(({ _tag }) => _tag === "Failure")).toHaveLength(1);
        return { workspace, member };
      }).pipe(Effect.provide(host(url))),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const gateway = yield* Gateway.Service;
        const read = gateway.asMember(
          saved.workspace.id,
          bob,
          Effect.flatMap(OwnershipApplication.Service, (service) => service.get),
        );
        const before = yield* read;
        expect(before.canTransfer).toBe(true);
        expect(before.workspace.createdBy).toBe(alice.id);
        expect(before.workspace.ownerMemberId).toBe(saved.member.id);
        const sql = yield* SqlClient.SqlClient;
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        expect(yield* read).toEqual(before);
        const bound = yield* boundTo(saved.workspace.id);
        expect(
          (yield* bound.assignments.listActiveByMember(saved.workspace.ownerMemberId)).map(
            ({ source }) => source,
          ),
        ).toEqual([
          {
            _tag: "Role",
            roleId: BuiltinRoles.AdministratorId,
            scope: { _tag: "Workspace", workspaceId: saved.workspace.id },
          },
        ]);
      }).pipe(Effect.provide(host(url))),
    );
  }));
