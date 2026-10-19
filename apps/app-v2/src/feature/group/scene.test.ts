import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupMembershipPermissions } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { expect, given, role, scene, text } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceInDesign, bob, bobInDesign, design, membership } from "../../../test/fixtures.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

/** A public team the person does not belong to. */
const announcements = Schema.decodeSync(Group.Group)({
  id: "announcements",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Announcements",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The team read, with alice and bob admitted, as a member who manages its members sees it. */
const opened = modifyFields(init(workspace.id, member.id, design.id).model, {
  group: () => Option.some({ group: design, pending: false }),
  memberships: () => [
    { membership: aliceInDesign, pending: false },
    { membership: bobInDesign, pending: false }
  ],
  members: () => [member, bob],
  grants: () => [
    Grant.make(GroupMembershipPermissions.Manage, Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id }))
  ]
})

describe("a group", () => {
  it("shows its name, the person's part in it, and its members, with removing for the others", () => {
    scene(
      { update, view },
      given(opened),
      expect(text("Design")).toExist(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Follow" })).toExist(),
      expect(role("button", { name: "Leave" })).toExist(),
      expect(text("Alice")).toExist(),
      expect(text("Bob")).toExist(),
      expect(role("button", { name: "Remove" })).toExist(),
      expect(text("Choose a member")).toBeAbsent(),
      expect(text("No threads yet.")).toExist()
    )
  })

  it("offers joining a public team the person does not belong to, in place of its threads", () => {
    scene(
      { update, view },
      given(
        modifyFields(init(workspace.id, member.id, announcements.id).model, {
          group: () => Option.some({ group: announcements, pending: false }),
          members: () => [member, bob]
        })
      ),
      expect(text("Announcements")).toExist(),
      expect(role("button", { name: "Join" })).toExist(),
      expect(role("button", { name: "Follow" })).toBeAbsent(),
      expect(text("Join this team to read its threads.")).toExist()
    )
  })
})
