import { Scope, Target } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import { expect, it } from "@effect/vitest"
import { Schema } from "effect"
import * as ScopeColumns from "../src/ScopeColumns.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace")
const decode = Schema.decodeUnknownOption(Scope.Scope)

it("scope columns preserve every target variant without broadening exact grants", () => {
  const scopes = [
    Scope.Scope.cases.Workspace.make({ workspaceId }),
    ...[
      Target.Reference.cases.Workspace.make({ workspaceId }),
      Target.Reference.cases.Member.make({ workspaceId, memberId: MemberId.MemberId.make("same") }),
      Target.Reference.cases.Thread.make({ workspaceId, threadId: ThreadId.ThreadId.make("same") }),
      Target.Reference.cases.Group.make({ workspaceId, groupId: GroupId.GroupId.make("same") })
    ].map((target) => Scope.Scope.cases.Target.make({ target }))
  ]
  for (const scope of scopes)
    expect(Schema.decodeUnknownSync(Scope.Scope)(ScopeColumns.decode(workspaceId, ScopeColumns.encode(scope)))).toEqual(
      scope
    )
})

it("unknown, incomplete, and contradictory scope columns fail decoding", () => {
  const valid = ScopeColumns.encode(
    Scope.Scope.cases.Target.make({
      target: Target.Reference.cases.Thread.make({
        workspaceId,
        threadId: ThreadId.ThreadId.make("thread")
      })
    })
  )
  const unknown = { ...valid }
  Reflect.set(unknown, "targetKind", "Unknown")
  for (const columns of [
    unknown,
    { ...valid, targetKind: null },
    { ...valid, targetThreadId: null },
    { ...valid, targetMemberId: "member" },
    { ...valid, targetGroupId: "group" },
    { ...valid, scopeKind: "Workspace" as const },
    { ...valid, targetKind: "Member" as const, targetMemberId: "member" }
  ])
    expect(decode(ScopeColumns.decode(workspaceId, columns))._tag).toBe("None")
})
