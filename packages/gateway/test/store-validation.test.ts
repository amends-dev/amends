import { Assignment, Grant, Role, Scope, Target } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Entry, Store } from "@amends-dev/core/journal"
import { ThreadId } from "@amends-dev/core/thread"
import {
  Invitation,
  Member,
  MemberPermissions,
  type Workspace,
  type WorkspaceId,
  MemberId
} from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option } from "effect"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import { type Bound, boundTo, otherWorkspaceId, runHost, workspaceId } from "./support.ts"

/** Every store checks its input before its driver sees it, and refuses it whole. */
describe("store validation", () => {
  const { initialized } = Support
  const permission = MemberPermissions.Read.name
  const roleId = Role.RoleId.make("contract-role")
  const localScope = (
    kind: "Workspace" | "TargetWorkspace" | "TargetMember" | "TargetThread" | "TargetGroup",
    id: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId
  ): Scope.Scope => {
    if (kind === "Workspace") return Scope.Scope.cases.Workspace.make({ workspaceId: id })
    return Scope.Scope.cases.Target.make({
      target:
        kind === "TargetGroup"
          ? Target.Reference.cases.Group.make({
              workspaceId: id,
              groupId: GroupId.GroupId.make("group")
            })
          : kind === "TargetThread"
            ? Target.Reference.cases.Thread.make({
                workspaceId: id,
                threadId: ThreadId.ThreadId.make("thread")
              })
            : kind === "TargetMember"
              ? Target.Reference.cases.Member.make({ workspaceId: id, memberId })
              : Target.Reference.cases.Workspace.make({ workspaceId: id })
    })
  }
  const source = (kind: "Role" | "Direct", scope: Scope.Scope): Assignment.Source =>
    kind === "Role"
      ? Assignment.Source.cases.Role.make({ roleId, scope })
      : Assignment.Source.cases.Direct.make({ grant: Grant.Grant.make({ permission, scope }) })
  const seed = (bound: Bound) =>
    Effect.gen(function* () {
      const workspace = yield* initialized(bound)
      const role = Role.Role.make({
        id: roleId,
        workspaceId,
        name: "Readers",
        permissions: [permission]
      })
      yield* bound.store.transaction(bound.roles.insert(role))
      return { workspace, role }
    })
  it.effect("role validation rejects invalid inserts and edits without poisoning the transaction or record", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const { role } = yield* seed(bound)
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const record of [
                { ...role, id: Role.RoleId.make("invalid"), name: "" },
                { ...role, id: Role.RoleId.make("invalid"), permissions: [permission, permission] }
              ]) {
                expect(yield* Effect.flip(bound.roles.insert(record))).toMatchObject({
                  _tag: "StoreError",
                  store: "RoleStore",
                  operation: "insert",
                  reason: { _tag: "Rejected" }
                })
              }
              expect(yield* bound.roles.get(Role.RoleId.make("invalid"))).toEqual(Option.none())
              expect(yield* Effect.flip(bound.roles.rename(roleId, ""))).toMatchObject({
                _tag: "StoreError",
                store: "RoleStore",
                operation: "rename",
                reason: { _tag: "Rejected" }
              })
              expect(yield* Effect.flip(bound.roles.setPermissions(roleId, [permission, permission]))).toMatchObject({
                _tag: "StoreError",
                store: "RoleStore",
                operation: "setPermissions",
                reason: { _tag: "Rejected" }
              })
              expect(yield* bound.roles.get(roleId)).toEqual(Option.some(role))
              yield* bound.roles.rename(roleId, "Renamed")
              yield* bound.roles.setPermissions(roleId, [])
            })
          )
          expect(yield* bound.roles.get(roleId)).toEqual(Option.some({ ...role, name: "Renamed", permissions: [] }))
        })
      )
    )
  )

  it.effect.each([
    ["Role", "Workspace"],
    ["Role", "TargetWorkspace"],
    ["Role", "TargetMember"],
    ["Role", "TargetThread"],
    ["Role", "TargetGroup"],
    ["Direct", "Workspace"],
    ["Direct", "TargetWorkspace"],
    ["Direct", "TargetMember"],
    ["Direct", "TargetThread"],
    ["Direct", "TargetGroup"]
  ] as const)("%s assignments reject a foreign %s scope before converting columns", ([kind, scopeKind]) =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const { workspace } = yield* seed(bound)
          const record: Assignment.Assignment = {
            id: Assignment.AssignmentId.make("contract-assignment"),
            workspaceId,
            memberId: workspace.ownerMemberId,
            status: "active",
            source: source(kind, localScope(scopeKind, otherWorkspaceId, workspace.ownerMemberId))
          }
          const valid: Assignment.Assignment = {
            id: record.id,
            workspaceId: record.workspaceId,
            memberId: record.memberId,
            status: record.status,
            source: source(kind, localScope(scopeKind, workspaceId, workspace.ownerMemberId))
          }
          yield* bound.store.transaction(
            Effect.gen(function* () {
              expect(yield* Effect.flip(bound.assignments.insert(record))).toMatchObject({
                _tag: "StoreError",
                store: "AssignmentStore",
                operation: "insert",
                reason: { _tag: "Rejected" }
              })
              expect(yield* bound.assignments.get(record.id)).toEqual(Option.none())
              yield* bound.assignments.insert(valid)
            })
          )
          expect(yield* bound.assignments.get(record.id)).toEqual(Option.some(valid))
        })
      )
    )
  )

  it.effect.each(["missing", "blank"] as const)(
    "invitations reject a %s role and invalid expiry without leaving partial rows",
    (invalidRole) =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId)
            const { workspace } = yield* seed(bound)
            const issuedAt = DateTime.makeUnsafe("2026-09-18T12:00:00Z")
            const record: Invitation.Invitation = {
              details: {
                id: Invitation.InvitationId.make("contract-invitation"),
                workspaceId,
                recipientId: Identity.HumanId.make("recipient"),
                inviterMemberId: workspace.ownerMemberId,
                issuedAt,
                expiresAt: DateTime.add(issuedAt, { hours: 1 }),
                roleId
              },
              state: { _tag: "Pending" }
            }
            const valid: Invitation.Invitation = {
              state: record.state,
              details: {
                ...record.details,
                roleId
              }
            }
            Reflect.set(record.details, "roleId", invalidRole === "missing" ? undefined : "")
            yield* bound.store.transaction(
              Effect.gen(function* () {
                expect(yield* Effect.flip(bound.invitations.insert(record))).toMatchObject({
                  _tag: "StoreError",
                  store: "InvitationStore",
                  operation: "insert",
                  reason: { _tag: "Rejected" }
                })
                expect(
                  yield* Effect.flip(
                    bound.invitations.insert({
                      state: valid.state,
                      details: { ...valid.details, expiresAt: issuedAt }
                    })
                  )
                ).toMatchObject({
                  _tag: "StoreError",
                  store: "InvitationStore",
                  operation: "insert",
                  reason: { _tag: "Rejected" }
                })
                expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.none())
                yield* bound.invitations.insert(valid)
              })
            )
            expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.some(valid))
          })
        )
      )
  )

  it.effect("checkpoint validation rejects invalid progress without leaving a partial checkpoint", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const saved = yield* bound.store.transaction(
            Effect.gen(function* () {
              const storeTransaction = yield* Store.Transaction
              const [entry] = yield* storeTransaction.append({
                logId: Entry.LogId.make("checkpoint-contract"),
                entries: [{ payload: new Uint8Array([1]) }]
              })
              if (entry === undefined) return yield* Effect.die("Append returned no entry")
              const key = { logId: entry.logId, name: "contract-projection", version: 1 }
              const cursor = {
                position: entry.position,
                commitId: entry.commitId,
                index: entry.index,
                entryId: entry.id
              }
              expect(yield* Effect.flip(bound.checkpoints.set(key, { ...cursor, index: -1 }))).toMatchObject({
                _tag: "StoreError",
                store: "Checkpoint",
                operation: "set",
                reason: { _tag: "Rejected" }
              })
              expect(yield* Effect.flip(bound.checkpoints.set({ ...key, version: Number.NaN }, cursor))).toMatchObject({
                _tag: "StoreError",
                store: "Checkpoint",
                operation: "set",
                reason: { _tag: "Rejected" }
              })
              expect(yield* bound.checkpoints.get(key)).toEqual(Option.none())
              yield* bound.checkpoints.set(key, cursor)
              return { key, cursor }
            })
          )
          expect(yield* bound.checkpoints.get(saved.key)).toEqual(Option.some(saved.cursor))
        })
      )
    )
  )

  it.effect("workspace names are required at the store boundary without partial writes", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          const record: Workspace.Workspace = {
            id: workspaceId,
            name: "Design & Engineering",
            createdBy: Identity.HumanId.make("owner"),
            ownerMemberId: MemberId.MemberId.make("owner-member")
          }
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const name of ["", " \t\n", " padded "]) {
                expect(
                  yield* Effect.flip(
                    bound.workspace.insert({
                      id: record.id,
                      name,
                      createdBy: record.createdBy,
                      ownerMemberId: record.ownerMemberId
                    })
                  )
                ).toMatchObject({
                  _tag: "StoreError",
                  store: "WorkspaceStore",
                  operation: "insert",
                  reason: { _tag: "Rejected" }
                })
                expect(yield* bound.workspace.get).toEqual(Option.none())
              }
              yield* bound.workspace.insert(record)
            })
          )
          expect(yield* bound.workspace.get).toEqual(Option.some(record))
        })
      )
    )
  )

  it.effect("contact identities cannot be persisted as workspace memberships", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const bound = yield* boundTo(workspaceId)
          yield* initialized(bound)
          const invalid: Member.Member = {
            id: MemberId.MemberId.make("contact-member"),
            workspaceId,
            status: "active",
            identity: Identity.MemberReference.cases.Human.make({
              id: Identity.HumanId.make("external")
            }),
            name: Member.Name.make("external")
          }
          Reflect.set(
            invalid,
            "identity",
            Identity.Reference.cases.Contact.make({ id: Identity.ContactId.make("external") })
          )
          yield* bound.store.transaction(
            Effect.gen(function* () {
              expect(yield* Effect.flip(bound.members.insert(invalid))).toMatchObject({
                _tag: "StoreError",
                store: "MemberStore",
                reason: { _tag: "Rejected" }
              })
              expect(yield* bound.members.get(invalid.id)).toEqual(Option.none())
              yield* bound.members.insert(
                Object.assign({}, invalid, {
                  identity: Identity.MemberReference.cases.Human.make({
                    id: Identity.HumanId.make("valid")
                  })
                })
              )
            })
          )
          expect(Option.isSome(yield* bound.members.get(invalid.id))).toBe(true)
        })
      )
    )
  )
})
