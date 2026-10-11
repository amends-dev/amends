import { expect, expectTypeOf, it } from "@effect/vitest";
import { Schema } from "effect";
import * as Grant from "../../src/authorization/grant.ts";
import * as Permission from "../../src/authorization/permission.ts";
import * as Requirement from "../../src/authorization/requirement.ts";
import * as Scope from "../../src/authorization/scope.ts";
import * as Target from "../../src/authorization/target.ts";
import * as Member from "../../src/workspace/member/member.ts";
import * as MemberPermissions from "../../src/workspace/member/permissions.ts";
import * as Workspace from "../../src/workspace/workspace.ts";

it("permission groups preserve existing member definitions and their specific target kind", () => {
  expect(MemberPermissions.Read).toEqual(
    Permission.make("member.read", { targetKind: "Member", builtinTier: "member" }),
  );
  expect(MemberPermissions.Remove).toEqual(
    Permission.make("member.remove", { targetKind: "Member", builtinTier: "administrator" }),
  );
  expectTypeOf(MemberPermissions.Read.targetKind).toEqualTypeOf<"Member">();
  expectTypeOf(MemberPermissions.Remove.targetKind).toEqualTypeOf<"Member">();
});

it("an action can target its workspace while other actions in the group keep their default", () => {
  const member = Permission.makeGroup("it.member", { targetKind: "Member" });
  const created = member.make("create", {
    targetKind: "Workspace",
    builtinTier: "administrator",
  });
  const read = member.make("read", { builtinTier: "member" });
  expectTypeOf(created.targetKind).toEqualTypeOf<"Workspace">();
  expectTypeOf(read.targetKind).toEqualTypeOf<"Member">();
  expect(created).toEqual(
    Permission.make("it.member.create", {
      targetKind: "Workspace",
      builtinTier: "administrator",
    }),
  );
  expect(read).toEqual(
    Permission.make("it.member.read", { targetKind: "Member", builtinTier: "member" }),
  );

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

it("groups validate name components and both default and overridden target kinds", () => {
  expect(() => Permission.makeGroup("", { targetKind: "Member" })).toThrow(
    "Schema validation failed",
  );
  expect(() => {
    // @ts-expect-error Unsupported target kinds are rejected when declaring the group.
    Permission.makeGroup("it.member", { targetKind: "Unknown" });
  }).toThrow("Schema validation failed");
  const member = Permission.makeGroup("it.member", { targetKind: "Member" });
  expect(() => member.make("", { builtinTier: "member" })).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error Unsupported target kinds are rejected for action overrides too.
    member.make("read", { targetKind: "Unknown", builtinTier: "member" });
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error Every action must declare a tier.
    member.make("read", {});
  }).toThrow("Schema validation failed");
});

it("group defaults are captured independently of the options object", () => {
  const options: { targetKind: Target.Kind } = { targetKind: "Member" };
  const member = Permission.makeGroup("it.member", options);
  options.targetKind = "Workspace";
  expect(member.make("read", { builtinTier: "member" }).targetKind).toBe("Member");
});

it("permission tiers are mandatory and validated for direct and grouped declarations", () => {
  expect(() => {
    // @ts-expect-error Direct declarations cannot omit their tier.
    Permission.make("it.read", { targetKind: "Member" });
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error Tiers are a closed set.
    Permission.make("it.read", { targetKind: "Member", builtinTier: "unknown" });
  }).toThrow("Schema validation failed");
  const group = Permission.makeGroup("test", { targetKind: "Member" });
  expect(() => {
    // @ts-expect-error Groups have no default tier.
    group.make("read");
  }).toThrow("Schema validation failed");
  expect(() => {
    // @ts-expect-error Grouped declarations validate tiers too.
    group.make("read", { builtinTier: "unknown" });
  }).toThrow("Schema validation failed");
  const decode = Schema.decodeUnknownSync(Permission.Definition);
  expect(() => decode({ name: "it.read", targetKind: "Member" })).toThrow();
});
