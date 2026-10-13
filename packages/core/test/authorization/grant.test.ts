import { WorkspaceId, MemberId } from "@amends-dev/core/workspace"
import { expect, it } from "@effect/vitest"
import { Effect, Schema, SchemaIssue } from "effect"
import * as Grant from "../../src/authorization/Grant.ts"
import * as Permission from "../../src/authorization/Permission.ts"
import * as Scope from "../../src/authorization/Scope.ts"
import * as Target from "../../src/authorization/Target.ts"
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const workspaceScope = Scope.Scope.cases.Workspace.make({ workspaceId })
const exactWorkspace = Scope.Scope.cases.Target.make({
  target: Target.Reference.cases.Workspace.make({ workspaceId })
})
const exactMember = Scope.Scope.cases.Target.make({
  target: Target.Reference.cases.Member.make({ workspaceId, memberId: MemberId.MemberId.make("member-1") })
})
const ManageWorkspace = Permission.make("test.workspace.manage", {
  targetKind: "Workspace",
  builtinTier: "administrator"
})
it("workspace grants store permission names and scopes for either target kind", () => {
  for (const permission of [MemberPermissions.Read, MemberPermissions.Remove, ManageWorkspace]) {
    expect(Grant.make(permission, workspaceScope)).toEqual({
      permission: permission.name,
      scope: workspaceScope
    })
  }
})
it("exact grants accept scopes matching the permission's target kind", () => {
  expect(Grant.make(MemberPermissions.Remove, exactMember)).toEqual({
    permission: MemberPermissions.Remove.name,
    scope: exactMember
  })
  expect(Grant.make(ManageWorkspace, exactWorkspace)).toEqual({
    permission: ManageWorkspace.name,
    scope: exactWorkspace
  })
})
it("grant construction rejects incompatible exact scopes", () => {
  expect(() => Grant.make(MemberPermissions.Remove, exactWorkspace)).toThrow("Schema validation failed")
  expect(() => Grant.make(ManageWorkspace, exactMember)).toThrow("Schema validation failed")
})
it.effect("definition-aware schemas validate stored names and scopes when decoding or constructing", () =>
  Effect.gen(function* () {
    for (const [permission, compatible, incompatible] of [
      [MemberPermissions.Remove, exactMember, exactWorkspace],
      [ManageWorkspace, exactWorkspace, exactMember]
    ] as const) {
      const schema = Grant.makeSchema(permission)
      const decode = Schema.decodeUnknownEffect(schema)
      for (const scope of [workspaceScope, compatible]) {
        const stored = { permission: permission.name, scope }
        expect(yield* decode(stored)).toEqual(stored)
      }
      const invalid = { permission: permission.name, scope: incompatible }
      const error = yield* decode(invalid).pipe(Effect.flip)
      const issue = yield* schema.makeEffect(invalid).pipe(Effect.flip)
      for (const message of [error.message, SchemaIssue.makeFormatterDefault()(issue)]) {
        expect(message).toContain(`requires a ${permission.targetKind} target`)
        expect(message).toContain('["scope"]["target"]')
      }
      const wrongName = yield* decode({
        permission: MemberPermissions.Read.name,
        scope: workspaceScope
      }).pipe(Effect.flip)
      expect(wrongName.message).toContain(`Expected permission ${permission.name}`)
      expect(wrongName.message).toContain('["permission"]')
    }
  })
)
