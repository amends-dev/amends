import { WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { click, expect, expectOutMessage, given, role, scene, text, within } from "foldkit/scene"
import { membership } from "../../../test/fixtures.ts"
import { Model, OutMessage, Workspaces } from "./definition.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

/** A workspace of two people, in which the person goes by another name. */
const fieldwork = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-2", name: "Fieldwork", createdBy: "bob", ownerMemberId: "member-9" },
  member: {
    id: "member-10",
    workspaceId: "workspace-2",
    identity: { _tag: "Human", id: "alice" },
    name: "Ali",
    status: "active"
  },
  people: 2
})

const showing = (workspaces: Workspaces) => Model.make({ workspaces })

describe("the workspaces page", () => {
  it("counts the workspaces and lists each with the name the person goes by in it", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Loaded({ memberships: [membership, fieldwork] }))),
      expect(role("heading", { name: "Choose a workspace", level: 1 })).toExist(),
      expect(text("2 workspaces")).toExist(),
      expect(role("heading", { name: "Your workspaces", level: 2 })).toExist(),
      expect(role("list", { name: "Workspaces" })).toExist(),
      expect(role("button", { name: "Studio" })).toHaveAttr("aria-description", "1 member · as Alice"),
      expect(within(role("button", { name: "Studio" }), text("S"))).toExist(),
      expect(within(role("button", { name: "Studio" }), text("Open →"))).toExist(),
      expect(role("button", { name: "Fieldwork" })).toHaveAttr("aria-description", "2 members · as Ali"),
      expect(within(role("button", { name: "Fieldwork" }), text("F"))).toExist()
    )
  })

  it("opens the workspace of the row the person picks", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Loaded({ memberships: [membership, fieldwork] }))),
      click(role("button", { name: "Fieldwork" })),
      expectOutMessage(OutMessage.OpenedWorkspace({ membership: fieldwork }))
    )
  })

  it("counts one workspace in the singular", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Loaded({ memberships: [membership] }))),
      expect(text("1 workspace")).toExist(),
      expect(role("button", { name: "Studio" })).toExist()
    )
  })

  it("says the workspaces are loading", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Loading())),
      expect(role("heading", { name: "Choose a workspace" })).toExist(),
      expect(text("Loading your workspaces…")).toExist(),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent()
    )
  })

  it("says why they could not be loaded", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Failed({ error: "The host could not be reached. Try again." }))),
      expect(role("alert")).toHaveText("The host could not be reached. Try again."),
      expect(role("heading", { name: "Your workspaces" })).toBeAbsent()
    )
  })

  it("says the person belongs to none", () => {
    scene(
      { update, view },
      given(showing(Workspaces.Loaded({ memberships: [] }))),
      expect(text("You belong to no workspace yet.")).toExist(),
      expect(role("list", { name: "Workspaces" })).toBeAbsent()
    )
  })
})
