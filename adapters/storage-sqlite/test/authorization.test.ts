import { expect, test } from "bun:test";
import { AssignmentFacts, Role, RoleFacts } from "@amends/core/authorization";
import { Actor } from "@amends/core/identity";
import { Journal } from "@amends/core/journal";
import { MemberApplication, MemberPermissions } from "@amends/core/workspace";
import { Effect } from "effect";

import { alice, workspaceId, views, core, inDatabase, initialized, temporary } from "./support.ts";
test("the persistent role and assignment projections support edits and independent revocations", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        yield* Effect.gen(function* () {
          const journal = yield* Journal.Service;
          const roleId = Role.Id.make("reader");
          yield* journal.publish(RoleFacts.Created, {
            workspaceId,
            roleId,
            name: "Reader",
            permissions: [],
          });
          yield* journal.publish(RoleFacts.Renamed, { workspaceId, roleId, name: "Renamed" });
          yield* journal.publish(RoleFacts.PermissionsChanged, {
            workspaceId,
            roleId,
            permissions: [MemberPermissions.Read.name],
          });
          const grants = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          for (const grant of grants)
            yield* journal.publish(AssignmentFacts.Revoked, {
              workspaceId,
              assignmentId: grant.id,
            });
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
        }).pipe(Effect.provide(core(bound)));
      }),
    );
  }));
