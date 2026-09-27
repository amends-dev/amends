import { expect, it } from "@effect/vitest";
import * as Core from "../../src/core.ts";
import { Permission } from "../../src/authorization/permission.ts";
import { BuiltinRoles } from "../../src/authorization/role/builtin.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const read = Permission.make("it.read", {
  targetKind: "Member",
  builtinTier: "viewer",
});
const manage = Permission.make("it.manage", {
  targetKind: "Member",
  builtinTier: "administrator",
});
const transfer = Permission.make("it.transfer", {
  targetKind: "Workspace",
  builtinTier: "owner",
});

it("built-in role construction includes lower tiers without leaking higher-tier permissions", () => {
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

it("new declarations affect newly constructed bundles without mutating earlier role records", () => {
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

it("invalid or duplicate declarations cannot silently produce built-in roles", () => {
  expect(() => BuiltinRoles.make(workspaceId, [read, read])).toThrow("Schema validation failed");
  for (const tier of [undefined, "unknown"]) {
    const malformed = Permission.make("it.invalid", {
      targetKind: "Member",
      builtinTier: "viewer",
    });
    Reflect.set(malformed, "builtinTier", tier);
    expect(() => BuiltinRoles.make(workspaceId, [malformed])).toThrow("Schema validation failed");
  }
});

/**
 * The bundles each released revision holds, by role. A workspace recorded at a revision keeps
 * them until a host with a later one upgrades it, so an entry never changes once released: to
 * change the declarations, add the next revision here and raise `BuiltinRoles.revision`.
 */
const revisionOne = {
  [BuiltinRoles.ViewerId]: [
    "member.read",
    "assignment.read",
    "group.read",
    "group.follow",
    "thread.start",
    "thread.read",
    "thread.publish",
    "thread.follow",
    "agent.use",
  ],
  [BuiltinRoles.AdministratorId]: [
    "member.read",
    "member.remove",
    "invitation.manage",
    "assignment.read",
    "assignment.manage",
    "group.create",
    "group.read",
    "group.follow",
    "group.membership.manage",
    "thread.start",
    "thread.read",
    "thread.publish",
    "thread.follow",
    "agent.use",
  ],
  [BuiltinRoles.OwnerId]: [
    "member.read",
    "member.remove",
    "invitation.manage",
    "assignment.read",
    "assignment.manage",
    "workspace.transfer-ownership",
    "group.create",
    "group.read",
    "group.follow",
    "group.membership.manage",
    "thread.start",
    "thread.read",
    "thread.publish",
    "thread.follow",
    "agent.use",
  ],
};
/** A bundle with `group.rename` in its declaration place, after `group.follow`. */
const withRename = (permissions: ReadonlyArray<string> = []) =>
  permissions.flatMap((name) => (name === "group.follow" ? [name, "group.rename"] : [name]));
/**
 * A bundle with `group.join` in its declaration place: after `group.membership.manage` where the
 * bundle has it, else after the group permissions before it.
 */
const withJoin = (permissions: ReadonlyArray<string> = []) => {
  const after = permissions.includes("group.membership.manage")
    ? "group.membership.manage"
    : permissions.includes("group.rename")
      ? "group.rename"
      : "group.follow";
  return permissions.flatMap((name) => (name === after ? [name, "group.join"] : [name]));
};
const revisions: Readonly<Record<number, Readonly<Record<string, ReadonlyArray<string>>>>> = {
  1: revisionOne,
  2: {
    ...revisionOne,
    [BuiltinRoles.OwnerId]: ["workspace.rename", ...(revisionOne[BuiltinRoles.OwnerId] ?? [])],
  },
  // Revision 3 lets administrators and owners rename team groups.
  3: {
    ...revisionOne,
    [BuiltinRoles.AdministratorId]: withRename(revisionOne[BuiltinRoles.AdministratorId]),
    [BuiltinRoles.OwnerId]: ["workspace.rename", ...withRename(revisionOne[BuiltinRoles.OwnerId])],
  },
  // Revision 4 lets everyone join public groups.
  4: {
    [BuiltinRoles.ViewerId]: withJoin(revisionOne[BuiltinRoles.ViewerId]),
    [BuiltinRoles.AdministratorId]: withJoin(withRename(revisionOne[BuiltinRoles.AdministratorId])),
    [BuiltinRoles.OwnerId]: [
      "workspace.rename",
      ...withJoin(withRename(revisionOne[BuiltinRoles.OwnerId])),
    ],
  },
};

it("the registered declarations make the current revision's bundles", () => {
  expect(Math.max(...Object.keys(revisions).map(Number))).toBe(BuiltinRoles.revision);
  expect(
    Object.fromEntries(
      BuiltinRoles.make(workspaceId, Core.permissions).map((role) => [role.id, role.permissions]),
    ),
  ).toEqual(revisions[BuiltinRoles.revision]);
});
