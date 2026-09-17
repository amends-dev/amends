import { expect, test } from "bun:test";
import { Scope } from "../src/authorization/scope.ts";
import { Target } from "../src/authorization/target.ts";
import { Member } from "../src/workspace/member.ts";
import { Workspace } from "../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-1");
const otherWorkspaceId = Workspace.Id.make("workspace-2");
const memberId = Member.Id.make("member-1");
const workspace = Target.Reference.cases.Workspace.make({ workspaceId });
const otherWorkspace = Target.Reference.cases.Workspace.make({ workspaceId: otherWorkspaceId });
const member = Target.Reference.cases.Member.make({ workspaceId, memberId });
const otherMember = Target.Reference.cases.Member.make({
  workspaceId,
  memberId: Member.Id.make("member-2"),
});
const memberElsewhere = Target.Reference.cases.Member.make({
  workspaceId: otherWorkspaceId,
  memberId,
});

test("workspace scope covers resources only within that workspace", () => {
  const scope = Scope.Value.cases.Workspace.make({ workspaceId });

  expect(Scope.covers(scope, workspace)).toBe(true);
  expect(Scope.covers(scope, member)).toBe(true);
  expect(Scope.covers(scope, otherMember)).toBe(true);
  expect(Scope.covers(scope, otherWorkspace)).toBe(false);
  expect(Scope.covers(scope, memberElsewhere)).toBe(false);
});

test("exact member scope requires matching workspace, resource kind, and member ID", () => {
  const scope = Scope.Value.cases.Target.make({ target: member });

  expect(Scope.covers(scope, { ...member })).toBe(true);
  expect(Scope.covers(scope, otherMember)).toBe(false);
  expect(Scope.covers(scope, memberElsewhere)).toBe(false);
  expect(Scope.covers(scope, workspace)).toBe(false);
});

test("an exact workspace target covers the workspace itself without covering its members", () => {
  const scope = Scope.Value.cases.Target.make({ target: workspace });

  expect(Scope.covers(scope, { ...workspace })).toBe(true);
  expect(Scope.covers(scope, otherWorkspace)).toBe(false);
  expect(Scope.covers(scope, member)).toBe(false);
});
