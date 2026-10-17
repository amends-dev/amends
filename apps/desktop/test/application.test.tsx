import { SignIn, type SessionStore } from "@amends-dev/client"
import { afterEach, expect, it, vi } from "@effect/vitest"
import { HashRouter } from "@solidjs/router"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library"
import userEvent from "@testing-library/user-event"
import { Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { Application } from "../src/application.tsx"
import { ApplicationRoutes } from "../src/routes.tsx"
import { committed, notificationsSeen, withChangeFeed, type Sidebar } from "./change-feed.ts"

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
let feed: ReturnType<typeof withChangeFeed>
/** Change-feed requests reach controllable streams; `fetch` sees every other request. */
function mount(path: string, token: string | undefined, fetch: typeof globalThis.fetch, sidebar?: Sidebar) {
  window.history.replaceState(null, "", `/#${path}`)
  let stored = token
    ? Schema.decodeSync(SignIn.Session)({ token, account: { id: token, email: `${token}@example.com` } })
    : undefined
  const store: SessionStore = {
    read: () => stored,
    write: (next) => {
      stored = next
    },
    subscribe: () => () => {}
  }
  feed = withChangeFeed(fetch, undefined, sidebar)
  const transport = FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, feed.fetch)))
  render(() => (
    <Application apiBaseUrl="http://127.0.0.1:8787" sessionStore={store} transport={transport}>
      <HashRouter>
        <ApplicationRoutes />
      </HashRouter>
    </Application>
  ))
  return store
}
afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})
it("uses hash routes for guest redirects and keeps the intended workspace", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  mount("/workspaces/one?tab=members", undefined, fetch)
  await screen.findByRole("heading", { name: "Sign in to amends" })
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers")
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus()
})
it("composes validated client state with UI and signs out through the desktop router", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response({ memberships: [], invitations: [] })))
  const store = mount("/workspaces", "alice", fetch)
  await screen.findByRole("heading", { name: "Choose a workspace" })
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer alice")
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
  await screen.findByRole("heading", { name: "Sign in to amends" })
  expect(store.read()).toBeUndefined()
  // Whoever signs in next starts afresh.
  expect(window.location.hash).toBe("#/sign-in")
})
it("clears a rejected session and renders the desktop sign-in form", async () => {
  const store = mount("/workspaces/one", "expired", () =>
    Promise.resolve(response({ _tag: "Authentication.Unauthorized", message: "Unauthorized" }, 401))
  )
  await screen.findByRole("heading", { name: "Sign in to amends" })
  expect(store.read()).toBeUndefined()
  expect(window.location.hash).toContain("returnTo=%2Fworkspaces%2Fone")
})
it("owns its not-found presentation without making an API request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  mount("/missing", undefined, fetch)
  await screen.findByRole("heading", { name: "Nothing at this address" })
  expect(fetch).not.toHaveBeenCalled()
})

async function submitEmail() {
  fireEvent.input(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "jo@mercier.co" }
  })
  fireEvent.submit(screen.getByRole("form"))
  return screen.findByRole("textbox", { name: "Verification code" })
}
it("signs in from the desktop page and resumes the workspace query through hash routing", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(
      response({
        token: "jo@mercier.co",
        account: { id: "jo@mercier.co", email: "jo@mercier.co" }
      })
    )
    .mockResolvedValue(
      response({
        memberships: [
          {
            workspace: {
              id: "one",
              name: "Desktop workspace",
              createdBy: "jo@mercier.co",
              ownerMemberId: "owner-one"
            },
            member: {
              id: "owner-one",
              workspaceId: "one",
              identity: { _tag: "Human", id: "jo@mercier.co" },
              name: "jo@mercier.co",
              status: "active"
            },
            people: 1
          }
        ],
        invitations: []
      })
    )
  const store = mount("/workspaces/one/tasks?filter=mine", undefined, fetch)
  const code = await submitEmail()
  expect(screen.getAllByRole("main")).toHaveLength(1)
  expect(code).toHaveFocus()
  fireEvent.input(code, { target: { value: "001234" } })
  fireEvent.submit(screen.getByRole("form"))
  await screen.findByRole("heading", { name: "Tasks" })
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent("Desktop workspace")
  expect(window.location.hash).toBe("#/workspaces/one/tasks?filter=mine")
  expect(store.read()?.token).toBe("jo@mercier.co")
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("authorization")).toBe("Bearer jo@mercier.co")
})
it("keeps a new credential through directory failure and safely resumes after retry", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(
      response({
        token: "jo@mercier.co",
        account: { id: "jo@mercier.co", email: "jo@mercier.co" }
      })
    )
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValue(response({ memberships: [], invitations: [] }))
  const store = mount("/sign-in?returnTo=%2F%2Fevil.invalid", undefined, fetch)
  fireEvent.input(await submitEmail(), { target: { value: "001234" } })
  fireEvent.submit(screen.getByRole("form"))
  await screen.findByRole("heading", { name: "Can’t reach your workspace host" })
  expect(store.read()?.token).toBe("jo@mercier.co")
  expect(window.location.hash).toContain("#/sign-in")
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  await screen.findByRole("heading", { name: "Choose a workspace" })
  expect(window.location.hash).toBe("#/workspaces")
})

it("opens creation from the picker and enters the created workspace through hash routes", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" }
  const listing = {
    memberships: [
      {
        workspace,
        member: {
          id: "owner",
          workspaceId: "one",
          identity: { _tag: "Human", id: "alice" },
          name: "alice",
          status: "active"
        },
        people: 1
      }
    ],
    invitations: []
  }
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ memberships: [], invitations: [] }))
    .mockResolvedValueOnce(response(workspace, 201))
    .mockResolvedValueOnce(response(listing))
  mount("/workspaces", "alice", fetch)
  fireEvent.click(await screen.findByRole("button", { name: "Create workspace" }))
  const dialog = await screen.findByRole("dialog", { name: "Create workspace" })
  expect(window.location.hash).toBe("#/workspaces/new")
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Workspace name" }), {
    target: { value: "Studio" }
  })
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Your name" }), {
    target: { value: "Alice" }
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Create workspace" }))
  await screen.findByRole("heading", { name: "Inbox" })
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent("Studio")
  expect(window.location.hash).toBe("#/workspaces/one/inbox")
  fireEvent.keyDown(screen.getByRole("button", { name: "Account: alice" }), { key: "Enter" })
  fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Switch workspace" }), {
    key: "Enter"
  })
  expect(await screen.findByRole("link", { name: "Studio" })).toHaveAttribute("href", "#/workspaces/one")
})

it("navigates workspace sections with persistent chrome and retains appearance after sign-out", async () => {
  const listing = {
    memberships: [
      {
        workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
        member: {
          id: "owner",
          workspaceId: "one",
          identity: { _tag: "Human", id: "alice" },
          name: "alice",
          status: "active"
        },
        people: 1
      }
    ],
    invitations: []
  }
  mount("/workspaces/one", "alice", () => Promise.resolve(response(listing)))
  await screen.findByRole("heading", { name: "Inbox" })
  const sidebar = screen.getByRole("navigation", { name: "Workspace" })
  fireEvent.click(screen.getByRole("link", { name: "Triage" }))
  await screen.findByRole("heading", { name: "Triage" })
  expect(window.location.hash).toBe("#/workspaces/one/triage")
  expect(screen.getByRole("navigation", { name: "Workspace" })).toBe(sidebar)
  const account = screen.getByRole("button", { name: "Account: alice" })
  fireEvent.keyDown(account, { key: "Enter" })
  fireEvent.keyDown(await screen.findByRole("menuitemradio", { name: "Dark" }), { key: "Enter" })
  await waitFor(() => expect(document.querySelector('[data-mode="dark"]')).not.toBeNull())
  fireEvent.keyDown(account, { key: "Enter" })
  fireEvent.keyDown(await screen.findByRole("menuitemradio", { name: "Slate" }), { key: "Enter" })
  await waitFor(() => expect(document.querySelector('[data-palette="slate"]')).not.toBeNull())
  fireEvent.keyDown(account, { key: "Enter" })
  fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Sign out" }), { key: "Enter" })
  await screen.findByRole("heading", { name: "Sign in to amends" })
  // Signing out leaves no way back to the page for whoever signs in next.
  expect(window.location.hash).toBe("#/sign-in")
  // Sign-in keeps the dark appearance chosen inside the workspace.
  expect(document.querySelector('[data-mode="dark"]')).not.toBeNull()
  expect(document.querySelector('[data-palette="slate"]')).not.toBeNull()
})

it("redirects the Settings entry to its workspace section and keeps the rail's selection on descendants", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" }
  const member = {
    id: "owner",
    workspaceId: "one",
    identity: { _tag: "Human", id: "alice" },
    name: "alice",
    status: "active"
  }
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname
    if (path.endsWith("/settings"))
      return Promise.resolve(
        response({
          workspace,
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: []
        })
      )
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        response({
          workspace,
          owner: member,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: []
        })
      )
    return Promise.resolve(response({ memberships: [{ workspace, member, people: 1 }], invitations: [] }))
  })
  mount("/workspaces/one/settings", "alice", fetch)
  await screen.findByRole("textbox", { name: "Workspace name" })
  expect(window.location.hash).toBe("#/workspaces/one/settings/workspace")
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "true")
  // Settings lists its sections in the sidebar.
  const tabs = () => within(screen.getByRole("navigation", { name: "Workspace" }))
  expect(tabs().getByRole("link", { name: "Workspace" })).toHaveAttribute("aria-current", "page")
  // Tabs link within the hash router.
  const members = tabs().getByRole("link", { name: /Members/ })
  expect(members).toHaveAttribute("href", "#/workspaces/one/settings/members")
  fireEvent.click(members)
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/settings/members"))
  expect(tabs().getByRole("link", { name: /Members/ })).toHaveAttribute("aria-current", "page")
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "true")
})

it("keeps a workspace current through its change feed over the desktop host connection", async () => {
  let name = "Studio"
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname
    const workspace = { id: "one", name, createdBy: "jo", ownerMemberId: "owner-one" }
    const member = {
      id: "owner-one",
      workspaceId: "one",
      identity: { _tag: "Human", id: "jo" },
      name: "jo",
      status: "active"
    }
    if (path.endsWith("/settings"))
      return Promise.resolve(
        response({
          workspace,
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: []
        })
      )
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        response({
          workspace,
          owner: member,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: []
        })
      )
    return Promise.resolve(response({ memberships: [{ workspace, member, people: 1 }], invitations: [] }))
  })
  mount("/workspaces/one/settings/workspace", "jo", fetch)
  await screen.findByRole("textbox", { name: "Workspace name" })
  const stream = feed.streams[0]
  expect(stream?.request.url).toBe("http://127.0.0.1:8787/changes")
  expect(stream?.request.headers.get("amends-workspace")).toBe("one")
  expect(stream?.request.headers.get("authorization")).toBe("Bearer jo")
  name = "Atelier"
  stream?.send(
    committed("one", "2", [
      { name: "workspace.renamed", payload: { workspaceId: "one", previousName: "Studio", name } }
    ])
  )
  await waitFor(() => expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent("Atelier"))
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveValue("Atelier")
  expect(window.location.hash).toBe("#/workspaces/one/settings/workspace")
})

it("explains an unavailable workspace under the account header and returns to the picker", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response({ memberships: [], invitations: [] })))
  const store = mount("/workspaces/missing/settings", "jo", fetch)
  await screen.findByRole("heading", { name: "That workspace is closed to you" })
  expect(screen.getByText("jo@example.com")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Your workspaces" }))
  await screen.findByRole("heading", { name: "Choose a workspace" })
  expect(window.location.hash).toBe("#/workspaces")
  expect(store.read()?.token).toBe("jo")
})
/** A group with one thread and its reply, as the host answers them. */
const at = "2026-09-25T12:00:00.000Z"
const author = { _tag: "Member", memberId: "owner-one" }
const message = (id: string, text: string, mentions: ReadonlyArray<string> = []) => ({
  id,
  workspaceId: "one",
  threadId: "t1",
  author,
  via: null,
  publishedAt: at,
  content: { _tag: "Text", text, mentions, revision: 1, editedAt: null }
})
const item = (sequence: number, id: string, text: string) => ({
  activity: {
    id: `activity-${sequence}`,
    workspaceId: "one",
    threadId: "t1",
    sequence,
    occurredAt: at,
    kind: "message.published",
    version: 1,
    subject: `message:${id}`,
    occurrence: `message:${id}`,
    newActivity: true,
    details: { messageId: id }
  },
  message: message(id, text)
})
const thread = {
  id: "t1",
  workspaceId: "one",
  groupId: "g1",
  title: null,
  origin: null,
  createdBy: author,
  createdAt: at
}
const conversation = (path: string) =>
  path.endsWith("/groups/g1/openings")
    ? [
        {
          thread,
          task: null,
          message: message("m1", "Can you look at the terms?"),
          replies: 1,
          latest: { threadId: "t1", sequence: 2, occurredAt: at },
          readThrough: 2,
          unread: false
        }
      ]
    : path.endsWith("/threads/t1")
      ? thread
      : path.endsWith("/threads/t1/timeline")
        ? [item(1, "m1", "Can you look at the terms?"), item(2, "m2", "On it.")]
        : undefined

it("shows a group's stream at its route and an open thread beside it", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname
    const answer = conversation(path)
    return Promise.resolve(
      response(
        answer ?? {
          memberships: [
            {
              workspace: {
                id: "one",
                name: "Studio",
                createdBy: "alice",
                ownerMemberId: "owner-one"
              },
              member: {
                id: "owner-one",
                workspaceId: "one",
                identity: { _tag: "Human", id: "alice" },
                name: "alice",
                status: "active"
              },
              people: 1
            }
          ],
          invitations: []
        }
      )
    )
  })
  mount("/workspaces/one/groups/g1/threads/t1", "alice", fetch)
  await screen.findByRole("navigation", { name: "Workspace" })
  const main = screen.getByRole("main")
  const opening = (await within(main).findByText("Can you look at the terms?")).closest("article")
  const replies = screen.getByRole("button", { name: /1 reply/ })
  expect(replies).toHaveAttribute("aria-expanded", "true")
  const thread = await screen.findByLabelText("Thread", { selector: "aside" })
  await within(thread).findByText("On it.")
  fireEvent.click(within(thread).getByRole("button", { name: "Close thread" }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups/g1"))
  await waitFor(() => expect(screen.queryByLabelText("Thread", { selector: "aside" })).toBeNull())
  // The stream stays mounted while threads open and close beside it.
  expect(within(main).getByText("Can you look at the terms?").closest("article")).toBe(opening)
  fireEvent.click(replies)
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups/g1/threads/t1"))
})

/** One pending mention of the reader in thread t1, as their inbox lists it. */
const mentioned = () => ({
  notification: {
    id: "n1",
    workspaceId: "one",
    source: { logId: "journal", entryId: "e2" },
    participationId: "p1",
    thread: { threadId: "t1", groupId: "g1", sequence: 2 },
    recipient: { _tag: "Human", id: "alice", memberId: "owner-one" },
    recordedAt: at,
    state: { _tag: "Pending" } as { _tag: string }
  },
  source: {
    ...item(2, "m2", "On it."),
    message: message("m2", "On it.", ["owner-one"])
  }
})
it("lists the inbox at its hash route, and opening one marks it seen and shows its thread", async () => {
  const inbox = [mentioned()]
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith("/notifications/inbox"))
      return Promise.resolve(
        response(
          new URL(request.url).searchParams.get("pendingOnly") === "true"
            ? inbox.filter((entry) => entry.notification.state._tag === "Pending")
            : inbox
        )
      )
    if (request.method === "POST" && path.endsWith("/notifications/n1/seen")) {
      inbox[0]!.notification.state = { _tag: "Seen", seenAt: at } as { _tag: string }
      feed.streams.at(-1)?.send(notificationsSeen("one", "owner-one", ["n1"]))
      return Promise.resolve(response(inbox[0]!.notification))
    }
    const answer = conversation(path)
    return Promise.resolve(
      response(
        answer ?? {
          memberships: [
            {
              workspace: {
                id: "one",
                name: "Studio",
                createdBy: "alice",
                ownerMemberId: "owner-one"
              },
              member: {
                id: "owner-one",
                workspaceId: "one",
                identity: { _tag: "Human", id: "alice" },
                name: "alice",
                status: "active"
              },
              people: 1
            }
          ],
          invitations: []
        }
      )
    )
  })
  mount("/workspaces/one/inbox", "alice", fetch)
  await screen.findByRole("navigation", { name: "Workspace" })
  // Unread opens first.
  const list = await within(screen.getByRole("main")).findByRole("list", {
    name: "Unread notifications"
  })
  await within(list).findByText("On it.")
  const open = within(list).getByRole("link", { name: /mentioned you$/ })
  expect(open).toHaveAttribute("href", "#/workspaces/one/inbox/groups/g1/threads/t1?at=2")
  fireEvent.click(open)
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/inbox/groups/g1/threads/t1?at=2"))
  const thread = await screen.findByLabelText("Thread", { selector: "aside" })
  await within(thread).findByText("Can you look at the terms?")
  // Opening it marked it seen.
  await waitFor(() => expect(within(list).queryByRole("img", { name: "unread" })).toBeNull())
  fireEvent.click(within(thread).getByRole("button", { name: "Close thread" }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/inbox"))
  // Nothing unread remains once its thread closes.
  await within(screen.getByRole("main")).findByText("You’re all caught up")
})

it("creates a group from the sidebar and opens it at its hash route", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (request.method === "POST" && path === "/groups")
      return response(
        {
          id: "g2",
          workspaceId: "one",
          kind: "Team",
          visibility: "Private",
          name: "Receipts",
          createdBy: "owner-one",
          createdAt: at
        },
        201
      )
    if (path.endsWith("/groups/g2/openings")) return response([])
    return response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" },
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active"
          },
          people: 1
        }
      ],
      invitations: []
    })
  })
  mount("/workspaces/one", "alice", fetch, { permissions: ["group.create"] })
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" })
  fireEvent.click(await within(sidebar).findByRole("button", { name: "Create group" }))
  const dialog = await screen.findByRole("dialog", { name: "Create group" })
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Group name" }), {
    target: { value: "Receipts" }
  })
  fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups/g2"))
  await screen.findByText("Group created")
})

it("browses public groups from the sidebar, and joining one opens it", async () => {
  const joins: Array<string> = []
  const lobby = {
    id: "g5",
    workspaceId: "one",
    kind: "Team",
    visibility: "Public",
    name: "Lobby",
    createdBy: "owner-one",
    createdAt: at
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/groups/public") return response([{ group: lobby, members: 1, joined: false }])
    if (request.method === "POST" && path === "/groups/g5/join") {
      joins.push(path)
      return response({
        id: "a5",
        workspaceId: "one",
        groupId: "g5",
        memberId: "owner-one",
        admittedAt: at,
        status: "active"
      })
    }
    if (path.endsWith("/groups/g5/openings")) return response([])
    return response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" },
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active"
          },
          people: 1
        }
      ],
      invitations: []
    })
  })
  mount("/workspaces/one", "alice", fetch)
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" })
  // Anyone may browse, even before belonging to any group.
  fireEvent.click(await within(sidebar).findByRole("button", { name: "Browse groups" }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups?tab=discover"))
  await screen.findByRole("heading", { name: "Groups" })
  await waitFor(() =>
    expect(within(sidebar).getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page")
  )
  const list = await screen.findByRole("list", { name: "Public groups" })
  expect(within(list).getByRole("listitem")).toHaveTextContent("1 member")
  fireEvent.click(within(list).getByRole("button", { name: "Join Lobby" }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups/g5"))
  expect(joins).toHaveLength(1)
})
it("drafts a first direct message at its hash route and opens the conversation", async () => {
  let posted = false
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (request.method === "POST" && path === "/threads") {
      posted = true
      return response(
        {
          thread: {
            id: "t9",
            workspaceId: "one",
            groupId: "g9",
            title: null,
            origin: null,
            createdBy: author,
            createdAt: at
          },
          message: message("m9", "Are you free?"),
          task: null,
          activity: { ...item(1, "m9", "Are you free?").activity, threadId: "t9" }
        },
        201
      )
    }
    if (path.endsWith("/groups/g9/openings")) return response([])
    return response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" },
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active"
          },
          people: 2
        }
      ],
      invitations: []
    })
  })
  mount("/workspaces/one/direct?to=ada-one", "alice", fetch)
  await screen.findByText("Send the first message to start the conversation.")
  const composer = await screen.findByRole("combobox", { name: /^Message / })
  await userEvent.setup().type(composer, "Are you free?")
  fireEvent.click(screen.getByRole("button", { name: "Send" }))
  // The message shows, and the conversation opens, once the commit that delivers it arrives.
  await waitFor(() => expect(posted).toBe(true))
  feed.streams[0]!.send({
    ...committed("one", "2", []),
    changes: [
      {
        _tag: "TimelineItem",
        item: {
          ...item(1, "m9", "Are you free?"),
          activity: { ...item(1, "m9", "Are you free?").activity, threadId: "t9" }
        }
      }
    ]
  })
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/groups/g9"))
})

it("links teammates to a first message within the hash router", async () => {
  const owner = {
    id: "owner-one",
    workspaceId: "one",
    identity: { _tag: "Human", id: "jo" },
    name: "jo",
    status: "active"
  }
  const directory = {
    memberships: [
      {
        workspace: { id: "one", name: "Studio", createdBy: "jo", ownerMemberId: "owner-one" },
        member: owner,
        people: 2
      }
    ],
    invitations: []
  }
  mount("/workspaces/one", "jo", () => Promise.resolve(response(directory)), {
    members: [owner, { ...owner, id: "ada", identity: { _tag: "Human", id: "ada@example.test" }, name: "Ada" }]
  })
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" })
  expect(await within(sidebar).findByRole("link", { name: "Ada" })).toHaveAttribute(
    "href",
    "#/workspaces/one/direct?to=ada"
  )
  expect(within(sidebar).getByText("No groups yet")).toBeInTheDocument()
})

/** A host installing an MCP integration, answering Connections's reads, writes, and checks. */
function connectionsHost() {
  const mcp = {
    id: "mcp",
    name: "MCP server",
    auth: ["apiKey", "none"],
    provides: ["tools"],
    requiresSandbox: false,
    settings: {
      type: "object",
      properties: {
        url: { type: "string", title: "Server URL", minLength: 1 },
        keyHeader: { type: "string", title: "Key header", minLength: 1 }
      },
      required: ["url"]
    }
  }
  let created: Record<string, unknown> | undefined
  const writes: Array<{ method: string; path: string; body: unknown }> = []
  const view = () => ({
    id: "c1",
    integration: "mcp",
    name: created?.["name"],
    settings: created?.["settings"],
    auth: created?.["auth"],
    readiness: { _tag: "Ready" },
    manageable: true,
    createdBy: "owner-one",
    createdAt: at
  })
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/connections/integrations") return response([mcp])
    if (path === "/connections" && request.method === "GET") return response(created === undefined ? [] : [view()])
    if (path === "/connections" && request.method === "POST") {
      created = (await request.json()) as Record<string, unknown>
      writes.push({ method: "POST", path, body: created })
      return response(view(), 201)
    }
    if (path === "/connections/c1/check") {
      writes.push({ method: "POST", path, body: undefined })
      return response({ status: "unauthorized", description: "The server refused the key." })
    }
    return response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" },
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active"
          },
          people: 1
        }
      ],
      invitations: []
    })
  })
  return { fetch, writes }
}
/** Adds an MCP server with its key from the empty page, which opens its page and checks it. */
async function addMcpServerWithKey() {
  const page = await screen.findByRole("heading", { name: "No connections yet" })
  fireEvent.click(within(page.parentElement!).getByRole("button", { name: "Add connection" }))
  const chooser = await screen.findByRole("dialog", { name: "Add connection" })
  fireEvent.click(within(chooser).getByRole("button", { name: /MCP server/ }))
  const configure = await screen.findByRole("dialog", { name: "Configure connection" })
  fireEvent.input(within(configure).getByRole("textbox", { name: "Server URL" }), {
    target: { value: "https://tools.example.com/mcp" }
  })
  fireEvent.input(within(configure).getByLabelText("API key", { selector: "input" }), {
    target: { value: "sk-tools" }
  })
  fireEvent.click(within(configure).getByRole("button", { name: "Create connection" }))
  await within(screen.getByLabelText("Notifications")).findByText("MCP server created")
  await screen.findByRole("heading", { name: "MCP server" })
  // Creating it checks it, and the page says what the check found.
  await within(screen.getByRole("main")).findByText("Key refused")
  expect(screen.getByText("The server refused the key.")).toBeInTheDocument()
}
const connectionWrites = [
  {
    method: "POST",
    path: "/connections",
    body: {
      integration: "mcp",
      name: "MCP server",
      settings: { url: "https://tools.example.com/mcp" },
      auth: "apiKey",
      apiKey: "sk-tools"
    }
  },
  { method: "POST", path: "/connections/c1/check", body: undefined }
]

it("adds a connection with its key at its hash route, then checks it", async () => {
  const host = connectionsHost()
  mount("/workspaces/one/connections", "alice", host.fetch, {
    permissions: ["connection.create"]
  })
  await addMcpServerWithKey()
  expect(window.location.hash).toBe("#/workspaces/one/connections/c1")
  expect(host.writes).toEqual(connectionWrites)
})

/** A host with two agents, one whose sandbox connection was removed, and their connections. */
function agentsHost() {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" }
  const agent = (id: string, name: string, sandbox: string | null) => ({
    id,
    memberId: `member-${id}`,
    name,
    instructions: "Help the team.",
    harness: { _tag: "Connection", connectionId: "h1" },
    model: { connectionId: "m1", id: "local-model" },
    sandbox: sandbox === null ? null : { connectionId: sandbox },
    readiness:
      sandbox === null ? { _tag: "Ready" } : { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "sandbox" }] },
    configurable: true,
    usable: true,
    createdBy: "owner-one",
    createdAt: "2026-10-06T12:00:00.000Z"
  })
  const integration = (id: string, name: string, provides: string) => ({
    id,
    name,
    auth: ["none"],
    provides: [provides],
    requiresSandbox: false,
    settings: { type: "object", properties: {} }
  })
  const connection = (id: string, name: string, integrationId: string) => ({
    id,
    name,
    integration: integrationId,
    settings: {},
    auth: "none",
    readiness: { _tag: "Ready" },
    manageable: true,
    createdBy: "owner-one",
    createdAt: "2026-10-06T12:00:00.000Z"
  })
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/agents") return response([agent("a1", "Atlas", null), agent("a2", "Review helper", "gone")])
    if (path === "/connections/integrations")
      return response([
        integration("amends", "amends", "harnesses"),
        integration("openai-compatible", "OpenAI-compatible API", "models")
      ])
    if (path === "/connections")
      return response([
        connection("h1", "Amends harness", "amends"),
        connection("m1", "Local models", "openai-compatible")
      ])
    if (path === "/connections/m1/models") return response({ listed: [], unlisted: true })
    if (path === "/settings")
      return response({
        workspace,
        canRename: true,
        canReadInvitations: true,
        canInvite: true,
        roles: []
      })
    return response({
      memberships: [
        {
          workspace,
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active"
          },
          people: 1
        }
      ],
      invitations: []
    })
  })
}
it("lists agents in the sidebar, opens one with its setup, and adds from the sidebar", async () => {
  mount("/workspaces/one/agents", "alice", agentsHost(), { permissions: ["agent.create"] })
  const sidebar = within(await screen.findByRole("navigation", { name: "Workspace" }))
  await sidebar.findByRole("link", { name: /Atlas/ })
  expect(sidebar.getByRole("link", { name: "Agents" })).toHaveAttribute("aria-current", "page")
  expect(sidebar.getByRole("link", { name: /Review helper, Needs setup$/ })).toBeInTheDocument()
  fireEvent.click(sidebar.getByRole("link", { name: /Review helper/ }))
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/agents/a2"))
  const main = within(screen.getByRole("main"))
  await main.findByText("Its sandbox connection was removed.")
  expect(main.getByRole("button", { name: /^Harness/ })).toHaveTextContent("Amends harness")
  expect(main.getByRole("button", { name: /^Sandbox/ })).toHaveTextContent("Removed connection")
  fireEvent.click(sidebar.getByRole("button", { name: "Add agent" }))
  await screen.findByRole("dialog", { name: "Add agent" })
  expect(window.location.hash).toBe("#/workspaces/one/agents/a2?add=agent")
})
