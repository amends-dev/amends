import { Grant, Scope } from "@amends-dev/core/authorization"
import { Group, GroupPermissions } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { Command, click, expect, given, label, role, scene, text, type } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { aliceInDesign, aliceInGeneral, bob, design, general, membership } from "../../../test/fixtures.ts"
import { CreateTeam } from "./command.ts"
import { Message } from "./definition.ts"
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

/** The groups read, as a member who may create teams sees them. */
const listed = modifyFields(init(workspace.id, member.id).model, {
  groups: () => [
    { group: general, pending: false },
    { group: design, pending: false },
    { group: announcements, pending: false }
  ],
  members: () => [bob],
  memberships: () => [aliceInGeneral, aliceInDesign],
  grants: () => [Grant.make(GroupPermissions.Create, Scope.Scope.cases.Workspace.make({ workspaceId: workspace.id }))]
})

describe("the groups", () => {
  it("list the person's groups apart from the teams they may join, and take a new team", () => {
    scene(
      { update, view },
      given(listed),
      expect(role("list", { name: "Your groups" })).toExist(),
      expect(role("button", { name: "Design" })).toExist(),
      expect(role("list", { name: "Other teams" })).toExist(),
      expect(role("button", { name: "Announcements" })).toExist(),
      click(role("button", { name: "New team" })),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.expectExact(
        CreateTeam({ workspaceId: workspace.id, memberId: member.id, name: "Research", isPublic: false })
      ),
      Command.resolve(CreateTeam, Message.WroteAction()),
      expect(role("button", { name: "New team" })).toExist()
    )
  })

  it("offer a new team only to someone who may create one", () => {
    scene(
      { update, view },
      given(modifyFields(listed, { grants: () => [] })),
      expect(role("button", { name: "New team" })).toBeAbsent(),
      expect(role("button", { name: "New conversation" })).toExist(),
      click(role("button", { name: "New conversation" })),
      expect(text("Choose a member")).toExist()
    )
  })
})
