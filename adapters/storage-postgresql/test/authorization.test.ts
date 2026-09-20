import { Publication } from "@amends/core/journal";
import { testProvenance } from "./support.ts";
import { expect } from "bun:test";
import { AssignmentFacts, Role, RoleFacts } from "@amends/core/authorization";
import { Actor } from "@amends/core/identity";
import { Journal } from "@amends/core/journal";
import { MemberApplication, MemberPermissions } from "@amends/core/workspace";
import { Effect } from "effect";

import { alice, workspaceId, views, core, inDatabase, initialized, setup } from "./support.ts";
const { it, withDatabase } = await setup();
it("the persistent role and assignment projections support edits and independent revocations", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        yield* Effect.gen(function* () {
          const journal = yield* Journal.Service;
          const roleId = Role.Id.make("reader");
          yield* journal
            .publish(RoleFacts.Created, {
              workspaceId,
              roleId,
              name: "Reader",
              permissions: [],
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          yield* journal
            .publish(RoleFacts.Renamed, { workspaceId, roleId, name: "Renamed" })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          yield* journal
            .publish(RoleFacts.PermissionsChanged, {
              workspaceId,
              roleId,
              permissions: [MemberPermissions.Read.name],
            })
            .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          const grants = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          for (const grant of grants)
            yield* journal
              .publish(AssignmentFacts.Revoked, {
                workspaceId,
                assignmentId: grant.id,
              })
              .pipe(Effect.provideService(Publication.Service, testProvenance(workspaceId)));
          expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual([]);
          const actor = Actor.Value.make({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: alice,
          });
          expect(
            yield* (yield* MemberApplication.Service)
              .get(workspace.ownerMemberId)
              .pipe(Effect.provideService(Actor.Service, actor), Effect.flip),
          ).toMatchObject({ _tag: "Authorization.Denied" });
          expect(yield* bound.roles.get(roleId)).toMatchObject({
            _tag: "Some",
            value: { name: "Renamed", permissions: ["member.read"] },
          });
          expect(yield* bound.assignments.get(grants[0]!.id)).toMatchObject({
            _tag: "Some",
            value: { status: "revoked", source: grants[0]!.source },
          });
        }).pipe(Effect.provide(core(bound)));
      }),
    );
  }));
