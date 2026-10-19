import { Identity } from "@amends-dev/core/identity"
import { Accounts, type SignIn, WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { SignOut } from "./command.ts"
import { SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { ChannelsBlock } from "./feature/channels/block.ts"
import { LoadIntegrations as LoadChannelIntegrations } from "./feature/channels/command.ts"
import { ConnectionsBlock } from "./feature/connections/block.ts"
import { LoadIntegrations as LoadConnectionIntegrations } from "./feature/connections/command.ts"
import { init } from "./init.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { CheckCode, SendCode } from "./page/signIn/command.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
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

const signedOut: Model = { page: Page.SignedOut({ signIn: SignInBlock.init("").model }) }

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
    model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, "Studio").model
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
      // Opened, the workspace asks the host for the integrations its connections link to, and its channels read.
      Command.resolve(LoadConnectionIntegrations, ConnectionsBlock.Message.ReceivedIntegrations({ integrations: [] })),
      Command.resolve(LoadChannelIntegrations, ChannelsBlock.Message.ReceivedIntegrations({ integrations: [] })),
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

  it("starts from a kept session, listing the workspaces", () => {
    const started = init({ session: Option.some(session) })
    expect(Page.isAnyOf(["SignedIn"])(started.model.page)).toBe(true)
    expect((started.commands ?? []).map(({ name }) => name)).toEqual([LoadWorkspaces.name])
  })
})
