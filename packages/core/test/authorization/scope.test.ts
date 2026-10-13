import { ThreadId } from "@amends-dev/core/thread"
import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import { expect, it } from "@effect/vitest"
import * as Scope from "../../src/authorization/Scope.ts"
import * as Target from "../../src/authorization/Target.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const otherWorkspaceId = WorkspaceId.WorkspaceId.make("workspace-2")
const memberId = MemberId.MemberId.make("member-1")
const workspace = Target.Reference.cases.Workspace.make({ workspaceId })
const otherWorkspace = Target.Reference.cases.Workspace.make({ workspaceId: otherWorkspaceId })
const member = Target.Reference.cases.Member.make({ workspaceId, memberId })
const otherMember = Target.Reference.cases.Member.make({
  workspaceId,
  memberId: MemberId.MemberId.make("member-2")
})
const memberElsewhere = Target.Reference.cases.Member.make({
  workspaceId: otherWorkspaceId,
  memberId
})

it("workspace scope covers resources only within that workspace", () => {
  const scope = Scope.Scope.cases.Workspace.make({ workspaceId })

  expect(Scope.covers(scope, workspace)).toBe(true)
  expect(Scope.covers(scope, member)).toBe(true)
  expect(Scope.covers(scope, otherMember)).toBe(true)
  expect(Scope.covers(scope, otherWorkspace)).toBe(false)
  expect(Scope.covers(scope, memberElsewhere)).toBe(false)
})

it("exact member scope requires matching workspace, resource kind, and member ID", () => {
  const scope = Scope.Scope.cases.Target.make({ target: member })

  expect(Scope.covers(scope, { ...member })).toBe(true)
  expect(Scope.covers(scope, otherMember)).toBe(false)
  expect(Scope.covers(scope, memberElsewhere)).toBe(false)
  expect(Scope.covers(scope, workspace)).toBe(false)
})

it("an exact workspace target covers the workspace itself without covering its members", () => {
  const scope = Scope.Scope.cases.Target.make({ target: workspace })

  expect(Scope.covers(scope, { ...workspace })).toBe(true)
  expect(Scope.covers(scope, otherWorkspace)).toBe(false)
  expect(Scope.covers(scope, member)).toBe(false)
})

it("thread targets preserve exact scope and workspace boundaries even when IDs coincide", () => {
  const thread = Target.Reference.cases.Thread.make({
    workspaceId,
    threadId: ThreadId.ThreadId.make(memberId)
  })
  const exact = Scope.Scope.cases.Target.make({ target: thread })
  expect(Scope.covers(exact, thread)).toBe(true)
  expect(Scope.covers(exact, member)).toBe(false)
  expect(Scope.covers(exact, { ...thread, threadId: ThreadId.ThreadId.make("another") })).toBe(false)
  expect(Scope.covers(exact, { ...thread, workspaceId: otherWorkspaceId })).toBe(false)
  expect(Scope.covers(Scope.Scope.cases.Workspace.make({ workspaceId }), thread)).toBe(true)
  expect(Scope.covers(Scope.Scope.cases.Workspace.make({ workspaceId: otherWorkspaceId }), thread)).toBe(false)
  expect(Scope.covers(Scope.Scope.cases.Target.make({ target: workspace }), thread)).toBe(false)
})
