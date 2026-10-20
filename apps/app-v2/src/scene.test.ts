import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  click,
  expect,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  art,
  bob,
  general,
  membership,
  notificationOf,
  now,
  opening,
  reply,
  session,
  thread
} from "../test/fixtures.ts"
import { SignOut } from "./command.ts"
import { GroupBlock } from "./feature/group/block.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { SendCode } from "./page/signIn/command.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { Open } from "./page/workspace/definition.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"
import { Workspaces } from "./page/workspaces/definition.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const signedOut: Model = {
  page: Page.SignedOut({ signIn: SignInBlock.init("").model }),
  viewport: "Split",
  now,
  isApplePlatform: true
}

/** Signed in as alice, who belongs to one workspace, with none of them opened. */
const choosing: Model = {
  page: Page.SignedIn({
    account: session.account,
    workspaces: modifyFields(WorkspacesBlock.init(session.account.email).model, {
      workspaces: () => Workspaces.Loaded({ memberships: [membership], invitations: [], reloadFailed: false })
    }),
    workspace: Option.none()
  }),
  viewport: "Split",
  now,
  isApplePlatform: true
}

/** Signed in as alice, with the host not yet asked, or not answering, for the workspaces she belongs to. */
const askingHost = (workspaces: Workspaces): Model => ({
  ...choosing,
  page: Page.SignedIn({
    account: session.account,
    workspaces: modifyFields(WorkspacesBlock.init(session.account.email).model, { workspaces: () => workspaces }),
    workspace: Option.none()
  })
})

/** Signed in as alice, with her workspace opened. */
const inWorkspace: Model = {
  page: Page.SignedIn({
    account: session.account,
    workspaces: modifyFields(WorkspacesBlock.init(session.account.email).model, {
      workspaces: () => Workspaces.Loaded({ memberships: [membership], invitations: [], reloadFailed: false })
    }),
    workspace: Option.some({
      workspaceId: membership.workspace.id,
      model: WorkspaceBlock.init(membership.workspace.id, membership.member.id, membership.workspace.name, "Split")
        .model
    })
  }),
  viewport: "Split",
  now,
  isApplePlatform: true
}

/** Signed in as alice, with her opened workspace as `change` leaves it. */
const inWorkspaceChanged = (
  change: (workspace: typeof WorkspaceBlock.Model.Type) => typeof WorkspaceBlock.Model.Type
) =>
  ({
    ...inWorkspace,
    page: Page.matchOrElse(
      inWorkspace.page,
      {
        SignedIn: (signedIn) =>
          Page.SignedIn({
            ...signedIn,
            workspace: Option.map(signedIn.workspace, (opened) => ({ ...opened, model: change(opened.model) }))
          })
      },
      (page) => page
    )
  }) satisfies Model

/** Signed in as alice, with the thread of general open in her opened workspace. */
const withThread = inWorkspaceChanged((workspace) =>
  modifyFields(workspace, {
    open: () =>
      Open.Group({
        groupId: general.id,
        model: GroupBlock.init(membership.workspace.id, membership.member.id, general.id, Option.some(thread.id)).model
      })
  })
)

/** Signed in as alice, with her opened workspace showing the inbox, which holds Bob's reply of 25 minutes ago. */
const withInbox = inWorkspaceChanged((workspace) =>
  modifyFields(workspace, {
    open: () => Open.Inbox(),
    inbox: (inbox) =>
      modifyFields(inbox, {
        isLoaded: () => true,
        items: () => [
          {
            notification: notificationOf("notification-1", 2, 5),
            thread: Option.some(thread),
            opening: Option.some(opening),
            message: Option.some(reply)
          }
        ],
        groups: () => [general],
        members: () => [membership.member, bob]
      })
  })
)

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

  it("marks the brand with the logo, which assistive technology does not read, signed out and signed in", () => {
    scene(
      { update, view },
      given(signedOut),
      expect(within(role("banner"), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(within(role("banner"), text("amends"))).toExist()
    )
    scene(
      { update, view },
      given(choosing),
      expect(within(role("banner"), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("checks the session under the header, with the working mark, until the host answers", () => {
    scene(
      { update, view },
      given(askingHost(Workspaces.Loading())),
      expect(within(role("banner"), text("alice@example.com"))).toExist(),
      expect(within(role("banner"), role("button", { name: "Sign out" }))).toExist(),
      expect(within(role("main"), role("heading", { name: "Checking your session", level: 1 }))).toExist(),
      expect(selector('div[role="status"] svg.logo-working')).toExist(),
      expect(role("heading", { name: "Choose a workspace" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent()
    )
  })

  it("says the host cannot be reached, keeping the person signed in, with a way to try again", () => {
    scene(
      { update, view },
      given(askingHost(Workspaces.Unreachable())),
      expect(within(role("banner"), role("button", { name: "Sign out" }))).toExist(),
      expect(within(role("main"), role("heading", { name: "Can't reach your workspace host", level: 1 }))).toExist(),
      expect(text("You're still signed in. Try again once the host is running.")).toExist(),
      expect(art("lost-thread")).toExist(),
      expect(role("button", { name: "Try again" })).toExist(),
      expect(selector("svg.logo-working")).toBeAbsent()
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

  it("has no header over an opened workspace, which shows who is signed in and the way out in its sidebar", () => {
    scene(
      { update, view },
      given(inWorkspace),
      expect(role("banner")).toBeAbsent(),
      expect(within(role("navigation", { name: "Studio" }), text("alice@example.com"))).toExist(),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "Sign out" }))).toExist(),
      expect(role("main", { name: "Studio" })).toExist(),
      expect(role("heading", { name: "Choose a workspace" })).toBeAbsent(),
      expect(role("heading", { name: "Sign in to amends" })).toBeAbsent()
    )
  })

  it("ages the notifications of the open inbox as the minutes pass, from the time now it gives the workspace", () => {
    scene(
      { update, view, subscriptions },
      given(withInbox),
      expect(within(role("main", { name: "Inbox" }), text("25m ago"))).toExist(),
      Subscription.emit(subscriptions.tick, Message.Ticked({ now: DateTime.add(now, { minutes: 1 }) })),
      expect(within(role("main", { name: "Inbox" }), text("26m ago"))).toExist(),
      expect(text("25m ago")).toBeAbsent(),
      Subscription.emit(subscriptions.tick, Message.Ticked({ now: DateTime.add(now, { minutes: 34 }) })),
      expect(within(role("main", { name: "Inbox" }), text("59m ago"))).toExist()
    )
  })

  it("lays the open workspace out for the window's width as it changes, with the Menu button where the sidebar leaves", () => {
    scene(
      { update, view, subscriptions },
      given(inWorkspace),
      expect(role("button", { name: "Menu" })).toBeAbsent(),
      expect(role("navigation", { name: "Studio" })).toExist(),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Phone" })),
      expect(role("button", { name: "Menu" })).toExist(),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Desktop" })),
      expect(role("button", { name: "Menu" })).toBeAbsent(),
      expect(role("navigation", { name: "Studio" })).toExist()
    )
  })

  it("moves the thread open between its place beside the main pane and the side pane's dialog as the width changes", () => {
    scene(
      { update, view, subscriptions },
      given(withThread),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Desktop" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(within(role("dialog", { name: "Thread" }), role("complementary", { name: "Thread" }))).toExist(),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Split" })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(role("complementary", { name: "Thread" })).toExist()
    )
  })

  it("keeps the side pane's dialog open as the width narrows from Desktop, and opens none while no thread is open", () => {
    scene(
      { update, view, subscriptions },
      given(withThread),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Desktop" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Phone" })),
      Command.expectNone(),
      expect(within(role("dialog", { name: "Thread" }), role("complementary", { name: "Thread" }))).toExist()
    )
    scene(
      { update, view, subscriptions },
      given(inWorkspace),
      Subscription.emit(subscriptions.viewport, Message.ChangedViewport({ viewport: "Desktop" })),
      Command.expectNone(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent()
    )
  })

  it("signs out from the sidebar of an opened workspace, back to the sign-in form with the address kept", () => {
    scene(
      { update, view },
      given(inWorkspace),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Sign out" }))),
      Command.expectExact(SignOut()),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("heading", { name: "Sign in to amends" })).toExist(),
      expect(label("Email")).toHaveValue("alice@example.com")
    )
  })

  it("writes the open workspace's search shortcut for the platform the page runs on", () => {
    scene(
      { update, view },
      given(inWorkspace),
      expect(role("button", { name: "Find anything…" })).toExist(),
      expect(text("⌘K")).toExist(),
      expect(text("Ctrl K")).toBeAbsent()
    )
    scene(
      { update, view },
      given(modifyFields(inWorkspace, { isApplePlatform: () => false })),
      expect(text("Ctrl K")).toExist(),
      expect(text("⌘K")).toBeAbsent()
    )
  })

  it("opens the search of the open workspace when the search key is pressed, and leaves the key to the browser before one is open", () => {
    scene(
      { update, view, subscriptions },
      given(choosing),
      Subscription.emit(subscriptions.openSearch, Message.PressedSearchKey()),
      Command.expectNone(),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent()
    )
    scene(
      { update, view, subscriptions },
      given(inWorkspace),
      Subscription.emit(subscriptions.openSearch, Message.PressedSearchKey()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Find anything" })).toExist(),
      expect(label("Find anything")).toHaveAttr("data-foldkit-dialog-initial-focus", "")
    )
  })
})
