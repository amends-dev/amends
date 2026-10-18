import { afterEach, expect, it, vi } from "@effect/vitest"
import { cleanup, render, waitFor } from "@solidjs/testing-library"
import { Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { SignIn } from "../src/api/contracts.ts"
import {
  ClientProvider,
  DirectoryProvider,
  useDirectMessages,
  useGroupMembers,
  useGroupPeople,
  useWorkspaceGroups,
  type SessionStore
} from "../src/index.ts"

afterEach(cleanup)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const session = Schema.decodeSync(SignIn.Session)({
  token: "alice",
  account: { id: "alice", email: "alice@example.com" }
})
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} }
const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 12, minute)).toISOString()

const member = (id: string, name: string, kind = "Human") => ({
  id,
  workspaceId: "one",
  identity: { _tag: kind, id: kind === "Human" ? `${id}@example.test` : id },
  name,
  status: "active"
})
const members = [
  member("owner", "Alice"),
  member("ada", "Ada"),
  member("zed", "Zed"),
  member("bea", "Bea"),
  member("scout", "Scout", "Agent")
]
const listing = {
  memberships: [
    {
      workspace: {
        id: "one",
        name: "Studio",
        createdBy: "owner@example.test",
        ownerMemberId: "owner"
      },
      member: members[0],
      people: 4
    }
  ],
  invitations: []
}
const item = (group: Record<string, unknown>, latest?: number) => ({
  group: { workspaceId: "one", createdBy: "owner", createdAt: at(0), ...group },
  latestActivityAt: latest === undefined ? null : at(latest),
  readAt: null,
  newActivity: false,
  following: false,
  manageable: true,
  membersRemovable: true,
  renamable: true
})
// In the host's order, which is by group ID.
const groups = [
  item({ id: "d1", kind: "Direct", memberIds: ["ada", "owner"] }, 5),
  item({ id: "d2", kind: "Direct", memberIds: ["bea", "owner", "scout"] }, 9),
  item({ id: "g1", kind: "Team", visibility: "Private", name: "Alpha" }),
  item({ id: "general", kind: "Team", visibility: "Public", name: "general" })
]
const roster = ["owner", "ada", "scout"].map((memberId, index) => ({
  id: `a${index}`,
  workspaceId: "one",
  groupId: "general",
  memberId,
  admittedAt: at(0),
  status: "active"
}))

function fixture(suggestions?: number) {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname
    if (path === "/me/workspaces") return Promise.resolve(json(listing))
    if (path === "/members") return Promise.resolve(json(members))
    if (path === "/groups") return Promise.resolve(json(groups))
    if (path === "/groups/general/members") return Promise.resolve(json(roster))
    return Promise.resolve(json({}, 404))
  })
  const views = {} as {
    groups: ReturnType<typeof useWorkspaceGroups>
    directs: ReturnType<typeof useDirectMessages>
    general: ReturnType<typeof useGroupMembers>
    people: ReturnType<typeof useGroupPeople>
  }
  function Consumer() {
    views.groups = useWorkspaceGroups("one")
    views.directs = useDirectMessages("one", suggestions)
    views.general = useGroupMembers("one", "general")
    views.people = useGroupPeople("one", views.general)
    return null
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ))
  return views
}

it("lists the general group first, then teams by name, and conversations by latest activity", async () => {
  const views = fixture()
  await waitFor(() => expect(views.groups.all()).toHaveLength(4))
  expect(views.groups.teams().map((entry) => [entry.name, entry.general])).toEqual([
    ["general", true],
    ["Alpha", false]
  ])
  await waitFor(() => expect(views.groups.directs()[1]?.name).toBe("Ada"))
  expect(views.groups.directs().map((entry) => entry.id)).toEqual(["d2", "d1"])
})

it("follows conversations with teammates, people and agents, not yet messaged one to one", async () => {
  const views = fixture()
  await waitFor(() => expect(views.directs()).toHaveLength(5))
  // Ada has a conversation of her own; Bea and Scout share only a group one.
  expect(views.directs().map((entry) => [entry.kind, entry.name])).toEqual([
    ["conversation", "Bea, Scout"],
    ["conversation", "Ada"],
    ["teammate", "Bea"],
    ["teammate", "Scout"],
    ["teammate", "Zed"]
  ])
  expect(views.directs()[2]).toMatchObject({ id: "bea", memberIds: ["bea"], pending: 0 })
})

it("suggests only a few teammates", async () => {
  const views = fixture(2)
  await waitFor(() => expect(views.directs()).toHaveLength(4))
  expect(views.directs().map((entry) => entry.name)).toEqual(["Bea, Scout", "Ada", "Bea", "Scout"])
})

it("offers no leaving the general group, and removes nobody from it", async () => {
  const views = fixture()
  await waitFor(() => expect(views.people.roster()).toHaveLength(3))
  expect(views.general.general()).toBe(true)
  expect(views.general.own()?.memberId).toBe("owner")
  expect(views.general.leavable()).toBe(false)
  expect(views.people.roster().map((entry) => [entry.name, entry.removable])).toEqual([
    ["Alice", false],
    ["Ada", false],
    ["Scout", false]
  ])
})

it("reads each workspace through its own client, which names it in the Amends-Workspace header", async () => {
  const requests: Array<[string, string | null]> = []
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    const workspaceId = request.headers.get("amends-workspace")
    requests.push([path, workspaceId])
    if (path === "/me/workspaces") return Promise.resolve(json(listing))
    if (path === "/groups")
      return Promise.resolve(
        json([
          item({
            id: `${workspaceId}-general`,
            kind: "Team",
            visibility: "Public",
            name: "general"
          })
        ])
      )
    return Promise.resolve(json([]))
  })
  const views = {} as Record<"one" | "two", ReturnType<typeof useWorkspaceGroups>>
  function Consumer() {
    views.one = useWorkspaceGroups("one")
    views.two = useWorkspaceGroups("two")
    return null
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)))}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ))
  await waitFor(() => expect(views.two.all()).toHaveLength(1))
  expect(views.one.all()?.map((entry) => entry.id)).toEqual(["one-general"])
  expect(views.two.all()?.map((entry) => entry.id)).toEqual(["two-general"])
  // The session's own reads act in no workspace.
  expect(requests.filter(([path]) => path === "/me/workspaces")).toEqual([["/me/workspaces", null]])
  expect(
    requests
      .filter(([path]) => path === "/groups")
      .map(([, workspaceId]) => workspaceId ?? "")
      .toSorted((left, right) => left.localeCompare(right))
  ).toEqual(["one", "two"])
})
