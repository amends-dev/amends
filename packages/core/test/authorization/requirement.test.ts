import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Schema, SchemaIssue } from "effect";
import { Permission } from "../../src/authorization/permission.ts";
import { Requirement } from "../../src/authorization/requirement.ts";
import { Target } from "../../src/authorization/target.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberPermissions } from "../../src/workspace/member/permissions.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const memberId = Member.Id.make("member-1");
const workspace = Target.Reference.cases.Workspace.make({ workspaceId });
const member = Target.Reference.cases.Member.make({ workspaceId, memberId });
const ManageWorkspace = Permission.make("test.workspace.manage", { targetKind: "Workspace" });

test("requirements pair declared permissions with concrete targets", () => {
  expectTypeOf(MemberPermissions.Read.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(MemberPermissions.Remove.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(ManageWorkspace.targetKind).toEqualTypeOf<"Workspace">();
  expectTypeOf<Target.Kind>().toEqualTypeOf<Target.Reference["_tag"]>();

  expect(Requirement.make(MemberPermissions.Read, member)).toEqual({
    permission: MemberPermissions.Read,
    target: member,
  });
  expect(Requirement.make(MemberPermissions.Remove, member)).toEqual({
    permission: MemberPermissions.Remove,
    target: member,
  });
  expect(Requirement.make(ManageWorkspace, workspace)).toEqual({
    permission: ManageWorkspace,
    target: workspace,
  });
});

test("requirement construction rejects the wrong target kind in types and at runtime", () => {
  expect(() => {
    // @ts-expect-error A member permission requires a member target.
    Requirement.make(MemberPermissions.Read, workspace);
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error A workspace-wide grant does not turn a member target into a workspace target.
    Requirement.make(MemberPermissions.Remove, workspace);
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error A workspace permission requires a workspace target.
    Requirement.make(ManageWorkspace, member);
  }).toThrow("Schema validation failed");
});

test("schema decoding and effectful construction also reject mismatched requirements", async () => {
  const decode = Schema.decodeUnknownEffect(Requirement.Value);
  const valid = Requirement.make(MemberPermissions.Remove, member);
  expect(await Effect.runPromise(decode(valid))).toEqual(valid);

  for (const input of [
    { permission: MemberPermissions.Remove, target: workspace },
    { permission: ManageWorkspace, target: member },
  ]) {
    const error = await Effect.runPromise(decode(input).pipe(Effect.flip));
    const issue = await Effect.runPromise(Requirement.Value.makeEffect(input).pipe(Effect.flip));
    expect(error._tag).toBe("SchemaError");
    for (const message of [error.message, SchemaIssue.makeFormatterDefault()(issue)]) {
      expect(message).toContain(`requires a ${input.permission.targetKind} target`);
      expect(message).toContain('["target"]');
    }
  }
});
