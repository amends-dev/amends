import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, click, expect, given, label, role, scene, text, type, within } from "foldkit/scene"
import { membership, session } from "../test/fixtures.ts"
import { SignOut } from "./command.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { SendCode } from "./page/signIn/command.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"
import { Workspaces } from "./page/workspaces/definition.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const signedOut: Model = { page: Page.SignedOut({ signIn: SignInBlock.init("").model }) }

/** Signed in as alice, who belongs to one workspace, with none of them opened. */
const choosing: Model = {
  page: Page.SignedIn({
    account: session.account,
    workspaces: WorkspacesBlock.Model.make({ workspaces: Workspaces.Loaded({ memberships: [membership] }) }),
    workspace: Option.none()
  })
}

/** Signed in as alice, with her workspace opened. */
const inWorkspace: Model = {
  page: Page.SignedIn({
    account: session.account,
    workspaces: WorkspacesBlock.Model.make({ workspaces: Workspaces.Loaded({ memberships: [membership] }) }),
    workspace: Option.some({
      workspaceId: membership.workspace.id,
      model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, membership.workspace.name).model
    })
  })
}

describe("the app", () => {
  it("shows the sign-in form under the brand while signed out, and asks for a code to the address entered", () => {
    scene(
      { update, view },
      given(signedOut),
      expect(within(role("banner"), text("amends"))).toExist(),
      expect(within(role("main"), role("heading", { name: "Sign in to amends", level: 1 }))).toExist(),
      expect(within(role("banner"), role("button", { name: "Sign out" }))).toBeAbsent(),
      type(label("Email"), "alice@example.com"),
      click(role("button", { name: "Continue" })),
      Command.expectExact(SendCode({ email: "alice@example.com" })),
      Command.resolve(SendCode, SignInBlock.Message.SucceededSendCode()),
      expect(within(role("main"), role("heading", { name: "Enter your code" }))).toExist()
    )
  })

  it("shows who is signed in and the way out in the header, over the workspaces to choose from", () => {
    scene(
      { update, view },
      given(choosing),
      expect(within(role("banner"), text("amends"))).toExist(),
      expect(within(role("banner"), text("alice@example.com"))).toExist(),
      expect(within(role("banner"), role("button", { name: "Sign out" }))).toExist(),
      expect(within(role("main"), role("heading", { name: "Choose a workspace", level: 1 }))).toExist(),
      expect(within(role("main"), role("button", { name: "Studio" }))).toExist()
    )
  })

  it("signs out from the header, back to the sign-in form with the address kept", () => {
    scene(
      { update, view },
      given(choosing),
      click(within(role("banner"), role("button", { name: "Sign out" }))),
      Command.expectExact(SignOut()),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("heading", { name: "Sign in to amends" })).toExist(),
      expect(label("Email")).toHaveValue("alice@example.com")
    )
  })

  it("keeps its own header over an opened workspace", () => {
    scene(
      { update, view },
      given(inWorkspace),
      expect(text("alice@example.com")).toExist(),
      expect(role("button", { name: "Sign out" })).toExist(),
      expect(role("heading", { name: "Choose a workspace" })).toBeAbsent(),
      expect(role("heading", { name: "Sign in to amends" })).toBeAbsent()
    )
  })
})
