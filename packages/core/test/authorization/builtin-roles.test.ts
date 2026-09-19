import { expect, test } from "bun:test";
import { Permission } from "../../src/authorization/permission.ts";
import { BuiltinRoles } from "../../src/authorization/role/builtin.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const read = Permission.make("test.read", { targetKind: "Member", builtinTier: "viewer" });
const manage = Permission.make("test.manage", {
  targetKind: "Member",
  builtinTier: "administrator",
});
const transfer = Permission.make("test.transfer", {
  targetKind: "Workspace",
  builtinTier: "owner",
});

test("built-in role construction includes lower tiers without leaking higher-tier permissions", () => {
  expect(BuiltinRoles.make(workspaceId, [read, manage, transfer])).toEqual([
    { id: BuiltinRoles.ViewerId, workspaceId, name: "Viewer", permissions: [read.name] },
    {
      id: BuiltinRoles.AdministratorId,
      workspaceId,
      name: "Administrator",
      permissions: [read.name, manage.name],
    },
    {
      id: BuiltinRoles.OwnerId,
      workspaceId,
      name: "Owner",
      permissions: [read.name, manage.name, transfer.name],
    },
  ]);
});

test("new declarations affect newly constructed bundles without mutating earlier role records", () => {
  const declarations = [read];
  const before = BuiltinRoles.make(workspaceId, declarations);
  declarations.push(manage);
  const after = BuiltinRoles.make(workspaceId, declarations);
  expect(before.map((role) => role.permissions)).toEqual([[read.name], [read.name], [read.name]]);
  expect(after.map((role) => role.permissions)).toEqual([
    [read.name],
    [read.name, manage.name],
    [read.name, manage.name],
  ]);
  expect(after.map((role) => role.id)).toEqual(before.map((role) => role.id));
  const otherWorkspaceId = Workspace.Id.make("workspace-two");
  expect(BuiltinRoles.make(otherWorkspaceId, declarations).map((role) => role.workspaceId)).toEqual(
    [otherWorkspaceId, otherWorkspaceId, otherWorkspaceId],
  );
});

test("invalid or duplicate declarations cannot silently produce built-in roles", () => {
  expect(() => BuiltinRoles.make(workspaceId, [read, read])).toThrow("Schema validation failed");
  for (const tier of [undefined, "unknown"]) {
    const malformed = Permission.make("test.invalid", {
      targetKind: "Member",
      builtinTier: "viewer",
    });
    Reflect.set(malformed, "builtinTier", tier);
    expect(() => BuiltinRoles.make(workspaceId, [malformed])).toThrow("Schema validation failed");
  }
});
