import { AssignmentFacts, Role, RoleFacts } from "@amends-dev/core/authorization";
import { Actor } from "@amends-dev/core/identity";
import { Journal, Publication } from "@amends-dev/core/journal";
import { MemberService, MemberPermissions } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { withStorage } from "./fixture.ts";
import { alice, forWorkspace, Support, testProvenance, workspaceId } from "./support.ts";

/** Stored roles and assignments as authorization reads them. */
const { core, initialized } = Support;
describe("authorization", () => {
  it.effect(
    "the persistent role and assignment projections support edits and independent revocations",
    () =>
      withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          const workspace = yield* initialized(bound);
          yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            const publish = Effect.provideService(Publication.Service, testProvenance(workspaceId));
            const roleId = Role.Id.make("reader");
            yield* journal
              .publish(RoleFacts.Created, {
                workspaceId,
                roleId,
                name: "Reader",
                permissions: [],
              })
              .pipe(publish);
            yield* journal
              .publish(RoleFacts.Renamed, { workspaceId, roleId, name: "Renamed" })
              .pipe(publish);
            yield* journal
              .publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId,
                permissions: [MemberPermissions.Read.name],
              })
              .pipe(publish);
            const grants = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
            for (const grant of grants)
              yield* journal
                .publish(AssignmentFacts.Revoked, {
                  workspaceId,
                  assignmentId: grant.id,
                  memberId: grant.memberId,
                })
                .pipe(publish);
            expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual(
              [],
            );
            const actor = Actor.Value.make({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            expect(
              yield* (yield* MemberService.Service)
                .get(workspace.ownerMemberId)
                .pipe(Effect.provideService(Actor.Service, actor), Effect.flip),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            expect(yield* bound.roles.get(roleId)).toMatchObject({
              _tag: "Some",
              value: { name: "Renamed", permissions: ["member.read"] },
            });
            for (const grant of grants)
              expect(yield* bound.assignments.get(grant.id)).toMatchObject({
                _tag: "Some",
                value: { status: "revoked", source: grant.source },
              });
          }).pipe(Effect.provide(core(bound)));
        }),
      ),
  );
});
