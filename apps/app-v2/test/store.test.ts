import { Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
// @vitest-environment node
// Bun's own fetch and WebSocket reach the in-process server; fake-indexeddb is the browser's storage.
import { DeliveryJobs } from "@amends-dev/core/channel"
import { CoreError } from "@amends-dev/core/error"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import { Notification } from "@amends-dev/core/notification"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId, ThreadMessage, ThreadMessageService, ThreadParticipation } from "@amends-dev/core/thread"
import { type Turn, TurnJobs } from "@amends-dev/core/turn"
import { Invitation, InvitationService, Member, type Workspace } from "@amends-dev/core/workspace"
import {
  Accounts,
  Gateway,
  SessionTokens,
  SignIn,
  SignInStorage,
  SyncStorage,
  WorkspaceDirectory,
  WorkspaceStorage
} from "@amends-dev/gateway"
import { Api, Authentication, Draining, Routes, WorkspaceMember } from "@amends-dev/http"
import { SyncServer } from "@amends-dev/sync"
import { IndexedDb } from "@effect/platform-browser"
import { BunCrypto, BunHttpServer } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import { Context, DateTime, Effect, Exit, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import { FetchHttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api"
import { KeyValueStore } from "effect/persistence"
import { Socket } from "effect/socket"
import * as Store from "../src/sync/Store.ts"

const alice = Identity.HumanId.make("alice")

/** Development tokens: a token is the human ID it signs in. */
const sessionTokens = Layer.succeed(
  SessionTokens.SessionTokens,
  SessionTokens.SessionTokens.of({
    resolve: (token) =>
      Effect.succeed(Identity.Reference.cases.Human.make({ id: Identity.HumanId.make(Redacted.value(token)) })),
    revoke: () => Effect.void
  })
)
const signIn = Layer.succeed(
  SignIn.SignIn,
  SignIn.SignIn.of({
    methods: { emailCode: false, providers: [] },
    start: () => Effect.die("unused"),
    complete: () => Effect.die("unused")
  })
)

/** A host over memory storage: the gateway, its storage, and the HTTP API and sync server it serves. */
const host = Effect.gen(function* () {
  const storage = Layer.mergeAll(
    WorkspaceStorage.layerMemory,
    WorkspaceDirectory.layerMemory,
    Accounts.layerMemory,
    SignInStorage.layerMemory,
    SyncStorage.layerMemory
  ).pipe(Layer.provide(MemoryDatabase.layerConnection), Layer.provideMerge(BunCrypto.layer))
  return yield* Layer.build(
    Gateway.layer().pipe(
      Layer.provideMerge([storage, TurnJobs.layerNoRunner, DeliveryJobs.layerNoRunner]),
      Layer.provide(MemoryDatabase.layer)
    )
  )
})

/**
 * Serve the host's routes and sync server for as long as `scope` lasts, at `port`, or a port of
 * its own; the address it serves at.
 */
const serve = (services: Effect.Success<typeof host>, scope: Scope.Scope, port = 0) =>
  Layer.buildWithScope(
    HttpRouter.serve(Layer.mergeAll(Routes.layer, SyncServer.layer), {
      disableLogger: true,
      disableListenLog: true
    }).pipe(
      Layer.provide([sessionTokens, signIn, Draining.layer, Layer.succeedContext(services)]),
      // Bun's graceful stop waits its whole limit for a WebSocket open as it begins, even once closed.
      Layer.provideMerge(
        Layer.orDie(BunHttpServer.layer({ hostname: "127.0.0.1", port, gracefulShutdownTimeout: "100 millis" }))
      )
    ),
    scope
  ).pipe(Effect.map((served) => Context.get(served, HttpServer.HttpServer).address))

/** What a browser provides a store: its storage, cryptography, HTTP client, and WebSocket. */
const browser = Layer.mergeAll(
  Layer.succeed(
    IndexedDb.IndexedDb,
    IndexedDb.make({ indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange })
  ),
  KeyValueStore.layerMemory,
  EventLogEncryption.layerSubtle,
  BunCrypto.layer,
  // A connection kept alive would reach a host after it stopped, as a page's would not.
  FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false }))),
  Socket.layerWebSocketConstructorGlobal
)

/** Open alice's store of `workspace` on the host at `apiUrl` for as long as `scope` lasts. */
const openStore = (apiUrl: string, workspace: Workspace.Workspace, scope: Scope.Scope) =>
  Layer.buildWithScope(
    Store.layer({
      apiUrl,
      token: alice,
      humanId: alice,
      workspaceId: workspace.id,
      memberId: workspace.ownerMemberId
    }),
    scope
  ).pipe(Effect.map(Context.get(Store.Store)))

/** Invite `human` to `workspace` as a member, and accept as them: their member. */
const admit = (gateway: Gateway.Gateway["Service"], workspace: Workspace.Workspace, human: Identity.HumanId) =>
  Effect.gen(function* () {
    const expiresAt = DateTime.add(yield* DateTime.now, { days: 1 })
    const invitation = yield* gateway.asMember(
      workspace.id,
      Identity.MemberReference.cases.Human.make({ id: alice }),
      Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
        invitationService.issue({
          recipientId: human,
          recipientEmail: `${human}@example.com`,
          roleId: BuiltinRoles.MemberId,
          expiresAt
        })
      )
    )
    return yield* gateway.inWorkspace(
      workspace.id,
      Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
        invitationService.accept(invitation.details.id, human, Member.Name.make("Bob"))
      )
    )
  }).pipe(Effect.scoped)

/** The first of `stream`'s values that `holds` accepts, within five seconds. */
const firstWhere = <A, E>(stream: Stream.Stream<A, E>, holds: (value: A) => boolean) =>
  stream.pipe(Stream.filter(holds), Stream.runHead, Effect.map(Option.getOrThrow), Effect.timeout("5 seconds"))

const everywhere = ReplicaRecord.Place.cases.Workspace.make({})

describe("Store", () => {
  it.live("a store keeps its replica in sync with the host, and reads it again offline", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const serving = yield* Scope.make()
      const apiUrl = HttpServer.formatAddress(yield* serve(services, serving))

      const opened = yield* Scope.make()
      const store = yield* openStore(apiUrl, workspace, opened)
      // The server resets the new replica with everything alice may see.
      yield* firstWhere(store.list("Workspace", everywhere), (held) => held.length === 1)
      const groups = yield* firstWhere(store.list("Group", everywhere), (held) => held.length > 0)
      // A group made elsewhere reaches it as its commit lands.
      const client = yield* HttpApiClient.make(Api.Api, { baseUrl: apiUrl }).pipe(
        Effect.provide([
          HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
            next(HttpClientRequest.bearerToken(request, alice))
          ),
          WorkspaceMember.layerClient(workspace.id),
          FetchHttpClient.layer
        ])
      )
      yield* client.groups.create({ headers: {}, payload: { name: "Crew", memberIds: [workspace.ownerMemberId] } })
      const grown = yield* firstWhere(store.list("Group", everywhere), (held) => held.length > groups.length)
      yield* Scope.close(opened, Exit.void)

      // With the host gone, the store opens and reads what it held.
      yield* Scope.close(serving, Exit.void)
      const reopened = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      expect(yield* firstWhere(reopened.list("Group", everywhere), () => true)).toEqual(grown)
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("an action shows at once, reaches the host when it can, and comes back done or rejected", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const serving = yield* Scope.make()
      const address = yield* serve(services, serving)
      const apiUrl = HttpServer.formatAddress(address)
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", everywhere), (held) => held.length === 1)

      // A thread started shows at once, then as the server made it, under the same ID.
      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Hello", mentions: [] })
      const [started] = yield* firstWhere(store.threads(Group.GeneralId), (threads) => threads.length === 1)
      expect(started!.thread.pending).toBe(true)
      expect(Option.map(started!.opening, (message) => message.content)).toMatchObject(
        Option.some({ _tag: "Text", text: "Hello" })
      )
      const threadId = started!.thread.record.value.id
      yield* firstWhere(store.threads(Group.GeneralId), ([thread]) => thread?.thread.pending === false)
      const thread = ReplicaRecord.Place.cases.Thread.make({ threadId })
      expect(yield* firstWhere(store.actions, () => true)).toEqual([])

      // A rename and an edit show at once, then as the server made them.
      yield* store.write("ThreadRenamed", { threadId, title: "Hello thread", expectedTitle: null })
      yield* firstWhere(
        store.threads(Group.GeneralId),
        ([thread]) => thread?.thread.record.value.title === "Hello thread" && thread.thread.pending
      )
      yield* firstWhere(
        store.threads(Group.GeneralId),
        ([thread]) => thread?.thread.record.value.title === "Hello thread" && !thread.thread.pending
      )
      const opening = Option.getOrThrow(started!.opening)
      yield* store.write("ThreadMessageEdited", {
        messageId: opening.id,
        text: "Hello again",
        mentions: [],
        expectedRevision: 1
      })
      const edited = yield* firstWhere(store.thread(threadId), ({ messages }) =>
        messages.some(
          ({ record, pending }) =>
            !pending &&
            ThreadMessage.Content.isAnyOf(["Text"])(record.value.content) &&
            record.value.content.text === "Hello again"
        )
      )
      expect(edited.readThrough).toBeGreaterThan(0)

      // Written with the host gone, a reply waits, then reaches it when it is back.
      yield* Scope.close(serving, Exit.void)
      yield* store.write("ThreadMessagePosted", { threadId, text: "While away", mentions: [] })
      const waiting = yield* firstWhere(store.list("ThreadMessage", thread), (held) => held.length === 2)
      expect(waiting.filter((message) => message.pending)).toHaveLength(1)
      yield* serve(services, yield* Effect.scope, Option.getOrThrow(port(address)))
      yield* firstWhere(store.list("ThreadMessage", thread), (held) => held.every((message) => !message.pending))

      // One the host refuses comes back rejected, with why, and leaves nothing it expected.
      const nowhere = ThreadId.ThreadId.make("no-such-thread")
      yield* store.write("ThreadMessagePosted", { threadId: nowhere, text: "Lost", mentions: [] })
      const [rejected] = yield* firstWhere(store.actions, ([action]) =>
        Option.isSome(action?.rejection ?? Option.none())
      )
      expect(rejected!.tag).toBe("ThreadMessagePosted")
      expect(rejected!.rejection).toEqual(Option.some(new CoreError.NotFound({ resource: "Thread", id: nowhere })))
      const place = ReplicaRecord.Place.cases.Thread.make({ threadId: nowhere })
      expect(yield* firstWhere(store.list("ThreadMessage", place), () => true)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a thread made a task here, and changed, is the task the host keeps, and a stale change is refused", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", everywhere), (held) => held.length === 1)
      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Ship the release", mentions: [] })
      const [started] = yield* firstWhere(
        store.threads(Group.GeneralId),
        ([thread]) => thread?.thread.pending === false
      )
      const threadId = started!.thread.record.value.id

      // Made a task, the thread's task shows at once in its group, then as the host made it.
      yield* store.write("TaskCreated", { threadId })
      const made = yield* firstWhere(store.thread(threadId), ({ task }) => Option.isSome(task))
      expect(made.task).toMatchObject(
        Option.some({ pending: true, record: { value: { groupId: Group.GeneralId, status: "triage" } } })
      )
      yield* firstWhere(store.thread(threadId), ({ task }) => Option.exists(task, ({ pending }) => !pending))

      yield* store.write("TaskUpdated", { threadId, change: { _tag: "Status", from: "triage", to: "doing" } })
      yield* firstWhere(store.thread(threadId), ({ task }) =>
        Option.exists(task, ({ record, pending }) => pending && record.value.status === "doing")
      )
      yield* firstWhere(store.thread(threadId), ({ task }) =>
        Option.exists(task, ({ record, pending }) => !pending && record.value.status === "doing")
      )
      const [listed] = yield* firstWhere(store.threads(Group.GeneralId), ([thread]) =>
        Option.exists(thread?.task ?? Option.none(), ({ status }) => status === "doing")
      )
      expect(listed!.task).toMatchObject(Option.some({ threadId, status: "doing" }))

      // A change from what the task no longer is shows nothing, and comes back refused.
      yield* store.write("TaskUpdated", { threadId, change: { _tag: "Status", from: "triage", to: "done" } })
      const [refused] = yield* firstWhere(store.actions, ([action]) =>
        Option.isSome(action?.rejection ?? Option.none())
      )
      expect(refused!.rejection).toEqual(Option.some(new CoreError.Changed({ resource: "Task", id: threadId })))
      expect((yield* firstWhere(store.thread(threadId), () => true)).task).toMatchObject(
        Option.some({ pending: false, record: { value: { status: "doing" } } })
      )
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a team and a conversation started here are the ones the host makes, under the same IDs", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const bob = yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Member", everywhere), (held) => held.length === 2)

      yield* store.write("TeamCreated", { name: "Design", memberIds: [workspace.ownerMemberId] })
      const team = (yield* firstWhere(store.list("Group", everywhere), (held) =>
        held.some(({ pending }) => pending)
      )).find(({ pending }) => pending)
      const teamId = team!.record.value.id
      const admission = (yield* firstWhere(store.every("GroupMembership"), (held) =>
        held.some(({ record }) => record.value.groupId === teamId)
      )).find(({ record }) => record.value.groupId === teamId)
      expect(admission).toMatchObject({ pending: true, record: { value: { memberId: workspace.ownerMemberId } } })
      // The server's own team and admission arrive under the IDs the browser gave them.
      yield* firstWhere(store.list("Group", everywhere), (held) =>
        held.some(({ record, pending }) => record.value.id === teamId && !pending)
      )
      expect(
        (yield* firstWhere(store.every("GroupMembership"), (held) =>
          held.some(({ record, pending }) => record.value.groupId === teamId && !pending)
        )).filter(({ record }) => record.value.groupId === teamId)
      ).toMatchObject([{ record: { value: { id: admission!.record.value.id } }, pending: false }])

      yield* store.write("DirectThreadStarted", { memberIds: [bob.id], text: "Got a minute?", mentions: [] })
      const direct = (yield* firstWhere(store.list("Group", everywhere), (held) =>
        held.some(({ record, pending }) => record.value.kind === "Direct" && pending)
      )).find(({ record }) => record.value.kind === "Direct")!.record.value
      const [opened] = yield* firstWhere(store.threads(direct.id), (threads) => threads.length === 1)
      yield* firstWhere(store.threads(direct.id), ([thread]) => thread?.thread.pending === false)
      const [arrived] = yield* firstWhere(store.threads(direct.id), ([thread]) => thread?.thread.pending === false)
      expect(arrived!.thread.record.value.id).toBe(opened!.thread.record.value.id)
      expect(
        (yield* firstWhere(store.list("Group", everywhere), (held) =>
          held.some(({ record, pending }) => record.value.id === direct.id && !pending)
        )).filter(({ record }) => record.value.kind === "Direct")
      ).toHaveLength(1)
      expect(yield* firstWhere(store.actions, () => true)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live(
    "an invitation reaches the account its address names, and a role change becomes the server's under its IDs",
    () =>
      Effect.gen(function* () {
        const services = yield* host
        const gateway = Context.get(services, Gateway.Gateway)
        const accounts = Context.get(services, Accounts.Accounts)
        const workspace = yield* gateway.createWorkspace(alice, {
          name: "Studio",
          memberName: Member.Name.make("Alice")
        })
        const bob = yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
        const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
        const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
        yield* firstWhere(store.list("Member", everywhere), (held) => held.length === 2)

        const carol = Accounts.Email.make("carol@example.com")
        const expiresAt = DateTime.add(yield* DateTime.now, { days: 1 })
        yield* store.write("InvitationIssued", { email: carol, roleId: BuiltinRoles.MemberId, expiresAt })
        const isOpen = ({ record }: { readonly record: { readonly value: Invitation.Invitation } }) =>
          Invitation.State.isAnyOf(["Pending"])(record.value.state)
        const invitation = (yield* firstWhere(store.list("Invitation", everywhere), (held) => held.some(isOpen))).find(
          isOpen
        )
        expect(invitation!.record.value.details).toMatchObject({
          recipientId: (yield* accounts.findOrCreate(carol)).id,
          recipientEmail: carol
        })

        const isBobs = ({ record }: { readonly record: { readonly value: Assignment.Assignment } }) =>
          record.value.memberId === bob.id
        const member = (yield* firstWhere(store.list("Assignment", everywhere), (held) => held.some(isBobs))).find(
          isBobs
        )
        yield* store.write("RolesReplaced", {
          memberId: bob.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: [member!.record.value.id]
        })
        // The new role shows at once, and the one it replaces as revoked.
        const changed = (yield* firstWhere(store.list("Assignment", everywhere), (held) =>
          held.some((item) => isBobs(item) && item.pending)
        )).filter(isBobs)
        const given = changed.find(({ record }) => record.value.id !== member!.record.value.id)!
        expect(changed.find(({ record }) => record.value.id === member!.record.value.id)?.record.value.status).toBe(
          "revoked"
        )
        // Then the server's, under the same ID.
        const settled = (yield* firstWhere(store.list("Assignment", everywhere), (held) =>
          held.filter(isBobs).every(({ pending }) => !pending)
        )).filter(isBobs)
        expect(
          settled.find(({ record }) => record.value.status === "active" && Assignment.isWorkspaceRole(record.value))
            ?.record.value.id
        ).toBe(given.record.value.id)
      }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a reply to the person's thread reaches their inbox, and reading the thread settles it", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const bob = Identity.HumanId.make("bob")
      yield* admit(gateway, workspace, bob)
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", everywhere), (held) => held.length === 1)

      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Plans", mentions: [] })
      const [started] = yield* firstWhere(
        store.threads(Group.GeneralId),
        ([thread]) => thread !== undefined && !thread.thread.pending
      )
      const threadId = started!.thread.record.value.id
      yield* gateway
        .asMember(
          workspace.id,
          Identity.MemberReference.cases.Human.make({ id: bob }),
          Effect.flatMap(ThreadMessageService.ThreadMessageService, (threadMessageService) =>
            threadMessageService.publish({ threadId, text: "Sounds good", mentions: [] })
          )
        )
        .pipe(Effect.scoped)
      const isWaiting = ({ notification }: Store.InboxEntry) =>
        Notification.State.isAnyOf(["Pending"])(notification.record.value.state)
      const entry = (yield* firstWhere(store.inbox, (entries) => entries.some(isWaiting))).find(isWaiting)
      expect(Option.map(entry!.message, (message) => message.content)).toMatchObject(
        Option.some({ _tag: "Text", text: "Sounds good" })
      )
      expect(Option.map(entry!.thread, ({ id }) => id)).toEqual(Option.some(threadId))
      expect(Option.map(entry!.opening, (message) => message.content)).toMatchObject(
        Option.some({ _tag: "Text", text: "Plans" })
      )

      // Reading the thread through the reply settles its notification at once, then on the server.
      yield* store.write("ThreadMarkedRead", {
        threadId,
        throughSequence: entry!.notification.record.value.thread!.sequence
      })
      const isSeen = ({ notification }: Store.InboxEntry) =>
        Notification.State.isAnyOf(["Seen"])(notification.record.value.state)
      yield* firstWhere(
        store.inbox,
        (entries) => entries.every(isSeen) && entries.some(({ notification }) => notification.pending)
      )
      yield* firstWhere(store.inbox, (entries) => entries.every((item) => isSeen(item) && !item.notification.pending))
    }).pipe(Effect.scoped, Effect.provide(browser))
  )
})

/** The port a server listens at, when it listens on one. */
const port = (address: HttpServer.HttpServer["Service"]["address"]) =>
  "port" in address ? Option.some(address.port) : Option.none()

describe("Store.viewTurns", () => {
  const turn = (id: string, status: Turn.Status, minute: number, participationId = "participation-3") => ({
    record: ReplicaRecord.ReplicaRecord.cases.Turn.make({
      value: Schema.decodeSync(ReplicaRecord.Turn)({
        id,
        workspaceId: "workspace-1",
        groupId: "general",
        threadId: "thread-1",
        agentId: "agent-1",
        memberId: "member-3",
        participationId,
        retry: null,
        status,
        acceptedThroughSequence: 1,
        selection: null,
        messageIds: [],
        failure: null,
        cancelReason: null,
        createdAt: `2026-10-18T12:0${minute}:00Z`,
        startedAt: null,
        finishedAt: null
      })
    }),
    pending: false
  })
  const participation = (id: string, status: "active" | "ended") =>
    Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      participant: {
        _tag: "Member",
        memberId: "member-3",
        groupMembershipId: "membership-3",
        identity: { _tag: "Agent", id: "agent-1" }
      },
      joinedAt: "2026-10-18T12:00:00Z",
      joinedAtSequence: 1,
      status,
      endedAt: status === "ended" ? "2026-10-18T12:30:00Z" : null
    })
  const retryOpen = (views: ReadonlyArray<Store.TurnView>) =>
    views.map(({ turn, retryOpen }) => [turn.record.value.id, retryOpen])

  it("lists them oldest first, and opens a retry to the agent's latest that failed or stopped, while it takes part", () => {
    const active = [participation("participation-3", "active")]
    expect(retryOpen(Store.viewTurns([turn("turn-2", "failed", 2), turn("turn-1", "failed", 1)], active))).toEqual([
      ["turn-1", false],
      ["turn-2", true]
    ])
    expect(retryOpen(Store.viewTurns([turn("turn-1", "cancelled", 1), turn("turn-2", "queued", 2)], active))).toEqual([
      ["turn-1", false],
      ["turn-2", false]
    ])
    expect(
      retryOpen(Store.viewTurns([turn("turn-1", "failed", 1)], [participation("participation-3", "ended")]))
    ).toEqual([["turn-1", false]])
  })
})
