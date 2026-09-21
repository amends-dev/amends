import { describe, it, expect } from "@effect/vitest";
import { AssignmentApplication, BuiltinRoles } from "@amends/core/authorization";
import { InvitationApplication } from "@amends/core/workspace";
import { Actor } from "@amends/core/identity";
import { Checkpoint, Store } from "@amends/core/journal";
import { Gateway } from "@amends/gateway";
import { Context, Effect, Option } from "effect";
import { alice, bob, setup, host, future, boundTo, core, journalLog } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect("role changes are transactional and survive reconstruction over PostgreSQL", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const saved = yield* Effect.gen(function* () {
          const gateway = yield* Gateway.Service;
          const workspace = yield* gateway.createWorkspace(alice.id, { name: "Roles" });
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
          const bound = yield* boundTo(workspace.id);
          const active = yield* bound.assignments.listActiveByMember(member.id);
          const input = {
            memberId: member.id,
            roleId: BuiltinRoles.AdministratorId,
            expectedAssignmentIds: active.map(({ id }) => id),
          };
          const before = yield* bound.store.read(journalLog, { limit: 20 });
          const failure = new Store.Failure({
            operation: "checkpoint.set",
            cause: "injected role change failure",
          });
          const broken = {
            ...bound,
            context: Context.add(bound.context, Checkpoint.Service, {
              ...bound.checkpoints,
              set: (key, cursor) =>
                cursor.index === 1 ? Effect.fail(failure) : bound.checkpoints.set(key, cursor),
            }),
          };
          expect(
            yield* Effect.flatMap(AssignmentApplication.Service, (service) =>
              service.change(input),
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
          expect(yield* bound.assignments.listActiveByMember(member.id)).toEqual(active);
          expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
          const results = yield* Effect.forEach(
            [1, 2],
            () =>
              gateway
                .asMember(
                  workspace.id,
                  alice,
                  Effect.flatMap(AssignmentApplication.Service, (service) => service.change(input)),
                )
                .pipe(Effect.result),
            { concurrency: "unbounded" },
          );
          expect(results.filter(({ _tag }) => _tag === "Success")).toHaveLength(1);
          const rejected = results.find((result) => result._tag === "Failure");
          expect(rejected?._tag).toBe("Failure");
          if (rejected?._tag === "Failure")
            expect(["AssignmentApplication.Changed", "Gateway.Conflict"]).toContain(
              rejected.failure._tag,
            );
          return { workspace, member, active };
        }).pipe(Effect.provide(host(url)));
        yield* Effect.gen(function* () {
          const gateway = yield* Gateway.Service;
          const access = yield* gateway.asMember(
            saved.workspace.id,
            bob,
            Effect.flatMap(AssignmentApplication.Service, (service) =>
              service.list(saved.member.id),
            ),
          );
          expect(access.assignments.map(({ source }) => source)).toEqual([
            {
              _tag: "Role",
              roleId: BuiltinRoles.AdministratorId,
              scope: { _tag: "Workspace", workspaceId: saved.workspace.id },
            },
          ]);
          const bound = yield* boundTo(saved.workspace.id);
          for (const previous of saved.active)
            expect(yield* bound.assignments.get(previous.id)).toEqual(
              Option.some({
                id: previous.id,
                workspaceId: previous.workspaceId,
                memberId: previous.memberId,
                source: previous.source,
                status: "revoked",
              }),
            );
        }).pipe(Effect.provide(host(url)));
      }),
    ),
  );
});
