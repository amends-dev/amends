import { Identity } from "@amends-dev/core/identity"
import { Accounts, type SignIn, WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { now } from "../test/fixtures.ts"
import { SignOut } from "./command.ts"
import { SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { init } from "./init.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { CheckCode, SendCode } from "./page/signIn/command.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { LoadIntegrations } from "./page/workspace/command.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"
import { LoadWorkspaces } from "./page/workspaces/command.ts"
import { update } from "./update.ts"

const session: SignIn.Session = {
  token: "alice",
  account: { id: Identity.HumanId.make("alice"), email: Accounts.Email.make("alice@example.com") }
}

const membership = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-1", name: "Studio", createdBy: "alice", ownerMemberId: "member-1" },
  member: {
    id: "member-1",
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: "alice" },
    name: "Alice",
    status: "active"
  },
  people: 1
})

const signedOut: Model = { page: Page.SignedOut({ signIn: SignInBlock.init("").model }), viewport: "Split", now }

/** What the sign-in form reports, as the root receives it. */
const fromSignIn = (model: Model, message: typeof SignInBlock.Message.Type) =>
  SignInBinding.embedView({
    slotId: "sign-in",
    model: Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => signIn }, () => SignInBlock.init("").model)
  }).toParentMessage(message)

/** What the workspace list reports, as the root receives it. */
const fromWorkspaces = (message: typeof WorkspacesBlock.Message.Type) =>
  WorkspacesBinding.embedView({ slotId: "workspaces", model: WorkspacesBlock.init().model }).toParentMessage(message)

/** What the open workspace reports, as the root receives it. */
const fromWorkspace = (message: typeof WorkspaceBlock.Message.Type) =>
  WorkspaceBinding.embedView({
    key: membership.workspace.id,
    slotId: "workspace",
    model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, "Studio", "Split").model,
    viewInputs: { email: session.account.email, now }
  }).toParentMessage(message)

/** The workspace the person opened, if any. */
const openedIn = (model: Model) =>
  Page.matchOrElse(model.page, { SignedIn: ({ workspace }) => workspace }, () => Option.none())

describe("the app", () => {
  it("signs in a step at a time, keeps the session, lists the workspaces, opens one, closes it, and signs out", () => {
    story(
      update,
      given(signedOut),
      message(fromSignIn(signedOut, SignInBlock.Message.TypedEmail({ email: "alice@example.com" }))),
      message(fromSignIn(signedOut, SignInBlock.Message.SubmittedEmail())),
      Command.expectExact(SendCode({ email: "alice@example.com" })),
      Command.resolve(SendCode, SignInBlock.Message.SucceededSendCode()),
      message(fromSignIn(signedOut, SignInBlock.Message.TypedCode({ code: "123456" }))),
      message(fromSignIn(signedOut, SignInBlock.Message.SubmittedCode())),
      Command.expectExact(CheckCode({ email: "alice@example.com", code: "123456" })),
      Command.resolve(CheckCode, SignInBlock.Message.SucceededSignIn({ session })),
      // Signed in, the workspaces are listed.
      Command.expectExact(LoadWorkspaces()),
      Command.resolve(LoadWorkspaces, WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      // Opened, the workspace asks the host once for the integrations its connections, agents, and channels read.
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      model((model) => {
        expect(
          Option.map(openedIn(model), ({ workspaceId, model }) => ({ workspaceId, memberId: model.memberId }))
        ).toEqual(Option.some({ workspaceId: membership.workspace.id, memberId: membership.member.id }))
      }),
      message(fromWorkspace(WorkspaceBlock.Message.ClickedAllWorkspaces())),
      model((model) => {
        expect(openedIn(model)).toEqual(Option.none())
      }),
      message(Message.ClickedSignOut()),
      Command.expectExact(SignOut()),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      model((model) => {
        expect(Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => signIn.form }, () => undefined)).toMatchObject(
          {
            _tag: "EnteringEmail",
            email: "alice@example.com"
          }
        )
      })
    )
  })

  it("signs out when the open workspace asks to, the same way as from the workspace list", () => {
    story(
      update,
      given(init({ session: Option.some(session), viewport: "Split", now }).model),
      message(fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership] }))),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      message(fromWorkspace(WorkspaceBlock.Message.ClickedSignOut())),
      Command.expectExact(SignOut()),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      model((model) => {
        expect(openedIn(model)).toEqual(Option.none())
        expect(Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => signIn.form }, () => undefined)).toMatchObject(
          {
            _tag: "EnteringEmail",
            email: "alice@example.com"
          }
        )
      })
    )
  })

  it("starts from a kept session, listing the workspaces", () => {
    const started = init({ session: Option.some(session), viewport: "Split", now })
    expect(Page.isAnyOf(["SignedIn"])(started.model.page)).toBe(true)
    expect((started.commands ?? []).map(({ name }) => name)).toEqual([LoadWorkspaces.name])
  })

  it("starts in the window's width, follows it as it changes, and opens a workspace in the width it has then", () => {
    story(
      update,
      given(init({ session: Option.some(session), viewport: "Phone", now }).model),
      model((model) => {
        expect(model.viewport).toBe("Phone")
      }),
      message(Message.ChangedViewport({ viewport: "Tablet" })),
      message(fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership] }))),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      model((model) => {
        expect(model.viewport).toBe("Tablet")
        expect(Option.map(openedIn(model), ({ model: opened }) => opened.viewport)).toEqual(Option.some("Tablet"))
      })
    )
  })

  it("starts at the time now, and keeps the time each minute reports, informing no one of it", () => {
    const later = DateTime.add(now, { minutes: 1 })
    const latest = DateTime.add(now, { minutes: 2 })

    story(
      update,
      given(init({ session: Option.some(session), viewport: "Split", now }).model),
      model((model) => {
        expect(model.now).toEqual(now)
      }),
      message(Message.Ticked({ now: later })),
      Command.expectNone(),
      model((model) => {
        expect(model.now).toEqual(later)
      }),
      message(fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership] }))),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      message(Message.Ticked({ now: latest })),
      Command.expectNone(),
      model((model) => {
        expect(model.now).toEqual(latest)
      })
    )
  })

  it("informs the open workspace when the window changes width, and has no one to inform before one is open", () => {
    story(
      update,
      given(init({ session: Option.some(session), viewport: "Split", now }).model),
      message(Message.ChangedViewport({ viewport: "Desktop" })),
      model((model) => {
        expect(model.viewport).toBe("Desktop")
      }),
      message(fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership] }))),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      message(Message.ChangedViewport({ viewport: "Phone" })),
      model((model) => {
        expect(model.viewport).toBe("Phone")
        expect(Option.map(openedIn(model), ({ model: opened }) => opened.viewport)).toEqual(Option.some("Phone"))
      })
    )
  })
})
