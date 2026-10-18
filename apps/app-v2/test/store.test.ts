// @vitest-environment node
// Bun's own fetch and WebSocket reach the in-process server; fake-indexeddb is the browser's storage.
import { DeliveryJobs } from "@amends-dev/core/channel"
import { Identity } from "@amends-dev/core/identity"
import { MemoryDatabase } from "@amends-dev/core/journal"
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
import type * as Replica from "../src/sync/Replica.ts"
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

/** Serve the host's routes and sync server on a port of its own for as long as `scope` lasts. */
const serve = (services: Effect.Success<typeof host>, scope: Scope.Scope) =>
  Layer.buildWithScope(
    HttpRouter.serve(Layer.mergeAll(Routes.layer, SyncServer.layer), {
      disableLogger: true,
      disableListenLog: true
    }).pipe(
      Layer.provide([sessionTokens, signIn, Draining.layer, Layer.succeedContext(services)]),
      // Bun's graceful stop waits its whole limit for a WebSocket open as it begins, even once closed.
      Layer.provideMerge(
        Layer.orDie(BunHttpServer.layer({ hostname: "127.0.0.1", port: 0, gracefulShutdownTimeout: "100 millis" }))
      )
    ),
    scope
  ).pipe(Effect.map((served) => HttpServer.formatAddress(Context.get(served, HttpServer.HttpServer).address)))

/** What a browser provides a store: its storage, cryptography, HTTP client, and WebSocket. */
const browser = Layer.mergeAll(
  Layer.succeed(
    IndexedDb.IndexedDb,
    IndexedDb.make({ indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange })
  ),
  KeyValueStore.layerMemory,
  EventLogEncryption.layerSubtle,
  FetchHttpClient.layer,
  Socket.layerWebSocketConstructorGlobal
)

/** Open alice's store of `workspace` on the host at `apiUrl` for as long as `scope` lasts. */
const openStore = (apiUrl: string, workspace: Workspace.Workspace, scope: Scope.Scope) =>
  Layer.buildWithScope(Store.layer({ apiUrl, token: alice, humanId: alice, workspaceId: workspace.id }), scope).pipe(
    Effect.map(Context.get(Store.Store))
  )

/** The first counts `store` reports that `holds` accepts. */
const countsWhere = (store: Store.Store["Service"], holds: (counts: Replica.Counts) => boolean) =>
  store.counts.pipe(Stream.filter(holds), Stream.runHead, Effect.map(Option.getOrThrow), Effect.timeout("5 seconds"))

describe("Store", () => {
  it.live("a store keeps its replica in sync with the host, and reads it again offline", () =>
    Effect.gen(function* () {
      const services = yield* host
      const gateway = Context.get(services, Gateway.Gateway)
      const workspace = yield* gateway.createWorkspace(alice, { name: "Studio", memberName: Member.Name.make("Alice") })
      const serving = yield* Scope.make()
      const apiUrl = yield* serve(services, serving)

      const opened = yield* Scope.make()
      const store = yield* openStore(apiUrl, workspace, opened)
      // The server resets the new replica with everything alice may see.
      const reset = yield* countsWhere(store, (counts) => counts.Workspace === 1)
      expect(reset.Member).toBe(1)
      // A group made elsewhere reaches it as its commit lands.
      const groups = yield* HttpApiClient.make(Api.Api, { baseUrl: apiUrl }).pipe(
        Effect.provide([
          HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
            next(HttpClientRequest.bearerToken(request, alice))
          ),
          WorkspaceMember.layerClient(workspace.id),
          FetchHttpClient.layer
        ])
      )
      yield* groups.groups.create({ headers: {}, payload: { name: "Crew", memberIds: [workspace.ownerMemberId] } })
      const grown = yield* countsWhere(store, (counts) => (counts.Group ?? 0) > (reset.Group ?? 0))
      yield* Scope.close(opened, Exit.void)

      // With the host gone, the store opens and reads what it held.
      yield* Scope.close(serving, Exit.void)
      const reopened = yield* openStore(apiUrl, workspace, yield* Effect.scope)
      expect(yield* countsWhere(reopened, () => true)).toEqual(grown)
    }).pipe(Effect.scoped, Effect.provide(browser))
  )
})
