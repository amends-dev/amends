import { AssignmentFacts, Role, RoleFacts } from "@amends-dev/core/authorization";
import { Actor } from "@amends-dev/core/identity";
import { Journal, Publication } from "@amends-dev/core/journal";
import { MemberService, MemberPermissions } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { withStorage } from "./fixture.ts";
import * as Support from "./support.ts";
import { alice, forWorkspace, testProvenance, workspaceId } from "./support.ts";

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
            const journal = yield* Journal.Journal;
            const publish = Effect.provideService(
              Publication.Publication,
              testProvenance(workspaceId),
            );
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
            const actor = Actor.Actor.of({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            expect(
              yield* (yield* MemberService.MemberService)
                .get(workspace.ownerMemberId)
                .pipe(Effect.provideService(Actor.Actor, actor), Effect.flip),
            ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } });
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
