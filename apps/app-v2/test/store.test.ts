// @vitest-environment node
// Bun's own fetch and WebSocket reach the in-process server; fake-indexeddb is the browser's storage.
import { DeliveryJobs } from "@amends-dev/core/channel"
import { CoreError } from "@amends-dev/core/error"
import { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { TurnJobs } from "@amends-dev/core/turn"
import { Member, type Workspace } from "@amends-dev/core/workspace"
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
import { Context, Effect, Exit, Layer, Option, Redacted, Scope, Stream } from "effect"
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
})

/** The port a server listens at, when it listens on one. */
const port = (address: HttpServer.HttpServer["Service"]["address"]) =>
  "port" in address ? Option.some(address.port) : Option.none()
