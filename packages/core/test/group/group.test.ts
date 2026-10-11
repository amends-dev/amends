import { expect, it } from "@effect/vitest";
import { DateTime, Schema } from "effect";
import * as Group from "../../src/group/Group.ts";
import * as GroupMembership from "../../src/group/GroupMembership.ts";
import * as Scope from "../../src/authorization/Scope.ts";
import * as Target from "../../src/authorization/Target.ts";
import * as ThreadId from "../../src/thread/ThreadId.ts";
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts";
import * as Member from "../../src/workspace/Member.ts";

it("creation accepts an explicit empty audience but rejects duplicate members and blank or untrimmed names", () => {
  const decode = Schema.decodeUnknownOption(Group.CreateTeamInput);
  expect(decode({ name: "Engineering", memberIds: [] })._tag).toBe("Some");
  expect(decode({ name: "Lobby", memberIds: [], visibility: "Public" })._tag).toBe("Some");
  for (const input of [
    { name: "Engineering", memberIds: [], visibility: "Secret" },
    { name: "", memberIds: [] },
    { name: " Engineering ", memberIds: [] },
    { name: "Engineering", memberIds: ["member", "member"] },
    { name: "Engineering", memberIds: [""] },
  ])
    expect(decode(input)._tag).toBe("None");
});

it("persisted team groups are private or public; other kinds and visibilities are rejected", () => {
  const record = {
    id: "group",
    workspaceId: "workspace",
    kind: "Team",
    visibility: "Private",
    name: "Engineering",
    createdBy: "member",
    createdAt: "2026-09-21T12:00:00.000Z",
  };
  const decode = Schema.decodeUnknownOption(Group.Record);
  expect(decode(record)._tag).toBe("Some");
  expect(decode({ ...record, visibility: "Public" })._tag).toBe("Some");
  for (const invalid of [
    { ...record, kind: "DM" },
    { ...record, visibility: "Secret" },
    { ...record, name: "" },
  ])
    expect(decode(invalid)._tag).toBe("None");
});

it("direct groups hold two or more ordered members, including their creator, and no name", () => {
  const record = {
    id: "direct",
    workspaceId: "workspace",
    kind: "Direct",
    memberIds: ["alice", "bob", "carol"],
    createdBy: "bob",
    createdAt: "2026-09-21T12:00:00.000Z",
  };
  const decode = Schema.decodeUnknownOption(Group.Record);
  expect(decode(record)._tag).toBe("Some");
  for (const invalid of [
    { ...record, memberIds: ["alice"] },
    { ...record, memberIds: ["bob", "alice"] },
    { ...record, memberIds: ["alice", "alice"] },
    { ...record, createdBy: "dave" },
  ])
    expect(decode(invalid)._tag).toBe("None");
});

it("a direct group's key depends only on its member set", () => {
  const [alice, bob, carol] = ["alice", "bob", "carol"].map((id) => Member.Id.make(id));
  expect(Group.directMembers([carol!, alice!, bob!, alice!])).toEqual([alice, bob, carol]);
  expect(Group.directKey([bob!, alice!])).toBe(Group.directKey([alice!, bob!, bob!]));
  expect(Group.directKey([alice!, bob!])).not.toBe(Group.directKey([alice!, bob!, carol!]));
  // IDs containing separators cannot make two member sets share a key.
  expect(Group.directKey([Member.Id.make("a,b"), Member.Id.make("c")])).not.toBe(
    Group.directKey([Member.Id.make("a"), Member.Id.make("b,c")]),
  );
});

it("adding a member requires both nonempty membership and group IDs", () => {
  const decode = Schema.decodeUnknownOption(GroupMembership.AddInput);
  expect(decode({ groupId: "group", memberId: "member" })._tag).toBe("Some");
  for (const input of [
    {},
    { groupId: "group" },
    { memberId: "member" },
    { groupId: "", memberId: "member" },
    { groupId: "group", memberId: "" },
  ])
    expect(decode(input)._tag).toBe("None");
});

it("exact group grants stay separate from other groups, workspaces, and same-ID threads", () => {
  const workspaceId = WorkspaceId.Id.make("workspace");
  const group = Target.Reference.cases.Group.make({ workspaceId, groupId: Group.Id.make("same") });
  const exact = Scope.Value.cases.Target.make({ target: group });
  expect(Scope.covers(exact, group)).toBe(true);
  expect(Scope.covers(Scope.Value.cases.Workspace.make({ workspaceId }), group)).toBe(true);
  for (const other of [
    { ...group, groupId: Group.Id.make("other") },
    { ...group, workspaceId: WorkspaceId.Id.make("other") },
    Target.Reference.cases.Thread.make({ workspaceId, threadId: ThreadId.Id.make("same") }),
  ])
    expect(Scope.covers(exact, other)).toBe(false);
});

it("lists a group with what is new to its reader and what their grants let them do", () => {
  const at = (minute: number) => {
    const minutes = String(minute).padStart(2, "0");
    return DateTime.makeUnsafe(`2026-10-09T12:${minutes}:00.000Z`);
  };
  const team: Group.Record = {
    id: Group.Id.make("team"),
    workspaceId: WorkspaceId.Id.make("workspace"),
    kind: "Team",
    visibility: "Public",
    name: "Team",
    createdBy: Member.Id.make("alice"),
    createdAt: at(0),
  };
  const direct: Group.Record = {
    id: Group.Id.make("direct"),
    workspaceId: team.workspaceId,
    kind: "Direct",
    memberIds: [Member.Id.make("alice"), Member.Id.make("bob")],
    createdBy: Member.Id.make("alice"),
    createdAt: at(0),
  };
  const quiet = { latestActivityAt: null, readAt: null, following: false, pending: 0 };
  const all = { manage: true, rename: true, moderate: true };

  // New activity is a message after the reader last read, or after they joined if they never did.
  expect(Group.hasNewActivity(null, null, at(1))).toBe(false);
  expect(Group.hasNewActivity(at(2), null, at(1))).toBe(true);
  expect(Group.hasNewActivity(at(2), null, at(3))).toBe(false);
  expect(Group.hasNewActivity(at(2), at(1), at(0))).toBe(true);
  expect(Group.hasNewActivity(at(2), at(2), at(0))).toBe(false);

  expect(Group.listItem(team, at(1), { ...quiet, latestActivityAt: at(2) }, all)).toMatchObject({
    newActivity: true,
    manageable: true,
    membersRemovable: true,
    renamable: true,
  });
  // Removing people from a public group is moderation; in a private group any manager may.
  expect(Group.listItem(team, at(1), quiet, { ...all, moderate: false }).membersRemovable).toBe(
    false,
  );
  expect(
    Group.listItem({ ...team, visibility: "Private" }, at(1), quiet, { ...all, moderate: false })
      .membersRemovable,
  ).toBe(true);
  // A direct group keeps its members and is named by them.
  expect(Group.listItem(direct, at(1), quiet, all)).toMatchObject({
    manageable: false,
    membersRemovable: false,
    renamable: false,
  });
});
