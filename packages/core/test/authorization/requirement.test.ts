import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Schema, SchemaIssue } from "effect";
import * as Permission from "../../src/authorization/Permission.ts";
import * as Requirement from "../../src/authorization/Requirement.ts";
import * as Target from "../../src/authorization/Target.ts";
import * as Member from "../../src/workspace/Member.ts";
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts";
import * as Workspace from "../../src/workspace/Workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const memberId = Member.Id.make("member-1");
const workspace = Target.Reference.cases.Workspace.make({ workspaceId });
const member = Target.Reference.cases.Member.make({ workspaceId, memberId });
const ManageWorkspace = Permission.make("test.workspace.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator",
});
it("requirements pair declared permissions with concrete targets", () => {
  expectTypeOf(MemberPermissions.Read.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(MemberPermissions.Remove.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(ManageWorkspace.targetKind).toEqualTypeOf<"Workspace">();
  expectTypeOf<Target.Kind>().toEqualTypeOf<Target.Reference["_tag"]>();
  expect(Requirement.make(MemberPermissions.Read, member)).toEqual({
    permission: { name: MemberPermissions.Read.name, targetKind: "Member" },
    target: member,
  });
  expect(Requirement.make(MemberPermissions.Remove, member)).toEqual({
    permission: { name: MemberPermissions.Remove.name, targetKind: "Member" },
    target: member,
  });
  expect(Requirement.make(ManageWorkspace, workspace)).toEqual({
    permission: { name: ManageWorkspace.name, targetKind: "Workspace" },
    target: workspace,
  });
});
it.effect("requirements retain their encoded contract without tier metadata", () =>
  Effect.gen(function* () {
    const encoded = {
      permission: { name: "member.read", targetKind: "Member" },
      target: { _tag: "Member", workspaceId, memberId },
    } as const;
    const requirement = Requirement.make(MemberPermissions.Read, member);
    expect(yield* Schema.encodeEffect(Requirement.Requirement)(requirement)).toEqual(encoded);
    expect(yield* Schema.decodeEffect(Requirement.Requirement)(encoded)).toEqual(requirement);
  }),
);
it("requirement construction rejects the wrong target kind in types and at runtime", () => {
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
it.effect("schema decoding and effectful construction also reject mismatched requirements", () =>
  Effect.gen(function* () {
    const decode = Schema.decodeUnknownEffect(Requirement.Requirement);
    const valid = Requirement.make(MemberPermissions.Remove, member);
    expect(yield* decode(valid)).toEqual(valid);
    for (const input of [
      { permission: MemberPermissions.Remove, target: workspace },
      { permission: ManageWorkspace, target: member },
    ]) {
      const error = yield* decode(input).pipe(Effect.flip);
      const issue = yield* Requirement.Requirement.makeEffect(input).pipe(Effect.flip);
      expect(error._tag).toBe("SchemaError");
      for (const message of [error.message, SchemaIssue.makeFormatterDefault()(issue)]) {
        expect(message).toContain(`requires a ${input.permission.targetKind} target`);
        expect(message).toContain('["target"]');
      }
    }
  }),
);
