/**
 * The sync protocol's server: Effect eventlog's RPC handlers for every member's store, over the
 * gateway. A store is one person's in one workspace: its ID is the workspace's, and the eventlog
 * identity that opens it is a key the person registered, which the gateway's `SyncStorage` keeps
 * with the remote ID browsers know the server by. The actions they write run
 * as their requests, each once, keyed by its entry's ID, in the order they wrote them; a store or
 * host that cannot be reached fails the write, which their browser sends again. What they read is
 * their replica as it changes, from core's `ReplicaService`, a `ReplicaChanged` for each commit at
 * its position. A host serves `layer` on its HTTP router, a WebSocket that browsers reach through
 * `SyncClient`, and `layerHandlers` is the RPC handlers alone, for tests. Browsers import the
 * contract's modules and `SyncClient`, never this one.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaService } from "@amends-dev/core/replica"
import { Request, RequestService } from "@amends-dev/core/request"
import { WorkspaceId } from "@amends-dev/core/workspace"
import { Gateway, SyncStorage } from "@amends-dev/gateway"
import { Draining } from "@amends-dev/http"
import * as Entry from "@amends-dev/log/Entry"
import * as Array from "effect/Array"
import type * as Crypto from "effect/Crypto"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLogMessage from "effect/eventlog/EventLogMessage"
import * as EventLogServer from "effect/eventlog/EventLogServer"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as RpcServer from "effect/rpc/RpcServer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Entries from "./internal/entries.ts"
import * as Operations from "./internal/operations.ts"
import * as Transport from "./internal/transport.ts"

const decodeWorkspaceId = Schema.decodeEffect(WorkspaceId.WorkspaceId)
const isDenied = Schema.is(CoreError.Denied)

/**
 * The eventlog RPC handlers over the gateway and the host's sync storage, with eventlog's
 * authentication: a browser proves it holds the signing key its key was first bound to before it
 * writes or reads a store. The remote ID is read once, as the handlers are built.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerHandlers = Layer.unwrap(
  Effect.gen(function* () {
    const gateway = yield* Gateway.Gateway
    const syncStorage = yield* SyncStorage.SyncStorage
    const remoteId = yield* syncStorage.remoteId
    const services = yield* Effect.context<Crypto.Crypto>()

    const protocolError = (
      requestTag: string,
      code: EventLogMessage.EventLogProtocolError["code"],
      message: string,
      publicKey: string
    ) => new EventLogMessage.EventLogProtocolError({ requestTag, code, message, publicKey })

    /** The person who opens `storeId` with `publicKey`, and the workspace it is the store of. */
    const openStore = Effect.fnUntraced(function* (requestTag: string, publicKey: string, storeId: string) {
      const person = yield* syncStorage.personOf(publicKey)
      if (Option.isNone(person))
        return yield* protocolError(requestTag, "Forbidden", "No person registered this identity", publicKey)
      const workspaceId = yield* decodeWorkspaceId(storeId).pipe(
        Effect.mapError(() => protocolError(requestTag, "NotFound", "No workspace has this store", publicKey))
      )
      return { workspaceId, identity: Identity.MemberReference.cases.Human.make({ id: person.value }) }
    })

    /** What storage or membership failed with, as the protocol says it. */
    const failedAs = (requestTag: string, publicKey: string) => (error: CoreError.CoreError) =>
      isDenied(error)
        ? protocolError(requestTag, "Forbidden", error.message, publicKey)
        : protocolError(requestTag, "InternalServerError", error.message, publicKey)

    return EventLogServer.layerRpcHandlers({
      remoteId,
      authorizeIdentity: (publicKey) =>
        Effect.flatMap(syncStorage.personOf(publicKey), (person) =>
          Option.isSome(person)
            ? Effect.void
            : Effect.fail(protocolError("Authenticate", "Forbidden", "No person registered this identity", publicKey))
        ),
      // A key removed since it was authorized has no binding, which fails authentication.
      getOrCreateSessionAuthBinding: (publicKey, signingPublicKey) =>
        Effect.flatMap(
          syncStorage.bindSigningKey(publicKey, signingPublicKey),
          Option.match({
            onNone: () => Effect.die("The key was removed while it authenticated."),
            onSome: Effect.succeed
          })
        ),
      onWrite: Effect.fnUntraced(function* (data, authenticatedPublicKeys) {
        const request = yield* EventLogMessage.WriteEntriesUnencrypted.decode(data).pipe(
          Effect.mapError(
            () =>
              new EventLogMessage.EventLogProtocolError({
                requestTag: "WriteEntries",
                code: "InvalidRequest",
                message: "The write does not decode"
              })
          )
        )
        if (!authenticatedPublicKeys.has(request.publicKey))
          return yield* protocolError("WriteEntries", "Forbidden", "Identity is not authenticated", request.publicKey)
        const { workspaceId, identity } = yield* openStore("WriteEntries", request.publicKey, request.storeId)
        // Each action once, as a request keyed by its entry, in the order its browser wrote them.
        const runActions = Effect.forEach(
          Array.sort(request.entries, EventJournal.Entry.Order),
          (entry) =>
            Effect.flatMap(RequestService.RequestService, (requestService) =>
              requestService.runOnce(Request.Key.make(entry.idString), Operations.operationOf(entry))
            ),
          { discard: true }
        )
        yield* gateway
          .asMember(workspaceId, identity, runActions)
          .pipe(Effect.scoped, Effect.mapError(failedAs("WriteEntries", request.publicKey)))
      }),
      changes: ({ publicKey, storeId, startSequence }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { workspaceId, identity } = yield* openStore("Changes", publicKey, storeId)
            const store = { remoteId, publicKey, storeId }
            // A browser asks for the sequence after the last one it holds, its commit's position.
            const after =
              startSequence === 0 ? Option.none<Entry.Position>() : Option.some(Entry.Position.make(startSequence - 1))
            const batches = yield* gateway
              .asMember(
                workspaceId,
                identity,
                Effect.flatMap(ReplicaService.ReplicaService, (replicaService) => replicaService.changes(after))
              )
              .pipe(Effect.mapError(failedAs("Changes", publicKey)))
            return batches.pipe(
              Stream.mapEffect((batch) =>
                Entries.remoteEntryOf(store, batch).pipe(
                  Effect.flatMap((remoteEntry) => EventLogMessage.ChangesRpc.encodeUnencrypted([remoteEntry])),
                  Effect.provide(services)
                )
              )
            )
          })
        )
    })
  })
)

/**
 * The WebSocket a host serves at `/sync` on its HTTP router. Each socket closes as the HTTP server
 * begins to drain, and none opens after, so each browser reconnects to the host that serves it
 * next rather than wait for this one to stop.
 */
const layerWebsocket = Layer.effect(
  RpcServer.Protocol,
  Effect.gen(function* () {
    const { protocol, httpEffect } = yield* RpcServer.makeProtocolWithHttpEffectWebsocket
    const router = yield* HttpRouter.HttpRouter
    const draining = yield* Draining.Draining
    const serveSocket = Effect.raceFirst(httpEffect, Effect.as(Deferred.await(draining), HttpServerResponse.empty()))
    // A browser reconnects at once, while the server is still taking requests before it stops.
    const refuse = Effect.succeed(HttpServerResponse.empty({ status: 503 }))
    yield* router.add(
      "GET",
      Transport.path,
      Effect.flatMap(Deferred.isDone(draining), (drained) => (drained ? refuse : serveSocket))
    )
    return protocol
  })
)

/**
 * The sync server on the host's HTTP router: `layerHandlers` served over a WebSocket at `/sync`,
 * which closes as `Draining` completes. A host provides the gateway, its `SyncStorage`,
 * cryptography, and `Draining`, beside the HTTP API's routes.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = RpcServer.layer(EventLogMessage.EventLogRemoteRpcs).pipe(
  Layer.provide(layerHandlers),
  Layer.provide(layerWebsocket),
  Layer.provide(Transport.layerSerialization)
)
