import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import * as Url from "foldkit/url"
import { membership, now, session } from "../test/fixtures.ts"
import { Navigate } from "./command.ts"
import { SignInBinding, WorkspaceBinding, WorkspacesBinding } from "./composition.ts"
import { init } from "./init.ts"
import { Message } from "./message.ts"
import { type Model, Page } from "./model.ts"
import { SignInBlock } from "./page/signIn/block.ts"
import { WorkspaceBlock } from "./page/workspace/block.ts"
import { destinationOf } from "./page/workspace/navigation.ts"
import { WorkspacesBlock } from "./page/workspaces/block.ts"
import { Destination, HomeDestination, Route, fromUrl, href } from "./route.ts"
import { update } from "./update.ts"

const url = (path: string) => Option.getOrThrow(Url.fromString(`https://amends.test${path}`))
const flags = {
  session: Option.some(session),
  appearance: "System",
  viewport: "Split",
  now,
  isApplePlatform: true
} as const
const workspaceHref = (destination: Destination) =>
  href(Route.Workspace({ workspaceId: membership.workspace.id, destination }))
const opened = (model: Model) =>
  Page.matchOrElse(model.page, { SignedIn: ({ workspace }) => workspace }, () => Option.none())
const currentDestination = (model: Model) => destinationOf(Option.getOrThrow(opened(model)).model)
const navigateCommands = (result: ReturnType<typeof update>) =>
  (result.commands ?? [])
    .filter((command) => command.name === Navigate({ url: "/", replace: false }).name)
    .map((command) => command.args)

const fromDirectory = (model: Model, message: typeof WorkspacesBlock.Message.Type) =>
  WorkspacesBinding.embedView({
    slotId: "workspaces",
    model: Page.matchOrElse(
      model.page,
      { SignedIn: ({ workspaces }) => workspaces },
      () => WorkspacesBlock.init(session.account.email).model
    ),
    viewInputs: { now }
  }).toParentMessage(message)
const loadDirectory = (model: Model, memberships = [membership]) =>
  update(model, fromDirectory(model, WorkspacesBlock.Message.SucceededLoadWorkspaces({ memberships, invitations: [] })))
const fromWorkspace = (model: Model, message: typeof WorkspaceBlock.Message.Type) => {
  const workspace = Option.getOrThrow(opened(model))
  return WorkspaceBinding.embedView({
    key: workspace.workspaceId,
    slotId: "workspace",
    model: workspace.model,
    viewInputs: { email: session.account.email, appearance: model.appearance, now, isApplePlatform: true }
  }).toParentMessage(message)
}
const visit = (model: Model, path: string) => update(model, Message.ChangedUrl({ url: url(path) }))
const groupId = GroupId.GroupId.make("group/one")
const threadId = ThreadId.ThreadId.make("thread/one")
const group = Destination.Home({ destination: HomeDestination.Group({ groupId, threadId: Option.some(threadId) }) })

// Assertions inspect the completed root update, so they include nested policies and keyed child delivery.
describe("restoring URL destinations", () => {
  it("opens a deep-linked thread only after this account's membership is resolved", () => {
    const started = init(flags, url(workspaceHref(group))).model
    expect(opened(started)).toEqual(Option.none())
    const loaded = loadDirectory(started)
    expect(currentDestination(loaded.model)).toEqual(group)
    expect(navigateCommands(loaded)).toEqual([])
  })

  it("keeps the destination through sign-in", () => {
    const started = init({ ...flags, session: Option.none() }, url(workspaceHref(group))).model
    const fromSignIn = (message: typeof SignInBlock.Message.Type) =>
      SignInBinding.embedView({ slotId: "sign-in", model: SignInBlock.init("").model }).toParentMessage(message)
    let signedIn: Model = started
    for (const message of [
      SignInBlock.Message.TypedEmail({ email: session.account.email }),
      SignInBlock.Message.SubmittedEmail(),
      SignInBlock.Message.SucceededSendCode(),
      SignInBlock.Message.TypedCode({ code: "123456" }),
      SignInBlock.Message.SubmittedCode(),
      SignInBlock.Message.SucceededSignIn({ session })
    ])
      signedIn = update(signedIn, fromSignIn(message)).model
    expect(signedIn.route).toEqual(started.route)
    expect(currentDestination(loadDirectory(signedIn).model)).toEqual(group)
  })

  it("uses the latest destination when the directory finishes after navigation", () => {
    const started = init(flags, url(workspaceHref(group))).model
    const agents = Destination.Agents({ tab: "NeedsSetup" })
    const moved = visit(started, workspaceHref(agents)).model
    expect(currentDestination(loadDirectory(moved).model)).toEqual(agents)
    const left = visit(started, "/").model
    expect(opened(loadDirectory(left).model)).toEqual(Option.none())
  })

  it("does not open a workspace absent from this account's directory", () => {
    const started = init(flags, url("/workspaces/missing/agents")).model
    const loaded = loadDirectory(started)
    expect(opened(loaded.model)).toEqual(Option.none())
    expect(href(loaded.model.route)).toBe("/workspaces/missing/agents")
  })

  it("keeps an unreachable destination and restores it after retry", () => {
    const started = init(flags, url(workspaceHref(group))).model
    const failed = update(started, fromDirectory(started, WorkspacesBlock.Message.FailedLoadWorkspaces())).model
    expect(failed.route).toEqual(started.route)
    const retry = update(failed, Message.ClickedRetryWorkspace()).model
    expect(currentDestination(loadDirectory(retry).model)).toEqual(group)
  })

  it("restores list tabs, details, members, groups, and conversations without writing history", () => {
    let model = loadDirectory(init(flags, url(workspaceHref(group))).model).model
    const destinations = [
      Destination.Agents({ tab: "NeedsSetup" }),
      Destination.Connections({ tab: "tools" }),
      Destination.Settings({ page: "Members", memberId: Option.some(membership.member.id) }),
      Destination.Channels(),
      Destination.Home({ destination: HomeDestination.Triage() }),
      Destination.Home({ destination: HomeDestination.Tasks() }),
      Destination.Home({ destination: HomeDestination.Groups() }),
      Destination.Home({ destination: HomeDestination.Conversation({ memberIds: [membership.member.id] }) }),
      group,
      Destination.Home({ destination: HomeDestination.Inbox({ tab: "All", selected: Option.none() }) })
    ]
    for (const destination of destinations) {
      const result = visit(model, workspaceHref(destination))
      expect(currentDestination(result.model)).toEqual(destination)
      expect(navigateCommands(result)).toEqual([])
      model = result.model
    }
  })

  it("records a visible destination change once and ignores its URL echo", () => {
    const started = loadDirectory(init(flags, url(workspaceHref(group))).model).model
    const changed = update(started, fromWorkspace(started, WorkspaceBlock.Message.ClickedAgents()))
    expect(navigateCommands(changed)).toEqual([
      { url: workspaceHref(Destination.Agents({ tab: "All" })), replace: false }
    ])
    const echo = visit(changed.model, href(changed.model.route))
    expect(echo.model).toBe(changed.model)
    expect(echo.commands ?? []).toEqual([])
    const back = visit(echo.model, workspaceHref(group))
    expect(currentDestination(back.model)).toEqual(group)
    expect(navigateCommands(back)).toEqual([])
  })

  it("drops the old keyed workspace when navigation leaves it", () => {
    const started = loadDirectory(init(flags, url(workspaceHref(group))).model).model
    const oldMessage = fromWorkspace(started, WorkspaceBlock.Message.ClickedAgents())
    const otherId = WorkspaceId.WorkspaceId.make("another-workspace")
    const other = {
      ...membership,
      workspace: { ...membership.workspace, id: otherId },
      member: { ...membership.member, workspaceId: otherId }
    }
    const moved = visit(started, `/workspaces/${otherId}/channels`).model
    const loaded = loadDirectory(moved, [membership, other]).model
    expect(Option.getOrThrow(opened(loaded)).workspaceId).toBe(otherId)
    const late = update(loaded, oldMessage)
    expect(late.model).toEqual(loaded)
    expect(navigateCommands(late)).toEqual([])
  })

  it("keeps a destination on session expiry and clears it on explicit sign-out", () => {
    const started = loadDirectory(init(flags, url(workspaceHref(group))).model).model
    const expired = update(started, fromDirectory(started, WorkspacesBlock.Message.RejectedSession()))
    expect(expired.model.route).toEqual(started.route)
    expect(Page.isAnyOf(["SignedOut"])(expired.model.page)).toBe(true)
    const signedOut = update(started, Message.ClickedSignOut())
    expect(signedOut.model.route).toEqual(Route.Workspaces())
    expect(navigateCommands(signedOut)).toEqual([{ url: "/", replace: true }])
  })

  it("does not mistake an invalid query for the valid page at the same path", () => {
    const path = workspaceHref(Destination.Agents({ tab: "All" }))
    const started = loadDirectory(init(flags, url(path)).model).model
    const invalid = visit(started, `${path}?tab=not-a-tab`).model
    expect(invalid.route).toEqual(fromUrl(url(`${path}?tab=not-a-tab`)))
    expect(opened(invalid)).toEqual(Option.none())
  })
})
