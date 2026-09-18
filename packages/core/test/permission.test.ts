import { expect, expectTypeOf, test } from "bun:test";
import { Grant } from "../src/authorization/grant.ts";
import { Permission } from "../src/authorization/permission.ts";
import { Requirement } from "../src/authorization/requirement.ts";
import { Scope } from "../src/authorization/scope.ts";
import { Target } from "../src/authorization/target.ts";
import { Member } from "../src/workspace/member.ts";
import { MemberPermissions } from "../src/workspace/member-permissions.ts";
import { Workspace } from "../src/workspace/workspace.ts";

test("permission groups preserve existing member definitions and their specific target kind", () => {
  expect(MemberPermissions.Read).toEqual(Permission.make("member.read", { targetKind: "Member" }));
  expect(MemberPermissions.Remove).toEqual(
    Permission.make("member.remove", { targetKind: "Member" }),
  );
  expectTypeOf(MemberPermissions.Read.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(MemberPermissions.Remove.targetKind).toEqualTypeOf<"Member">();
});

test("an action can target its workspace while other actions in the group keep their default", () => {
  const member = Permission.makeGroup("test.member", { targetKind: "Member" });
  const created = member.make("create", { targetKind: "Workspace" });
  const read = member.make("read");
  expectTypeOf(created.targetKind).toEqualTypeOf<"Workspace">();
  expectTypeOf(read.targetKind).toEqualTypeOf<"Member">();
  expect(created).toEqual(Permission.make("test.member.create", { targetKind: "Workspace" }));
  expect(read).toEqual(Permission.make("test.member.read", { targetKind: "Member" }));

  const workspaceId = Workspace.Id.make("workspace-1");
  const workspace = Target.Reference.cases.Workspace.make({ workspaceId });
  const target = Target.Reference.cases.Member.make({
    workspaceId,
    memberId: Member.Id.make("member-1"),
  });
  expect(Requirement.make(created, workspace).target).toEqual(workspace);
  expect(() => {
    // @ts-expect-error The override requires a workspace target, not the group's default kind.
    Requirement.make(created, target);
  }).toThrow("Schema validation failed");

  const exactWorkspace = Scope.Value.cases.Target.make({ target: workspace });
  const exactMember = Scope.Value.cases.Target.make({ target });
  expect(Grant.make(created, exactWorkspace)).toEqual({
    permission: created.name,
    scope: exactWorkspace,
  });
  expect(() => Grant.make(created, exactMember)).toThrow("Schema validation failed");
  expect(Grant.make(read, exactMember)).toEqual({ permission: read.name, scope: exactMember });
});

test("groups validate name components and both default and overridden target kinds", () => {
  expect(() => Permission.makeGroup("", { targetKind: "Member" })).toThrow(
    "Schema validation failed",
  );
  expect(() => {
    // @ts-expect-error Unsupported target kinds are rejected when declaring the group.
    Permission.makeGroup("test.member", { targetKind: "Unknown" });
  }).toThrow("Schema validation failed");
  const member = Permission.makeGroup("test.member", { targetKind: "Member" });
  expect(() => member.make("")).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error Unsupported target kinds are rejected for action overrides too.
    member.make("read", { targetKind: "Unknown" });
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error An explicit override must declare its target kind.
    member.make("read", {});
  }).toThrow("Schema validation failed");
});

test("group defaults are captured independently of the options object", () => {
  const options: { targetKind: Target.Kind } = { targetKind: "Member" };
  const member = Permission.makeGroup("test.member", options);
  options.targetKind = "Workspace";
  expect(member.make("read").targetKind).toBe("Member");
});
