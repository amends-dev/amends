import { expect, it } from "@effect/vitest";
import * as Core from "../../src/core.ts";
import { Permission } from "../../src/authorization/permission.ts";
import { BuiltinRoles } from "../../src/authorization/role/builtin.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

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
const conversation = [
  "group.create",
  "group.read",
  "group.follow",
  "group.rename",
  "group.membership.manage",
  "group.join",
  "thread.start",
  "thread.read",
  "thread.publish",
  "thread.follow",
  "agent.use",
];
const revisions: Record<number, Readonly<Record<string, ReadonlyArray<string>>>> = {
  // Members take part in and start conversations, and create groups; administrators manage
  // people and moderate public groups; the owner also renames and transfers the workspace.
  1: {
    [BuiltinRoles.MemberId]: ["member.read", "assignment.read", ...conversation],
    [BuiltinRoles.AdministratorId]: [
      "member.read",
      "member.remove",
      "invitation.manage",
      "assignment.read",
      "assignment.manage",
      ...conversation.flatMap((name) =>
        name === "group.rename" ? [name, "group.moderate"] : [name],
      ),
    ],
    [BuiltinRoles.OwnerId]: [
      "workspace.rename",
      "member.read",
      "member.remove",
      "invitation.manage",
      "assignment.read",
      "assignment.manage",
      "workspace.transfer-ownership",
      ...conversation.flatMap((name) =>
        name === "group.rename" ? [name, "group.moderate"] : [name],
      ),
    ],
  },
};
// Connections: members see and use them; administrators and the owner also add and manage them.
revisions[2] = {
  [BuiltinRoles.MemberId]: [
    ...revisions[1]![BuiltinRoles.MemberId]!,
    "connection.read",
    "connection.use",
  ],
  [BuiltinRoles.AdministratorId]: [
    ...revisions[1]![BuiltinRoles.AdministratorId]!,
    "connection.create",
    "connection.read",
    "connection.manage",
    "connection.use",
  ],
  [BuiltinRoles.OwnerId]: [
    ...revisions[1]![BuiltinRoles.OwnerId]!,
    "connection.create",
    "connection.read",
    "connection.manage",
    "connection.use",
  ],
};
revisions[3] = {
  [BuiltinRoles.MemberId]: [
    ...revisions[2]![BuiltinRoles.MemberId]!,
    "environment.read",
    "environment.use",
  ],
  [BuiltinRoles.AdministratorId]: [
    ...revisions[2]![BuiltinRoles.AdministratorId]!,
    "environment.create",
    "environment.read",
    "environment.manage",
    "environment.use",
  ],
  [BuiltinRoles.OwnerId]: [
    ...revisions[2]![BuiltinRoles.OwnerId]!,
    "environment.create",
    "environment.read",
    "environment.manage",
    "environment.use",
  ],
};
revisions[4] = {
  [BuiltinRoles.MemberId]: [...revisions[3]![BuiltinRoles.MemberId]!, "agent.read"],
  [BuiltinRoles.AdministratorId]: [
    ...revisions[3]![BuiltinRoles.AdministratorId]!,
    "agent.create",
    "agent.read",
    "agent.configure",
  ],
  [BuiltinRoles.OwnerId]: [
    ...revisions[3]![BuiltinRoles.OwnerId]!,
    "agent.create",
    "agent.read",
    "agent.configure",
  ],
};

revisions[5] = {
  [BuiltinRoles.MemberId]: [...revisions[4]![BuiltinRoles.MemberId]!, "connection-v2.read"],
  [BuiltinRoles.AdministratorId]: [
    ...revisions[4]![BuiltinRoles.AdministratorId]!,
    "connection-v2.create",
    "connection-v2.read",
    "connection-v2.manage",
  ],
  [BuiltinRoles.OwnerId]: [
    ...revisions[4]![BuiltinRoles.OwnerId]!,
    "connection-v2.create",
    "connection-v2.read",
    "connection-v2.manage",
  ],
};

revisions[6] = {
  [BuiltinRoles.MemberId]: [
    ...revisions[5]![BuiltinRoles.MemberId]!,
    "connection-v2.use",
    "agent-v2.read",
  ],
  [BuiltinRoles.AdministratorId]: [
    ...revisions[5]![BuiltinRoles.AdministratorId]!,
    "connection-v2.use",
    "agent-v2.create",
    "agent-v2.read",
    "agent-v2.configure",
  ],
  [BuiltinRoles.OwnerId]: [
    ...revisions[5]![BuiltinRoles.OwnerId]!,
    "connection-v2.use",
    "agent-v2.create",
    "agent-v2.read",
    "agent-v2.configure",
  ],
};

// The connections, environments, and agents that agents v2 and connections v2 replaced are gone.
const replaced = new Set([
  "connection.create",
  "connection.read",
  "connection.manage",
  "connection.use",
  "environment.create",
  "environment.read",
  "environment.manage",
  "environment.use",
  "agent.create",
  "agent.read",
  "agent.configure",
]);
revisions[7] = Object.fromEntries(
  Object.entries(revisions[6]!).map(([roleId, names]) => [
    roleId,
    names.filter((name) => !replaced.has(name)),
  ]),
);

it("the registered declarations make the current revision's bundles", () => {
  expect(Math.max(...Object.keys(revisions).map(Number))).toBe(BuiltinRoles.revision);
  expect(
    Object.fromEntries(
      BuiltinRoles.make(workspaceId, Core.permissions).map((role) => [role.id, role.permissions]),
    ),
  ).toEqual(revisions[BuiltinRoles.revision]);
});
