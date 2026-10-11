import { expect, it } from "@effect/vitest";
import * as Core from "../../src/core.ts";
import * as Permission from "../../src/authorization/permission.ts";
import * as BuiltinRoles from "../../src/authorization/role/builtin.ts";
import * as Workspace from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const read = Permission.make("it.read", {
  targetKind: "Member",
  builtinTier: "member",
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
    { id: BuiltinRoles.MemberId, workspaceId, name: "Member", permissions: [read.name] },
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
      builtinTier: "member",
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
const revisions: Record<number, Readonly<Record<string, ReadonlyArray<string>>>> = {
  // Members take part in conversations and tasks, and see and use connections and agents;
  // administrators also manage people, moderate groups, and add connections, agents, and
  // channels; the owner also renames and transfers the workspace.
  1: {
    [BuiltinRoles.MemberId]: [
      "member.read",
      "assignment.read",
      "group.create",
      "group.read",
      "group.follow",
      "group.rename",
      "group.membership.manage",
      "group.join",
      "thread.start",
      "thread.read",
      "thread.rename",
      "thread.publish",
      "thread.follow",
      "task.create",
      "task.update",
      "agent.use",
      "connection.read",
      "connection.use",
      "agent.read",
      "channel.read",
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
      "group.rename",
      "group.moderate",
      "group.membership.manage",
      "group.join",
      "thread.start",
      "thread.read",
      "thread.rename",
      "thread.publish",
      "thread.moderate",
      "thread.follow",
      "task.create",
      "task.update",
      "agent.use",
      "connection.create",
      "connection.read",
      "connection.manage",
      "connection.use",
      "agent.create",
      "agent.read",
      "agent.configure",
      "channel.create",
      "channel.read",
      "channel.manage",
    ],
    [BuiltinRoles.OwnerId]: [
      "workspace.rename",
      "member.read",
      "member.remove",
      "invitation.manage",
      "assignment.read",
      "assignment.manage",
      "workspace.transfer-ownership",
      "group.create",
      "group.read",
      "group.follow",
      "group.rename",
      "group.moderate",
      "group.membership.manage",
      "group.join",
      "thread.start",
      "thread.read",
      "thread.rename",
      "thread.publish",
      "thread.moderate",
      "thread.follow",
      "task.create",
      "task.update",
      "agent.use",
      "connection.create",
      "connection.read",
      "connection.manage",
      "connection.use",
      "agent.create",
      "agent.read",
      "agent.configure",
      "channel.create",
      "channel.read",
      "channel.manage",
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
