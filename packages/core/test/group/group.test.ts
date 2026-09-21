import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Group } from "../../src/group/group.ts";
import { GroupMembership } from "../../src/group/membership/membership.ts";
import { Scope } from "../../src/authorization/scope.ts";
import { Target } from "../../src/authorization/target.ts";
import { ThreadId } from "../../src/thread/id.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";

it("creation accepts an explicit empty audience but rejects duplicate members and blank or untrimmed names", () => {
  const decode = Schema.decodeUnknownOption(Group.CreatePrivateTeamInput);
  expect(decode({ name: "Engineering", memberIds: [] })._tag).toBe("Some");
  for (const input of [
    { name: "", memberIds: [] },
    { name: " Engineering ", memberIds: [] },
    { name: "Engineering", memberIds: ["member", "member"] },
    { name: "Engineering", memberIds: [""] },
  ])
    expect(decode(input)._tag).toBe("None");
});

it("persisted group records reject kinds and visibility whose workflows are not implemented", () => {
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
  for (const invalid of [
    { ...record, kind: "DM" },
    { ...record, visibility: "Public" },
  ])
    expect(decode(invalid)._tag).toBe("None");
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
