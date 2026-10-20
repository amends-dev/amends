import { Identity } from "@amends-dev/core/identity"
import { Accounts, type SignIn, WorkspaceDirectory } from "@amends-dev/gateway"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option, Schema } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { now } from "../test/fixtures.ts"
import { KeepAppearance, ShowAppearance, SignOut } from "./command.ts"
import { SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { init } from "./init.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { CheckCode, SendCode } from "./page/signIn/command.ts"
import { SignInForm } from "./page/signIn/definition.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { LoadIntegrations } from "./page/workspace/command.ts"
import { AccountBinding } from "./page/workspace/composition.ts"
import { AccountMenu, Open } from "./page/workspace/definition.ts"
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

const signedOut: Model = {
  page: Page.SignedOut({ signIn: SignInBlock.init("").model }),
  appearance: "System",
  viewport: "Split",
  now,
  isApplePlatform: true
}

/** What the sign-in form reports, as the root receives it. */
const fromSignIn = (model: Model, message: typeof SignInBlock.Message.Type) =>
  SignInBinding.embedView({
    slotId: "sign-in",
    model: Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => signIn }, () => SignInBlock.init("").model)
  }).toParentMessage(message)

/** What the workspace list reports, as the root receives it. */
const fromWorkspaces = (message: typeof WorkspacesBlock.Message.Type) =>
  WorkspacesBinding.embedView({
    slotId: "workspaces",
    model: WorkspacesBlock.init(session.account.email).model,
    viewInputs: { now }
  }).toParentMessage(message)

/** What the open workspace reports, as the root receives it. */
const fromWorkspace = (message: typeof WorkspaceBlock.Message.Type) =>
  WorkspaceBinding.embedView({
    key: membership.workspace.id,
    slotId: "workspace",
    model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, "Studio", "Split").model,
    viewInputs: { email: session.account.email, appearance: "System", now, isApplePlatform: true }
  }).toParentMessage(message)

/** The account menu's entries, in the order it lists them. */
const accountEntries = [
  "System",
  "Light",
  "Dark",
  "SwitchWorkspace",
  "WorkspaceSettings",
  "ChangeName",
  "SignOut"
] as const

/** What the open workspace reports when the person chooses `entry` in its account menu, as the root receives it. */
const choseAccountEntry = (entry: (typeof accountEntries)[number]) =>
  fromWorkspace(
    AccountBinding.embedView({
      slotId: "account",
      model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, "Studio", "Split").model.account,
      viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
    }).toParentMessage(AccountMenu.Message.SelectedItem({ index: accountEntries.indexOf(entry), item: entry }))
  )

/** The app signed in with a workspace open, its integrations loaded. */
const inWorkspace = [
  message(
    fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] }))
  ),
  message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
  Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] }))
] as const

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
      Command.resolve(
        LoadWorkspaces,
        WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] })
      ),
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

  it("signs out when the person chooses it in the open workspace's account menu, the same way as from the workspace list", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      ...inWorkspace,
      message(choseAccountEntry("SignOut")),
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

  it("shows the Appearance the person chooses in the account menu, keeps it for the next visit, and remembers it", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      ...inWorkspace,
      message(choseAccountEntry("Dark")),
      Command.expectExact(ShowAppearance({ appearance: "Dark" }), KeepAppearance({ appearance: "Dark" })),
      Command.resolve(ShowAppearance, Message.CompletedShowAppearance()),
      Command.resolve(KeepAppearance, Message.CompletedKeepAppearance()),
      model((model) => {
        expect(model.appearance).toBe("Dark")
        expect(Option.isSome(openedIn(model))).toBe(true)
      }),
      message(choseAccountEntry("Light")),
      Command.expectExact(ShowAppearance({ appearance: "Light" }), KeepAppearance({ appearance: "Light" })),
      Command.resolve(ShowAppearance, Message.CompletedShowAppearance()),
      Command.resolve(KeepAppearance, Message.CompletedKeepAppearance()),
      message(choseAccountEntry("System")),
      Command.expectExact(ShowAppearance({ appearance: "System" }), KeepAppearance({ appearance: "System" })),
      Command.resolve(ShowAppearance, Message.CompletedShowAppearance()),
      Command.resolve(KeepAppearance, Message.CompletedKeepAppearance()),
      model((model) => {
        expect(model.appearance).toBe("System")
      })
    )
  })

  it("leaves the open workspace for the list of workspaces when the person chooses to switch, and stays signed in", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      ...inWorkspace,
      message(choseAccountEntry("SwitchWorkspace")),
      Command.expectNone(),
      model((model) => {
        expect(openedIn(model)).toEqual(Option.none())
        expect(Page.isAnyOf(["SignedIn"])(model.page)).toBe(true)
      })
    )
  })

  it("shows the open workspace's Workspace settings when the person chooses them, and asks nothing of the host", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      ...inWorkspace,
      message(choseAccountEntry("WorkspaceSettings")),
      Command.expectNone(),
      model((model) => {
        expect(
          Option.map(openedIn(model), ({ model: opened }) =>
            Open.matchOrElse(opened.open, { Settings: ({ page }) => page }, () => undefined)
          )
        ).toEqual(Option.some("Workspace"))
      })
    )
  })

  it("leaves changing the person's name to the open workspace, which asks its settings for the dialog", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      ...inWorkspace,
      message(choseAccountEntry("ChangeName")),
      Command.expectNone(),
      model((model) => {
        expect(Option.map(openedIn(model), ({ model: opened }) => opened.settings.nameChangeRequests)).toEqual(
          Option.some(1)
        )
        expect(Option.isSome(openedIn(model))).toBe(true)
      })
    )
  })

  it("signs out when the host no longer knows the session, to the sign-in form with the address and why", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      message(fromWorkspaces(WorkspacesBlock.Message.RejectedSession())),
      Command.expectExact(SignOut()),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      model((model) => {
        expect(Page.matchOrElse(model.page, { SignedOut: ({ signIn }) => signIn.form }, () => undefined)).toEqual(
          SignInForm.EnteringEmail({
            email: "alice@example.com",
            error: Option.none(),
            notice: Option.some("Your session has ended. Sign in again.")
          })
        )
      })
    )
  })

  it("starts in the Appearance the flags name, shown on the page, signed in or signed out", () => {
    const signedInDark = init({
      session: Option.some(session),
      appearance: "Dark",
      viewport: "Split",
      now,
      isApplePlatform: true
    })
    expect(signedInDark.model.appearance).toBe("Dark")
    expect((signedInDark.commands ?? []).map(({ name, args }) => [name, args])).toContainEqual([
      ShowAppearance.name,
      { appearance: "Dark" }
    ])

    const signedOutLight = init({
      session: Option.none(),
      appearance: "Light",
      viewport: "Split",
      now,
      isApplePlatform: true
    })
    expect(signedOutLight.model.appearance).toBe("Light")
    expect((signedOutLight.commands ?? []).map(({ name, args }) => [name, args])).toContainEqual([
      ShowAppearance.name,
      { appearance: "Light" }
    ])
  })

  it("starts on the platform the flags name, signed in or signed out", () => {
    expect(
      init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true }).model
    ).toMatchObject({
      isApplePlatform: true
    })
    expect(
      init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: false })
        .model
    ).toMatchObject({
      isApplePlatform: false
    })
    expect(
      init({ session: Option.none(), appearance: "System", viewport: "Split", now, isApplePlatform: false }).model
    ).toMatchObject({
      isApplePlatform: false
    })
  })

  it("starts from a kept session, listing the workspaces and showing the Appearance kept with it", () => {
    const started = init({
      session: Option.some(session),
      appearance: "System",
      viewport: "Split",
      now,
      isApplePlatform: true
    })
    expect(Page.isAnyOf(["SignedIn"])(started.model.page)).toBe(true)
    expect((started.commands ?? []).map(({ name }) => name)).toEqual([LoadWorkspaces.name, ShowAppearance.name])
  })

  it("starts in the window's width, follows it as it changes, and opens a workspace in the width it has then", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Phone", now, isApplePlatform: true })
          .model
      ),
      model((model) => {
        expect(model.viewport).toBe("Phone")
      }),
      message(Message.ChangedViewport({ viewport: "Tablet" })),
      message(
        fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] }))
      ),
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
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      model((model) => {
        expect(model.now).toEqual(now)
      }),
      message(Message.Ticked({ now: later })),
      Command.expectNone(),
      model((model) => {
        expect(model.now).toEqual(later)
      }),
      message(
        fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] }))
      ),
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
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      message(Message.ChangedViewport({ viewport: "Desktop" })),
      model((model) => {
        expect(model.viewport).toBe("Desktop")
      }),
      message(
        fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] }))
      ),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      message(Message.ChangedViewport({ viewport: "Phone" })),
      model((model) => {
        expect(model.viewport).toBe("Phone")
        expect(Option.map(openedIn(model), ({ model: opened }) => opened.viewport)).toEqual(Option.some("Phone"))
      })
    )
  })

  it("opens the search of the open workspace when the search key is pressed, and has none to open before one is", () => {
    story(
      update,
      given(
        init({ session: Option.some(session), appearance: "System", viewport: "Split", now, isApplePlatform: true })
          .model
      ),
      message(Message.PressedSearchKey()),
      Command.expectNone(),
      message(
        fromWorkspaces(WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships: [membership], invitations: [] }))
      ),
      message(Message.PressedSearchKey()),
      Command.expectNone(),
      message(fromWorkspaces(WorkspacesBlock.Message.ClickedWorkspace({ workspaceId: membership.workspace.id }))),
      Command.resolve(LoadIntegrations, WorkspaceBlock.Message.ReceivedIntegrations({ integrations: [] })),
      message(Message.PressedSearchKey()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      model((model) => {
        expect(Option.map(openedIn(model), ({ model: opened }) => opened.search.dialog.isOpen)).toEqual(
          Option.some(true)
        )
      })
    )
  })
})
