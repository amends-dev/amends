import type { SettingsTab } from "@amends-dev/ui/screens/settings"
import { afterEach, expect, it, vi } from "@effect/vitest"
import { cleanup, render, waitFor } from "@solidjs/testing-library"
import { Layer, Schema } from "effect"
import { FetchHttpClient } from "effect/http"
import { SignIn } from "../src/api/contracts.ts"
import {
  ClientProvider,
  DirectoryProvider,
  useWorkspaceSettings,
  type SessionStore,
  type SettingsDone
} from "../src/index.ts"

afterEach(cleanup)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const session = Schema.decodeSync(SignIn.Session)({
  token: "alice",
  account: { id: "alice", email: "alice@example.com" }
})
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} }
const day = 86_400_000
const at = (offset: number) => new Date(Date.now() + offset).toISOString()

const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" }
const member = (id: string, identity: string, name: string, rest: object = {}) => ({
  id,
  workspaceId: "one",
  identity: { _tag: "Human", id: identity },
  name,
  status: "active",
  ...rest
})
const owner = member("owner", "alice", "Alice")
const ada = member("ada", "human-ada", "Ada")
const bot = member("bot", "agent-1", "Bot", { identity: { _tag: "Agent", id: "agent-1" } })
const gone = member("gone", "human-gone", "Gone", { status: "removed" })
const role = (id: string, name: string, assignable: boolean) => ({
  role: { id, workspaceId: "one", name, permissions: [] },
  assignable
})
const roles = [
  role("builtin:member", "Member", true),
  role("builtin:administrator", "Administrator", true),
  role("builtin:owner", "Owner", false)
]
const assignment = (id: string, memberId: string, roleId: string) => ({
  id,
  workspaceId: "one",
  memberId,
  source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId: "one" } },
  status: "active"
})
const invitation = (id: string, issued: number, state: object = { _tag: "Pending" }) => ({
  details: {
    id,
    workspaceId: "one",
    recipientId: `human-${id}`,
    roleId: "builtin:member",
    inviterMemberId: "owner",
    issuedAt: at(issued),
    expiresAt: at(issued + 7 * day)
  },
  state
})

function fixture(section: SettingsTab = "members") {
  const server = {
    adaAssignment: "a-ada",
    invitations: [
      invitation("expired", -10 * day),
      invitation("accepted", -3 * day, {
        _tag: "Accepted",
        memberId: "ada",
        acceptedAt: at(-2 * day)
      }),
      invitation("pending", -day)
    ],
    /** Answers to the next role changes and invitations, in order; then success. */
    roleAnswers: [] as Array<Response>,
    inviteAnswers: [] as Array<Response>,
    invitationsDown: false,
    /** Each person's address: members', and every invitation's recipient's. */
    accounts: [
      { id: "alice", email: "alice@example.com" },
      ...["ada", "gone", "expired", "accepted", "pending"].map((id) => ({
        id: `human-${id}`,
        email: `${id}@example.test`
      }))
    ]
  }
  const changes: Array<{ body: unknown }> = []
  const issues: Array<{ key: string | null; body: unknown }> = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 2 }], invitations: [] })
    if (path === "/settings")
      return json({ workspace, canRename: true, canReadInvitations: true, canInvite: true, roles })
    if (path === "/settings/ownership")
      return json({
        workspace,
        owner,
        ownerAssignmentId: "a-owner",
        canTransfer: true,
        candidates: [ada]
      })
    if (path === "/members") return json([owner, ada, bot, gone])
    if (path === "/settings/members")
      // In no particular order: the roster puts the reader first, then everyone by name.
      return json([
        { member: bot, access: null, canRemove: true },
        {
          member: owner,
          access: {
            assignments: [assignment("a-owner", "owner", "builtin:owner")],
            roles,
            canManage: true
          },
          canRemove: false
        },
        {
          member: ada,
          access: {
            assignments: [assignment(server.adaAssignment, "ada", "builtin:member")],
            roles,
            canManage: true
          },
          canRemove: true
        },
        { member: gone, access: null, canRemove: false }
      ])
    if (path === "/assignments" && request.method === "PUT") {
      changes.push({ body: await request.json() })
      return server.roleAnswers.shift() ?? json(assignment("a-ada-3", "ada", "builtin:administrator"))
    }
    if (path === "/invitations" && request.method === "POST") {
      const body = (await request.json()) as { email: string; expiresAt: string }
      issues.push({ key: request.headers.get("idempotency-key"), body })
      const answer = server.inviteAnswers.shift()
      if (answer) return answer
      const created = {
        ...invitation("created", 0),
        details: {
          ...invitation("created", 0).details,
          recipientId: "human-created",
          expiresAt: body.expiresAt
        }
      }
      server.accounts.push({ id: "human-created", email: body.email })
      server.invitations.push(created)
      return json(created, 201)
    }
    if (path === "/invitations")
      return server.invitationsDown ? new Response("Down", { status: 503 }) : json(server.invitations)
    if (path === "/accounts") return json(server.accounts)
    return json({}, 404)
  })
  const done: Array<SettingsDone> = []
  let view!: ReturnType<typeof useWorkspaceSettings>
  function Consumer() {
    view = useWorkspaceSettings("one", section, { done: (entry) => done.push(entry) })
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
  return {
    get view() {
      return view
    },
    server,
    changes,
    issues,
    done
  }
}

it("shapes the roster, its roles, and every invitation for the Members tab", async () => {
  const f = fixture()
  expect(f.view.status()).toBe("loading")
  await waitFor(() => expect(f.view.members()).toHaveLength(3))
  const [alice, adaRow, botRow] = f.view.members()
  // The owner's role changes only by transferring ownership.
  expect(alice).toMatchObject({ name: "Alice", you: true, role: "Owner" })
  expect(f.view.role.choices("owner")).toEqual([])
  expect(adaRow).toMatchObject({
    name: "Ada",
    you: false,
    signIn: "ada@example.test",
    role: "Member",
    access: [{ name: "Member", scope: "workspace", active: true }]
  })
  expect(f.view.role.of("ada")).toBe("builtin:member")
  expect(f.view.role.choices("ada")).toEqual([
    { id: "builtin:member", name: "Member" },
    { id: "builtin:administrator", name: "Administrator" }
  ])
  expect(f.view.removable("ada")).toBe(true)
  expect(botRow).toMatchObject({ agent: true, access: undefined })
  expect(f.view.role.choices(botRow!.id)).toEqual([])
  await waitFor(() => expect(f.view.workspace()?.creator.name).toBe("Alice"))
  expect(f.view.memberCount()).toBe(2)
  expect(f.view.permissions()).toEqual({
    rename: true,
    invite: true,
    invitations: true,
    transfer: true
  })
  // Newest first, with expiry read against the clock; only pending ones may be revoked.
  await waitFor(() => expect(f.view.invitations()).toHaveLength(3))
  expect(f.view.invitations().map(({ id, status, revocable }) => ({ id, status, revocable }))).toEqual([
    { id: "pending", status: "pending", revocable: true },
    { id: "accepted", status: "accepted", revocable: false },
    { id: "expired", status: "expired", revocable: false }
  ])
  expect(f.view.invite.roles().map((choice) => choice.name)).toEqual(["Member", "Administrator"])
  // Search by name or sign-in, within the active or removed members.
  f.view.setQuery("ada@")
  expect(f.view.members().map((entry) => entry.id)).toEqual(["ada"])
  f.view.setQuery("")
  f.view.setFilter("removed")
  expect(f.view.members().map((entry) => entry.id)).toEqual(["gone"])
})

it("keeps a stale role choice through a refresh and saves it against what was reviewed", async () => {
  const f = fixture()
  await waitFor(() => expect(f.view.member("ada")).toBeDefined())
  f.view.role.choose("ada", "builtin:administrator")
  expect(f.view.role.changed("ada")).toBe(true)
  // Someone else changed Ada's access meanwhile.
  f.server.adaAssignment = "a-ada-2"
  f.server.roleAnswers.push(json({ _tag: "CoreError.Changed", resource: "Member", id: "ada" }, 409))
  f.view.role.save("ada")
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "role", error: "changed" }))
  expect(f.view.stale()).toBe(true)
  expect(f.changes[0]?.body).toMatchObject({ expectedAssignmentIds: ["a-ada"] })
  // Changes wait for the refresh; the draft stays.
  f.view.role.save("ada")
  expect(f.changes).toHaveLength(1)
  f.view.refresh()
  await waitFor(() => expect(f.view.stale()).toBe(false))
  expect(f.view.failure()).toBeUndefined()
  expect(f.view.role.of("ada")).toBe("builtin:administrator")
  f.view.role.save("ada")
  await waitFor(() => expect(f.done).toEqual([{ action: "role", subject: "Ada" }]))
  expect(f.changes[1]?.body).toEqual({
    memberId: "ada",
    roleId: "builtin:administrator",
    expectedAssignmentIds: ["a-ada-2"]
  })
})

it("retries an invitation whose response was lost with the same request key", async () => {
  const f = fixture()
  await waitFor(() => expect(f.view.invite.roles()).toHaveLength(2))
  f.view.invite.begin()
  f.view.invite.setRecipient(" new@example.test ")
  expect(f.view.invite.role()).toBe("builtin:member")
  f.server.inviteAnswers.push(new Response("Host unavailable", { status: 503 }))
  f.view.invite.save()
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "invite", error: "failed" }))
  // A failed request leaves the values current: try again at once.
  expect(f.view.stale()).toBe(false)
  f.view.invite.save()
  await waitFor(() => expect(f.done).toHaveLength(1))
  expect(f.done[0]).toEqual({ action: "invite", subject: "new@example.test", created: "created" })
  expect(f.issues).toHaveLength(2)
  expect(f.issues[0]?.key).toBeTruthy()
  expect(f.issues[1]?.key).toBe(f.issues[0]?.key)
  expect(f.issues[1]?.body).toMatchObject({ email: "new@example.test" })
  // The draft starts over for the next invitation.
  expect(f.view.invite.recipient()).toBe("")
  await waitFor(() => expect(f.view.invitations()[0]?.id).toBe("created"))
})

it("finishes an invitation whose list could not be read back once a refresh succeeds", async () => {
  const f = fixture()
  await waitFor(() => expect(f.view.invite.roles()).toHaveLength(2))
  f.view.invite.begin()
  f.view.invite.setRecipient("new@example.test")
  f.server.invitationsDown = true
  f.view.invite.save()
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "invite", error: "refresh-failed" }))
  // It exists: another attempt waits for the list rather than issuing again.
  expect(f.view.stale()).toBe(true)
  expect(f.done).toEqual([])
  f.view.invite.save()
  expect(f.issues).toHaveLength(1)
  f.server.invitationsDown = false
  f.view.refresh()
  await waitFor(() => expect(f.done).toEqual([{ action: "invite", subject: "new@example.test", created: "created" }]))
  expect(f.view.failure()).toBeUndefined()
  expect(f.issues).toHaveLength(1)
})

it("reads neither the roster nor invitations on the Workspace tab", async () => {
  const f = fixture("workspace")
  await waitFor(() => expect(f.view.owner()?.name).toBe("Alice"))
  expect(f.view.candidates().map((person) => person.name)).toEqual(["Ada"])
  f.view.transfer.begin()
  f.view.transfer.choose("ada")
  expect(f.view.transfer.chosen()).toBe("ada")
  expect(f.view.members()).toEqual([])
  expect(f.view.invitations()).toEqual([])
})
