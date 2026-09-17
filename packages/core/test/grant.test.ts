import { expect, test } from "bun:test";
import { Effect, Schema, SchemaIssue } from "effect";
import { Grant } from "../src/authorization/grant.ts";
import { Permission } from "../src/authorization/permission.ts";
import { Scope } from "../src/authorization/scope.ts";
import { Target } from "../src/authorization/target.ts";
import { Member } from "../src/workspace/member.ts";
import { MemberPermissions } from "../src/workspace/member-permissions.ts";
import { Workspace } from "../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const workspaceScope = Scope.Value.cases.Workspace.make({ workspaceId });
const exactWorkspace = Scope.Value.cases.Target.make({
  target: Target.Reference.cases.Workspace.make({ workspaceId }),
});
const exactMember = Scope.Value.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: Member.Id.make("member-1") }),
});
const ManageWorkspace = Permission.make("test.workspace.manage", { targetKind: "Workspace" });

test("workspace grants store permission names and scopes for either target kind", () => {
  for (const permission of [MemberPermissions.Read, MemberPermissions.Remove, ManageWorkspace]) {
    expect(Grant.make(permission, workspaceScope)).toEqual({
      permission: permission.name,
      scope: workspaceScope,
    });
  }
});

test("exact grants accept scopes matching the permission's target kind", () => {
  expect(Grant.make(MemberPermissions.Remove, exactMember)).toEqual({
    permission: MemberPermissions.Remove.name,
    scope: exactMember,
  });
  expect(Grant.make(ManageWorkspace, exactWorkspace)).toEqual({
    permission: ManageWorkspace.name,
    scope: exactWorkspace,
  });
});

test("grant construction rejects incompatible exact scopes", () => {
  expect(() => Grant.make(MemberPermissions.Remove, exactWorkspace)).toThrow(
    "Schema validation failed",
  );
  expect(() => Grant.make(ManageWorkspace, exactMember)).toThrow("Schema validation failed");
});

test("definition-aware schemas validate stored names and scopes when decoding or constructing", async () => {
  for (const [permission, compatible, incompatible] of [
    [MemberPermissions.Remove, exactMember, exactWorkspace],
    [ManageWorkspace, exactWorkspace, exactMember],
  ] as const) {
    const schema = Grant.schema(permission);
    const decode = Schema.decodeUnknownEffect(schema);
    for (const scope of [workspaceScope, compatible]) {
      const stored = { permission: permission.name, scope };
      expect(await Effect.runPromise(decode(stored))).toEqual(stored);
    }

    const invalid = { permission: permission.name, scope: incompatible };
    const error = await Effect.runPromise(decode(invalid).pipe(Effect.flip));
    const issue = await Effect.runPromise(schema.makeEffect(invalid).pipe(Effect.flip));
    for (const message of [error.message, SchemaIssue.makeFormatterDefault()(issue)]) {
      expect(message).toContain(`requires a ${permission.targetKind} target`);
      expect(message).toContain('["scope"]["target"]');
    }

    const wrongName = await Effect.runPromise(
      decode({ permission: MemberPermissions.Read.name, scope: workspaceScope }).pipe(Effect.flip),
    );
    expect(wrongName.message).toContain(`Expected permission ${permission.name}`);
    expect(wrongName.message).toContain('["permission"]');
  }
});
