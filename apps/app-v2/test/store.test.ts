import { ChannelTransport } from "@amends-dev/channel"
import { Integration } from "@amends-dev/connection"
import { Assignment, BuiltinRoles } from "@amends-dev/core/authorization"
// @vitest-environment node
// Bun's own fetch and WebSocket reach the in-process server; fake-indexeddb is the browser's storage.
import { ChannelIntake, DeliveryJobs } from "@amends-dev/core/channel"
import { CoreError } from "@amends-dev/core/error"
import { Group, GroupId, GroupPermissions } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import { Notification } from "@amends-dev/core/notification"
import { PresenceRelay } from "@amends-dev/core/presence"
import { ReplicaRecord } from "@amends-dev/core/replica"
import {
  ThreadActivity,
  ThreadId,
  ThreadMessage,
  ThreadMessageService,
  ThreadParticipation
} from "@amends-dev/core/thread"
import { type Turn, TurnJobs } from "@amends-dev/core/turn"
import {
  Invitation,
  InvitationService,
  Member,
  MemberId,
  type Workspace,
  WorkspaceSettingsPermissions
} from "@amends-dev/core/workspace"
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
import { Context, DateTime, Effect, Exit, Layer, Option, Redacted, Result, Schema, Scope, Stream } from "effect"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import { FetchHttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api"
import { KeyValueStore } from "effect/persistence"
import { Socket } from "effect/socket"
import { memberClient } from "../src/api.ts"
import { readSettings } from "../src/feature/settings/subscription.ts"
import { may, workspaceTarget } from "../src/permissions.ts"
import * as Store from "../src/store/Store.ts"
import {
  bob,
  conversationWithBob,
  deleted,
  design,
  general,
  membership,
  opening,
  reply,
  saying,
  task,
  thread
} from "./fixtures.ts"

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

/** An integration the host installs: an API at a base URL, reached with a key or none, which always answers. */
const testApi = Integration.make({
  id: "test-api",
  name: "Test API",
  settings: Schema.Struct({ url: Schema.NonEmptyString.annotate({ title: "Base URL" }) }),
  auth: ["apiKey", "none"],
  check: () => Effect.succeed({ status: "healthy" })
})

/** An integration whose connections offer models at an endpoint, by any id, and take no key. */
const testModels = Integration.make({
  id: "test-models",
  name: "Test models",
  auth: ["none"],
  models: {
    listed: [],
    unlisted: true,
    endpoint: (_, { model }) =>
      Result.succeed({ provider: "test-models", model, protocol: "openai-chat", url: "http://127.0.0.1:9/v1" })
  },
  check: () => Effect.succeed({ status: "healthy" })
})

/** An integration whose connections give channels over a transport that receives and posts nothing. */
const testChannels = Integration.make({
  id: "test-channels",
  name: "Test channels",
  auth: ["none"],
  channels: () =>
    Effect.succeed({
      self: ChannelTransport.ExternalId.make("bot"),
      receive: () => Effect.die("No test receives"),
      post: () => Effect.die("No test posts")
    }),
  check: () => Effect.succeed({ status: "healthy" })
})

/**
 * A host over memory storage, which installs the test API, models, and channels: the gateway, its
 * storage, and the HTTP API and sync server it serves.
 */
const host = Effect.gen(function* () {
  const storage = Layer.mergeAll(
    WorkspaceStorage.layerMemory,
    WorkspaceDirectory.layerMemory,
    Accounts.layerMemory,
    SignInStorage.layerMemory,
    SyncStorage.layerMemory
  ).pipe(Layer.provide(MemoryDatabase.layerConnection), Layer.provideMerge(BunCrypto.layer))
  return yield* Layer.build(
    Gateway.layer({ integrations: [testApi, testModels, testChannels] }).pipe(
      Layer.provideMerge([storage, TurnJobs.layerNoRunner, DeliveryJobs.layerNoRunner, PresenceRelay.layerMemory]),
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

/** The task listed under the place `place` among `views`. */
const taskIn = (views: ReadonlyArray<Store.TaskView>, place: string) => views.find((view) => view.place === place)!

/** How many members the group `groupId` has among `views`. */
const membersIn = (views: ReadonlyArray<Store.GroupView>, groupId: Group.Group["id"]) =>
  views.find(({ group }) => group.record.value.id === groupId)?.members

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
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
      const groups = yield* firstWhere(store.list("Group", Store.workspacePlace), (held) => held.length > 0)
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
      const grown = yield* firstWhere(store.list("Group", Store.workspacePlace), (held) => held.length > groups.length)
      yield* Scope.close(opened, Exit.void)

      // With the host gone, the store opens and reads what it held.
      yield* Scope.close(serving, Exit.void)
      const reopened = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      expect(yield* firstWhere(reopened.list("Group", Store.workspacePlace), () => true)).toEqual(grown)
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
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)

      // A thread started shows at once, then as the server made it, under the same ID.
      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Hello", mentions: [] })
      const [started] = yield* firstWhere(store.threads(Group.GeneralId), (threads) => threads.length === 1)
      expect(started!.thread.pending).toBe(true)
      expect(Option.map(started!.opening, (message) => message.content)).toMatchObject(
        Option.some({ _tag: "Text", text: "Hello" })
      )
      expect(started!.replies).toBe(0)
      expect(started!.repliers).toEqual([])
      expect(started!.lastActiveAt).toEqual(Option.getOrThrow(started!.opening).publishedAt)
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
      // The reply shows in its group's list at once, by who wrote it.
      const [replied] = yield* firstWhere(store.threads(Group.GeneralId), ([thread]) => thread?.replies === 1)
      expect(replied!.repliers).toEqual([ThreadMessage.Author.cases.Member.make({ memberId: workspace.ownerMemberId })])
      expect(replied!.lastActiveAt).toEqual(waiting.find((message) => message.pending)!.record.value.publishedAt)
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
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
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
      // The tasks list it too, with the opening of the thread the replica already held.
      expect(yield* firstWhere(store.tasks, (views) => views.length === 1)).toMatchObject([
        { thread: { id: threadId }, opening: Option.some({ content: { _tag: "Text", text: "Ship the release" } }) }
      ])
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

  it.live(
    "stopping to follow a thread, and following it again, are noted in the thread as the host recorded them",
    () =>
      Effect.gen(function* () {
        const services = yield* host
        const gateway = Context.get(services, Gateway.Gateway)
        const workspace = yield* gateway.createWorkspace(alice, {
          name: "Studio",
          memberName: Member.Name.make("Alice")
        })
        const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
        const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
        yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
        yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Hello", mentions: [] })
        const [started] = yield* firstWhere(
          store.threads(Group.GeneralId),
          ([thread]) => thread?.thread.pending === false
        )
        const threadId = started!.thread.record.value.id

        // Starting a thread is joining it by writing, which has no note.
        const joined = yield* firstWhere(store.thread(threadId), ({ participation }) => Option.isSome(participation))
        expect(joined.participationChanges).toEqual([])
        const participationId = Option.getOrThrow(joined.participation).record.value.id

        yield* store.write("ThreadUnfollowed", { threadId, participationId })
        const unfollowed = yield* firstWhere(store.thread(threadId), ({ participationChanges }) =>
          participationChanges.some(({ change }) => change === "unfollowed")
        )
        expect(unfollowed.participationChanges.map(({ change, memberId }) => [change, memberId])).toEqual([
          ["unfollowed", workspace.ownerMemberId]
        ])

        yield* store.write("ThreadFollowed", { threadId })
        const followed = yield* firstWhere(store.thread(threadId), ({ participationChanges }) =>
          participationChanges.some(({ change }) => change === "followed")
        )
        expect(followed.participationChanges.map(({ change }) => change)).toEqual(["unfollowed", "followed"])
      }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a thread the replica lacks reads as absent once the replica answers, and as present once it holds it", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)

      const absent = yield* firstWhere(store.thread(ThreadId.ThreadId.make("thread-missing")), () => true)
      expect(Option.isNone(absent.thread)).toBe(true)
      expect(absent.messages).toEqual([])

      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Hello", mentions: [] })
      const [started] = yield* firstWhere(
        store.threads(Group.GeneralId),
        ([thread]) => thread?.thread.pending === false
      )
      const present = yield* firstWhere(store.thread(started!.thread.record.value.id), () => true)
      expect(Option.isSome(present.thread)).toBe(true)
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a thread started as a task shows its task at once in its group, then as the host made it", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)

      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Plan the offsite", mentions: [] })
      yield* store.write("ThreadStarted", {
        groupId: Group.GeneralId,
        text: "Ship the release",
        mentions: [],
        task: {}
      })
      const trackers = (threads: ReadonlyArray<Store.ThreadView>) => threads.filter(({ task }) => Option.isSome(task))

      // The task shows with its thread, in triage, and the thread started without one tracks none.
      const [tracking] = yield* firstWhere(
        store.threads(Group.GeneralId),
        (threads) => trackers(threads).length === 1
      ).pipe(Effect.map(trackers))
      expect(tracking!.thread.pending).toBe(true)
      expect(Option.map(tracking!.opening, ({ content }) => content)).toMatchObject(
        Option.some({ _tag: "Text", text: "Ship the release" })
      )
      expect(tracking!.task).toMatchObject(
        Option.some({ threadId: tracking!.thread.record.value.id, groupId: Group.GeneralId, status: "triage" })
      )

      // Once the host has made them, the same thread tracks the same task, last active when its opening came.
      const [made] = yield* firstWhere(
        store.threads(Group.GeneralId),
        (threads) =>
          threads.length === 2 && threads.every(({ thread }) => !thread.pending) && trackers(threads).length === 1
      ).pipe(Effect.map(trackers))
      expect(made!.thread.record.value.id).toBe(tracking!.thread.record.value.id)
      expect(made!.task).toMatchObject(Option.some({ status: "triage", assignee: null }))
      expect(made!.lastActiveAt).toEqual(Option.getOrThrow(made!.opening).publishedAt)
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a task lists with its thread and its group's place, as it is written and once the host has it", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, {
        name: "Studio",
        memberName: Member.Name.make("Alice")
      })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)

      // A task in each of two groups, once the host has the team, and a thread that tracks none.
      yield* store.write("TeamCreated", { name: "Design", memberIds: [workspace.ownerMemberId] })
      const teams = yield* firstWhere(store.list("Group", Store.workspacePlace), (held) =>
        held.some(({ record, pending }) => !pending && record.value.kind === "Team" && record.value.name === "Design")
      )
      const teamId = teams.find(({ record }) => record.value.kind === "Team" && record.value.name === "Design")!.record
        .value.id
      yield* store.write("ThreadStarted", { groupId: Group.GeneralId, text: "Plan the offsite", mentions: [] })
      yield* store.write("ThreadStarted", {
        groupId: Group.GeneralId,
        text: "Ship the release",
        mentions: [],
        task: {}
      })
      yield* store.write("ThreadStarted", { groupId: teamId, text: "Review the logo", mentions: [], task: {} })

      // Each lists at once, in triage, at the place of its group.
      const written = yield* firstWhere(store.tasks, (views) => views.length === 2)
      const shipping = taskIn(written, "#general")
      expect([shipping.task.status, taskIn(written, "#Design").task.status]).toEqual(["triage", "triage"])

      // Once the host has them, the same tasks list.
      const made = yield* firstWhere(
        store.tasks,
        (views) => views.length === 2 && views.every(({ pending }) => !pending)
      )
      expect(taskIn(made, "#general")).toMatchObject({
        thread: { id: shipping.thread.id, groupId: Group.GeneralId }
      })
      expect(taskIn(made, "#Design")).toMatchObject({
        thread: { groupId: teamId },
        opening: Option.some({ content: { _tag: "Text", text: "Review the logo" } })
      })
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
      yield* firstWhere(store.list("Member", Store.workspacePlace), (held) => held.length === 2)

      // The person may create teams, as the workspace's owner.
      expect(
        (yield* firstWhere(store.grants, (grants) => grants.length > 0)).some(
          ({ permission }) => permission === GroupPermissions.Create.name
        )
      ).toBe(true)
      yield* store.write("TeamCreated", { name: "Design", memberIds: [workspace.ownerMemberId] })
      const team = (yield* firstWhere(store.list("Group", Store.workspacePlace), (held) =>
        held.some(({ pending }) => pending)
      )).find(({ pending }) => pending)
      const teamId = team!.record.value.id
      const admission = (yield* firstWhere(store.every("GroupMembership"), (held) =>
        held.some(({ record }) => record.value.groupId === teamId)
      )).find(({ record }) => record.value.groupId === teamId)
      expect(admission).toMatchObject({ pending: true, record: { value: { memberId: workspace.ownerMemberId } } })
      // The team opens with its admission, whether or not the server holds them yet.
      expect(yield* firstWhere(store.group(teamId), ({ group }) => Option.isSome(group))).toMatchObject({
        group: { value: { record: { value: { name: "Design" } } } },
        memberships: [{ record: { value: { memberId: workspace.ownerMemberId } } }]
      })
      // The server's own team and admission arrive under the IDs the browser gave them.
      yield* firstWhere(store.list("Group", Store.workspacePlace), (held) =>
        held.some(({ record, pending }) => record.value.id === teamId && !pending)
      )
      expect(
        (yield* firstWhere(store.every("GroupMembership"), (held) =>
          held.some(({ record, pending }) => record.value.groupId === teamId && !pending)
        )).filter(({ record }) => record.value.groupId === teamId)
      ).toMatchObject([{ record: { value: { id: admission!.record.value.id } }, pending: false }])

      yield* store.write("DirectThreadStarted", { memberIds: [bob.id], text: "Got a minute?", mentions: [] })
      const direct = (yield* firstWhere(store.list("Group", Store.workspacePlace), (held) =>
        held.some(({ record, pending }) => record.value.kind === "Direct" && pending)
      )).find(({ record }) => record.value.kind === "Direct")!.record.value
      const [opened] = yield* firstWhere(store.threads(direct.id), (threads) => threads.length === 1)
      yield* firstWhere(store.threads(direct.id), ([thread]) => thread?.thread.pending === false)
      const [arrived] = yield* firstWhere(store.threads(direct.id), ([thread]) => thread?.thread.pending === false)
      expect(arrived!.thread.record.value.id).toBe(opened!.thread.record.value.id)
      expect(
        (yield* firstWhere(store.list("Group", Store.workspacePlace), (held) =>
          held.some(({ record, pending }) => record.value.id === direct.id && !pending)
        )).filter(({ record }) => record.value.kind === "Direct")
      ).toHaveLength(1)
      expect(yield* firstWhere(store.actions, () => true)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a group lists with its members: a team's admitted ones, and a conversation's", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const bob = yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
      const carol = yield* admit(gateway, workspace, Identity.HumanId.make("carol"))
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)

      // Everyone who joined the workspace is in its general group.
      yield* firstWhere(store.groups, (views) => membersIn(views, Group.GeneralId) === 3)

      // A team counts the admissions it is created with at once, and the same ones once the server makes them.
      yield* store.write("TeamCreated", {
        name: "Design",
        memberIds: [workspace.ownerMemberId, bob.id, carol.id]
      })
      const team = (yield* firstWhere(store.groups, (views) => views.some(({ group }) => group.pending))).find(
        ({ group }) => group.pending
      )!
      const teamId = team.group.record.value.id
      expect(team.members).toBe(3)
      const admissions = (yield* firstWhere(
        store.every("GroupMembership"),
        (held) =>
          held.filter(({ record }) => record.value.groupId === teamId).length === 3 &&
          held.every(({ pending }) => !pending)
      )).filter(({ record }) => record.value.groupId === teamId)
      yield* firstWhere(store.groups, (views) => membersIn(views, teamId) === 3)

      // A member removed from it is no longer counted, as the person removes them and once the server has.
      const carolsAdmission = admissions.find(({ record }) => record.value.memberId === carol.id)!
      yield* store.write("GroupMemberRemoved", { groupId: teamId, membershipId: carolsAdmission.record.value.id })
      yield* firstWhere(store.groups, (views) => membersIn(views, teamId) === 2)
      yield* firstWhere(store.every("GroupMembership"), (held) =>
        held.some(
          ({ record, pending }) =>
            record.value.id === carolsAdmission.record.value.id && record.value.status === "removed" && !pending
        )
      )
      expect(membersIn(yield* firstWhere(store.groups, () => true), teamId)).toBe(2)

      // A conversation counts the members it is made with, before the server holds it and after.
      yield* store.write("DirectThreadStarted", { memberIds: [bob.id], text: "Got a minute?", mentions: [] })
      const isDirect = ({ group }: Store.GroupView) => group.record.value.kind === "Direct"
      expect((yield* firstWhere(store.groups, (views) => views.some(isDirect))).find(isDirect)?.members).toBe(2)
      const settled = yield* firstWhere(store.groups, (views) =>
        views.some((view) => isDirect(view) && !view.group.pending)
      )
      expect(settled.find(isDirect)?.members).toBe(2)
    }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("a search finds the groups, threads, and people called what it asks, as the person sees them", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const bob = yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.groups, (views) => membersIn(views, Group.GeneralId) === 2)

      // What the person has written and the server does not hold yet is found.
      yield* store.write("TeamCreated", { name: "Design crew", memberIds: [workspace.ownerMemberId, bob.id] })
      yield* store.write("ThreadStarted", {
        groupId: Group.GeneralId,
        text: "Café plans for the offsite",
        mentions: []
      })
      yield* store.write("DirectThreadStarted", { memberIds: [bob.id], text: "Got a minute?", mentions: [] })

      /** What a search for `query` finds, by the groups' names, the threads' words and group names, and the people's names. */
      const found = (query: string) =>
        Effect.map(store.search(query), ({ groups, threads, people }) => ({
          groups: groups.map(({ name }) => name),
          threads: threads.map(({ words, groupName }) => [words, groupName]),
          people: people.map(({ name }) => name)
        }))
      const cafe = [["Café plans for the offsite", "general"]]
      const nothing = { groups: [], threads: [], people: [] }

      expect(yield* found("DESIGN")).toEqual({ groups: ["Design crew"], threads: [], people: [] })
      expect(yield* found("gene")).toEqual({ groups: ["general"], threads: [], people: [] })
      expect(yield* found("cafe")).toEqual({ groups: [], threads: cafe, people: [] })
      // A conversation is named for the other member, who is found among the people too, and the person is not.
      expect(yield* found("bob")).toEqual({ groups: ["Bob"], threads: [], people: ["Bob"] })
      expect(yield* found("alice")).toEqual(nothing)
      expect(yield* found("")).toEqual(nothing)

      // Once the server has them, the same are found.
      yield* firstWhere(store.groups, (views) => views.length === 3 && views.every(({ group }) => !group.pending))
      yield* firstWhere(store.threads(Group.GeneralId), ([started]) => started?.thread.pending === false)
      expect(yield* found("DESIGN")).toEqual({ groups: ["Design crew"], threads: [], people: [] })
      expect(yield* found("cafe")).toEqual({ groups: [], threads: cafe, people: [] })
      expect(yield* found("bob")).toEqual({ groups: ["Bob"], threads: [], people: ["Bob"] })
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
        yield* firstWhere(store.list("Member", Store.workspacePlace), (held) => held.length === 2)

        const carol = Accounts.Email.make("carol@example.com")
        const expiresAt = DateTime.add(yield* DateTime.now, { days: 1 })
        yield* store.write("InvitationIssued", { email: carol, roleId: BuiltinRoles.MemberId, expiresAt })
        const isOpen = ({ record }: { readonly record: { readonly value: Invitation.Invitation } }) =>
          Invitation.State.isAnyOf(["Pending"])(record.value.state)
        const invitation = (yield* firstWhere(store.list("Invitation", Store.workspacePlace), (held) =>
          held.some(isOpen)
        )).find(isOpen)
        expect(invitation!.record.value.details).toMatchObject({
          recipientId: (yield* accounts.findOrCreate(carol)).id,
          recipientEmail: carol
        })

        const isBobs = ({ record }: { readonly record: { readonly value: Assignment.Assignment } }) =>
          record.value.memberId === bob.id
        const member = (yield* firstWhere(store.list("Assignment", Store.workspacePlace), (held) =>
          held.some(isBobs)
        )).find(isBobs)
        yield* store.write("RolesReplaced", {
          memberId: bob.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: [member!.record.value.id]
        })
        // The new role shows at once, and the one it replaces as revoked.
        const changed = (yield* firstWhere(store.list("Assignment", Store.workspacePlace), (held) =>
          held.some((item) => isBobs(item) && item.pending)
        )).filter(isBobs)
        const given = changed.find(({ record }) => record.value.id !== member!.record.value.id)!
        expect(changed.find(({ record }) => record.value.id === member!.record.value.id)?.record.value.status).toBe(
          "revoked"
        )
        // Then the server's, under the same ID.
        const settled = (yield* firstWhere(store.list("Assignment", Store.workspacePlace), (held) =>
          held.filter(isBobs).every(({ pending }) => !pending)
        )).filter(isBobs)
        expect(
          settled.find(({ record }) => record.value.status === "active" && Assignment.isWorkspaceRole(record.value))
            ?.record.value.id
        ).toBe(given.record.value.id)
      }).pipe(Effect.scoped, Effect.provide(browser))
  )

  it.live("the settings read together: the workspace, its members, roles, assignments, and what the owner may do", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      const settings = yield* firstWhere(
        readSettings(store),
        ({ members, roles, assignments, grants }) =>
          members.length === 2 && roles.length === 3 && assignments.length === 2 && grants.length > 0
      )
      expect(Option.map(settings.workspace, ({ workspace }) => workspace.name)).toEqual(Option.some("Studio"))
      expect(settings.invitations.map(({ invitation }) => invitation.state._tag)).toEqual(["Accepted"])
      expect(may(settings.grants, WorkspaceSettingsPermissions.Rename, workspaceTarget(workspace.id))).toBe(true)
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
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)

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

describe("Store, for the workspace's connections", () => {
  it.live("a connection added over HTTP reaches the store, and its rename and removal show at once", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
      const client = yield* memberClient(apiUrl, alice, workspace.id)
      const added = yield* client.connections.create({
        headers: {},
        payload: { integration: "test-api", name: "Models", settings: { url: "http://127.0.0.1:9" }, auth: "none" }
      })
      const [arrived] = yield* firstWhere(store.list("Connection", Store.workspacePlace), (held) => held.length === 1)
      expect(arrived).toMatchObject({
        pending: false,
        record: { value: { id: added.id, name: "Models", readiness: { _tag: "Ready" } } }
      })
      expect(yield* client.connections.check({ params: { connectionId: added.id } })).toEqual({ status: "healthy" })

      yield* store.write("ConnectionRenamed", { connectionId: added.id, name: "Local", expectedName: "Models" })
      yield* firstWhere(store.list("Connection", Store.workspacePlace), ([held]) => held?.pending === true)
      yield* firstWhere(
        store.list("Connection", Store.workspacePlace),
        ([held]) => held?.pending === false && held.record.value.name === "Local"
      )
      yield* store.write("ConnectionRemoved", { connectionId: added.id })
      yield* firstWhere(
        store.list("Connection", Store.workspacePlace),
        ([held]) => held?.pending === false && held.record.value.status === "removed"
      )
    }).pipe(Effect.scoped, Effect.provide(browser))
  )
})

describe("Store, for the workspace's agents", () => {
  it.live(
    "an agent added here is the one the host makes, with its membership, role, and admission, under the same IDs",
    () =>
      Effect.gen(function* () {
        const services = yield* host
        const gateway = Context.get(services, Gateway.Gateway)
        const workspace = yield* gateway.createWorkspace(alice, {
          name: "Studio",
          memberName: Member.Name.make("Alice")
        })
        const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
        const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
        yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
        const client = yield* memberClient(apiUrl, alice, workspace.id)
        const models = yield* client.connections.create({
          headers: {},
          payload: { integration: "test-models", name: "Models", settings: {}, auth: "none" }
        })
        yield* firstWhere(store.list("Connection", Store.workspacePlace), (held) => held.length === 1)

        yield* store.write("AgentCreated", {
          name: "Scout",
          roleId: BuiltinRoles.MemberId,
          instructions: "Review what is asked.",
          harness: { _tag: "Auto" },
          model: { connectionId: models.id, id: "any-model" },
          sandbox: null
        })
        const [made] = yield* firstWhere(store.list("Agent", Store.workspacePlace), ([held]) => held?.pending === true)
        const { id: agentId, memberId } = made!.record.value
        const admitted = <A extends { readonly record: { readonly value: { readonly memberId: string } } }>(
          memberships: ReadonlyArray<A>
        ) => memberships.find(({ record }) => record.value.memberId === memberId)
        const shown = {
          member: (yield* firstWhere(store.list("Member", Store.workspacePlace), (held) => held.length === 2)).find(
            ({ record }) => record.value.id === memberId
          ),
          assignment: (yield* firstWhere(store.list("Assignment", Store.workspacePlace), (held) =>
            held.some(({ record }) => record.value.memberId === memberId)
          )).find(({ record }) => record.value.memberId === memberId),
          admission: admitted(yield* firstWhere(store.every("GroupMembership"), (held) => admitted(held) !== undefined))
        }
        expect(shown.member).toMatchObject({
          pending: true,
          record: { value: { name: "Scout", identity: { id: agentId } } }
        })

        // The server's own records arrive under the IDs the browser gave them.
        const [arrived] = yield* firstWhere(
          store.list("Agent", Store.workspacePlace),
          ([held]) => held?.pending === false
        )
        expect(arrived!.record.value).toMatchObject({ id: agentId, memberId, model: { id: "any-model" } })
        // On Auto with no connection giving harnesses, the server finds it can't run yet.
        expect(arrived!.record.value.readiness).toMatchObject({ _tag: "Incomplete", issues: [{ _tag: "NoHarness" }] })
        const settled = {
          member: (yield* firstWhere(store.list("Member", Store.workspacePlace), (held) =>
            held.some(({ record, pending }) => record.value.id === memberId && !pending)
          )).find(({ record }) => record.value.id === memberId),
          assignment: (yield* firstWhere(store.list("Assignment", Store.workspacePlace), (held) =>
            held.some(({ record, pending }) => record.value.memberId === memberId && !pending)
          )).find(({ record }) => record.value.memberId === memberId),
          admission: admitted(
            yield* firstWhere(store.every("GroupMembership"), (held) =>
              held.some(({ record, pending }) => record.value.memberId === memberId && !pending)
            )
          )
        }
        expect(settled.assignment!.record.value.id).toBe(shown.assignment!.record.value.id)
        expect(settled.admission!.record.value.id).toBe(shown.admission!.record.value.id)
        expect(settled.member!.record.value.id).toBe(memberId)
        expect(yield* firstWhere(store.actions, () => true)).toEqual([])
      }).pipe(Effect.scoped, Effect.provide(browser))
  )
})

describe("Store, for the workspace's channels", () => {
  it.live("a channel added here is the one the host makes, under the same ID, and moves at once", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      yield* firstWhere(store.list("Workspace", Store.workspacePlace), (held) => held.length === 1)
      const client = yield* memberClient(apiUrl, alice, workspace.id)
      const chat = yield* client.connections.create({
        headers: {},
        payload: { integration: "test-channels", name: "Chat", settings: {}, auth: "none" }
      })
      yield* firstWhere(store.list("Connection", Store.workspacePlace), (held) => held.length === 1)
      const crew = yield* client.groups.create({
        headers: {},
        payload: { name: "Crew", memberIds: [workspace.ownerMemberId] }
      })

      yield* store.write("ChannelCreated", {
        connectionId: chat.id,
        groupId: Group.GeneralId,
        name: "Support",
        opensTasks: true
      })
      const [shown] = yield* firstWhere(store.list("Channel", Store.workspacePlace), ([held]) => held?.pending === true)
      const [arrived] = yield* firstWhere(
        store.list("Channel", Store.workspacePlace),
        ([held]) => held?.pending === false
      )
      expect(arrived!.record.value).toMatchObject({
        id: shown!.record.value.id,
        groupId: Group.GeneralId,
        name: "Support"
      })

      yield* store.write("ChannelRedirected", { channelId: arrived!.record.value.id, groupId: crew.id })
      yield* firstWhere(
        store.list("Channel", Store.workspacePlace),
        ([held]) => held?.pending === true && held.record.value.groupId === crew.id
      )
      yield* firstWhere(
        store.list("Channel", Store.workspacePlace),
        ([held]) => held?.pending === false && held.record.value.groupId === crew.id
      )
      expect(yield* firstWhere(store.actions, () => true)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(browser))
  )
})

describe("Store, for the workspace's people", () => {
  it.live("the members and the contacts are listed as values, and together as people, as they change", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      yield* admit(gateway, workspace, Identity.HumanId.make("bob"))
      const apiUrl = HttpServer.formatAddress(yield* serve(services, yield* Effect.scope))
      const store = yield* openStore(apiUrl, workspace, yield* Effect.scope)

      // The members are the workspace's own, and no one has written from outside yet.
      const members = yield* firstWhere(store.members, (listed) => listed.length === 2)
      expect(members.map(({ name }) => name).toSorted()).toEqual(["Alice", "Bob"])
      expect(yield* firstWhere(store.contacts, () => true)).toEqual([])
      const people = yield* firstWhere(store.people, (listed) => listed.members.length === 2)
      expect(people.contacts).toEqual([])
      expect(people.members).toEqual(members)

      // A contact the channel heard from reaches the contacts, and the people with the members.
      const client = yield* memberClient(apiUrl, alice, workspace.id)
      const chat = yield* client.connections.create({
        headers: {},
        payload: { integration: "test-channels", name: "Chat", settings: {}, auth: "none" }
      })
      yield* store.write("ChannelCreated", {
        connectionId: chat.id,
        groupId: Group.GeneralId,
        name: "Support",
        opensTasks: false
      })
      const [channel] = yield* firstWhere(
        store.list("Channel", Store.workspacePlace),
        ([held]) => held?.pending === false
      )
      yield* Effect.scoped(
        gateway.inWorkspace(
          workspace.id,
          Effect.flatMap(ChannelIntake.ChannelIntake, (channelIntake) =>
            Effect.flatMap(DateTime.now, (receivedAt) =>
              channelIntake.intake(
                channel!.record.value.id,
                ChannelTransport.Event.cases.MessageReceived.make({
                  conversation: { id: "conversation-1", details: {} },
                  messageId: "message-1",
                  sender: { id: "customer-1", name: "Dana Customer" },
                  text: "I cannot log in.",
                  receivedAt
                })
              )
            )
          )
        )
      )
      const contacts = yield* firstWhere(store.contacts, (listed) => listed.length === 1)
      expect(contacts[0]).toMatchObject({ name: "Dana Customer", externalId: "customer-1" })
      expect(
        yield* firstWhere(store.people, (listed) => listed.contacts.length === 1 && listed.members.length === 2)
      ).toEqual({ members, contacts })

      // A member renamed here shows at once in the members and the people, then as the host has it.
      yield* store.write("MemberRenamed", { name: Member.NewName.make("Ali") })
      const renamed = (listed: ReadonlyArray<Member.Member>) => listed.some(({ name }) => name === "Ali")
      expect(renamed(yield* firstWhere(store.members, renamed))).toBe(true)
      expect(
        (yield* firstWhere(store.people, (listed) => renamed(listed.members))).contacts.map(({ name }) => name)
      ).toEqual(["Dana Customer"])
      expect(yield* firstWhere(store.actions, (held) => held.length === 0)).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(browser))
  )
})

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

describe("Store.deriveParticipationChanges", () => {
  const activity = (id: string, sequence: number, kind: string, details: Schema.Json) =>
    Schema.decodeSync(ThreadActivity.ThreadActivity)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      sequence,
      occurredAt: `2026-10-18T12:${String(sequence).padStart(2, "0")}:00Z`,
      kind,
      version: 1,
      subject: "thread-participation:participation-2",
      occurrence: null,
      newActivity: false,
      details
    })
  const participation = (id: string, participant: (typeof ThreadParticipation.Participant)["Encoded"]) =>
    Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      participant,
      joinedAt: "2026-10-18T12:00:00Z",
      joinedAtSequence: 1,
      status: "active",
      endedAt: null
    })
  const bobsParticipation = participation("participation-2", {
    _tag: "Member",
    memberId: "member-2",
    groupMembershipId: "membership-2",
    identity: { _tag: "Human", id: "bob" }
  })
  const followed = (id: string, sequence: number) =>
    activity(id, sequence, "participation.followed", { participationId: "participation-2" })
  const ended = (id: string, sequence: number, reason: string) =>
    activity(id, sequence, "participation.ended", { participationId: "participation-2", reason })
  const changesOf = (activities: ReadonlyArray<ThreadActivity.ThreadActivity>) =>
    Store.deriveParticipationChanges(activities, [
      bobsParticipation,
      participation("participation-contact", { _tag: "Contact", contactId: "contact-1" })
    ]).map(({ id, change, memberId }) => [id, change, memberId])

  it("notes a follow and each way a participation ended, in the order of the thread, for the member whose part it was", () => {
    expect(
      changesOf([
        ended("activity-5", 5, "workspace-removed"),
        followed("activity-1", 1),
        ended("activity-2", 2, "unfollowed"),
        ended("activity-3", 3, "group-left"),
        ended("activity-4", 4, "group-removed")
      ])
    ).toEqual([
      ["activity-1", "followed", "member-2"],
      ["activity-2", "unfollowed", "member-2"],
      ["activity-3", "left-group", "member-2"],
      ["activity-4", "removed-from-group", "member-2"],
      ["activity-5", "removed-from-workspace", "member-2"]
    ])
  })

  it("says when each was made", () => {
    expect(
      Store.deriveParticipationChanges([followed("activity-1", 7)], [bobsParticipation]).map(({ at }) => at)
    ).toEqual([DateTime.makeUnsafe("2026-10-18T12:07:00Z")])
  })

  it("notes nothing for other activity, a kind whose details do not read, or a participation that is not a member's", () => {
    expect(
      changesOf([
        activity("activity-1", 1, "message.posted", { messageId: "message-1" }),
        activity("activity-2", 2, "participation.ended", { participationId: "participation-2", reason: "unknown" }),
        activity("activity-3", 3, "participation.followed", { participationId: "participation-contact" }),
        activity("activity-4", 4, "participation.followed", { participationId: "participation-missing" })
      ])
    ).toEqual([])
  })
})

describe("Store.summarizeReplies", () => {
  const written = (id: string, author: typeof ThreadMessage.Author.Encoded, minute: number) =>
    Schema.decodeSync(ThreadMessage.ThreadMessage)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      author,
      via: null,
      publishedAt: `2026-10-18T12:0${minute}:00Z`,
      content: { _tag: "Text", text: id, mentions: [], revision: 1, editedAt: null }
    })
  const alice = { _tag: "Member", memberId: "member-1" } as const
  const bob = { _tag: "Member", memberId: "member-2" } as const
  const dana = { _tag: "Contact", contactId: "contact-1" } as const

  it("finds no replies in a thread that has none, or no messages yet", () => {
    expect(Store.summarizeReplies([])).toEqual({ replies: 0, repliers: [] })
    expect(Store.summarizeReplies([written("message-1", alice, 0)])).toEqual({ replies: 0, repliers: [] })
  })

  it("counts the messages after the opening, and names their authors once each, in the order of their first reply", () => {
    const messages = [
      written("message-1", alice, 0),
      written("message-2", bob, 1),
      written("message-3", dana, 2),
      written("message-4", bob, 3),
      written("message-5", alice, 4)
    ]

    const decode = Schema.decodeSync(ThreadMessage.Author)

    expect(Store.summarizeReplies(messages)).toEqual({
      replies: 4,
      repliers: [decode(bob), decode(dana), decode(alice)]
    })
  })
})

describe("Store.deriveLastActiveAt", () => {
  it("is when the thread was created while it has no messages", () => {
    expect(Store.deriveLastActiveAt(thread, [])).toEqual(thread.createdAt)
  })

  it("is when the latest message was published, which a thread with two is the later of", () => {
    expect(Store.deriveLastActiveAt(thread, [opening])).toEqual(opening.publishedAt)
    expect(Store.deriveLastActiveAt(thread, [opening, reply])).toEqual(reply.publishedAt)
    expect(reply.publishedAt).not.toEqual(opening.publishedAt)
  })
})

describe("Store.viewTasks", () => {
  const person = membership.member
  const heldThread = (value: typeof thread, pending = false) => ({
    record: ReplicaRecord.ReplicaRecord.cases.Thread.make({ value }),
    pending
  })
  /** A thread in design that tracks a task, with no messages. */
  const logoThread = { ...thread, id: ThreadId.ThreadId.make("thread-2"), groupId: design.id }
  const logoTask = { ...task, threadId: logoThread.id, groupId: design.id }
  const records: Store.TaskRecords = {
    memberId: person.id,
    tasks: [task, logoTask],
    threads: [heldThread(thread), heldThread(logoThread)],
    messages: [reply, opening],
    groups: [general, design],
    members: [person, bob]
  }

  it("pairs each task with its thread, the place of its group, its opening, and when it was last active", () => {
    expect(Store.viewTasks(records)).toEqual([
      {
        task,
        thread,
        place: "#General",
        opening: Option.some(opening),
        lastActiveAt: reply.publishedAt,
        pending: false
      },
      {
        task: logoTask,
        thread: logoThread,
        place: "#Design",
        opening: Option.none(),
        lastActiveAt: logoThread.createdAt,
        pending: false
      }
    ])
  })

  it("places a conversation by the other member", () => {
    const talk = { ...thread, groupId: conversationWithBob.id }

    expect(
      Store.viewTasks({
        ...records,
        tasks: [{ ...task, groupId: talk.groupId }],
        threads: [heldThread(talk)],
        groups: [conversationWithBob]
      }).map(({ place }) => place)
    ).toEqual(["Bob"])
  })

  it("says whether the thread of a task is still being started", () => {
    expect(
      Store.viewTasks({ ...records, threads: [heldThread(thread, true), heldThread(logoThread)] }).map(
        ({ pending }) => pending
      )
    ).toEqual([true, false])
  })

  it("leaves out a task whose thread or group the replica lacks", () => {
    const among = (changed: Partial<Store.TaskRecords>) =>
      Store.viewTasks({ ...records, ...changed }).map(({ thread }) => thread.id)

    expect(among({ groups: [general] })).toEqual([thread.id])
    expect(among({ threads: [heldThread(logoThread)] })).toEqual([logoThread.id])
    expect(among({ groups: [], threads: [] })).toEqual([])
  })
})

describe("Store.findMatches", () => {
  const person = membership.member
  const zoe = { ...bob, id: MemberId.MemberId.make("member-4"), name: "Zoë" }
  const searched: Store.Searched = {
    memberId: person.id,
    groups: [general, design, conversationWithBob],
    members: [person, bob, zoe],
    threads: [thread],
    messages: [reply, opening]
  }
  const groupNames = (query: string, among: Store.Searched = searched) =>
    Store.findMatches(query, among).groups.map(({ name }) => name)

  it("finds nothing for an empty query, or one of spaces", () => {
    for (const query of ["", "   "])
      expect(Store.findMatches(query, searched)).toEqual({ groups: [], threads: [], people: [] })
  })

  it("finds a group by the name the person reads, a conversation by the other member, in any case", () => {
    expect(groupNames("DES")).toEqual(["Design"])
    expect(groupNames("  e ")).toEqual(["General", "Design"])
    expect(groupNames("bo")).toEqual(["Bob"])
    expect(groupNames("alice")).toEqual([])
  })

  it("finds a thread by its title, or by the words of its opening message, and shows its title first", () => {
    const titled = { ...thread, title: "Weekly sync" as typeof thread.title }
    const among = { ...searched, threads: [titled] }

    expect(Store.findMatches("week", searched).threads).toEqual([
      { thread, groupName: "General", words: "Plans for the week" }
    ])
    expect(Store.findMatches("SYNC", among).threads).toEqual([
      { thread: titled, groupName: "General", words: "Weekly sync" }
    ])
    expect(Store.findMatches("plans", among).threads).toEqual([
      { thread: titled, groupName: "General", words: "Weekly sync" }
    ])
    expect(Store.findMatches("sounds good", searched).threads).toEqual([])
  })

  it("reads a mention in an opening as the member's current name", () => {
    const mentioning = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Bobby")}, look`)

    expect(Store.findMatches("@bob", { ...searched, messages: [mentioning] }).threads).toMatchObject([
      { words: "Hey @Bob, look" }
    ])
    expect(Store.findMatches("bobby", { ...searched, messages: [mentioning] }).threads).toEqual([])
  })

  it("reads an opening's words without the syntax of its markdown", () => {
    const formatted = saying(opening, "**Ship** the [retry fix](https://example.com) `now`")
    const among = { ...searched, messages: [formatted] }

    expect(Store.findMatches("ship the retry fix now", among).threads).toMatchObject([
      { words: "Ship the retry fix now" }
    ])
    expect(Store.findMatches("**", among).threads).toEqual([])
    expect(Store.findMatches("example.com", among).threads).toEqual([])
  })

  it("does not find a thread by a deleted opening, nor one whose group the replica lacks", () => {
    expect(Store.findMatches("deleted", { ...searched, messages: [deleted(opening)] }).threads).toEqual([])
    expect(Store.findMatches("week", { ...searched, groups: [design] }).threads).toEqual([])
  })

  it("finds the active members other than the person by name, whatever the case or accents", () => {
    const people = (query: string, among: Store.Searched = searched) =>
      Store.findMatches(query, among).people.map(({ name }) => name)

    expect(people("ZOE")).toEqual(["Zoë"])
    expect(people("zoë")).toEqual(["Zoë"])
    expect(people("o")).toEqual(["Bob", "Zoë"])
    expect(people("alice")).toEqual([])
    expect(people("bob", { ...searched, members: [person, { ...bob, status: "removed" }] })).toEqual([])
  })

  it("gives at most eight of each, in the order given", () => {
    const crowd = Array.from({ length: 10 }, (_, index) => ({
      ...bob,
      id: MemberId.MemberId.make(`member-${index + 10}`),
      name: `Sam ${index}`
    }))
    const teams = crowd.map((_, index) => ({
      ...design,
      id: GroupId.GroupId.make(`team-${index}`),
      name: `Sam's team ${index}`
    }))

    const found = Store.findMatches("sam", { ...searched, members: [person, ...crowd], groups: teams })

    expect(found.people.map(({ name }) => name)).toEqual(crowd.slice(0, 8).map(({ name }) => name))
    expect(found.groups.map(({ name }) => name)).toEqual(teams.slice(0, 8).map(({ name }) => name))
  })
})
