/**
 * How a browser reaches the sync server: Effect eventlog's remote over a WebSocket to the host,
 * which reconnects when the socket drops, as it does while a host stops. A browser builds its event
 * log over `SyncSchema` with this remote, and gives the WebSocket constructor of its platform.
 *
 * @since 0.1.0
 */

import * as EventLogRemote from "effect/eventlog/EventLogRemote"
import * as Layer from "effect/Layer"
import * as RpcClient from "effect/rpc/RpcClient"
import * as Socket from "effect/socket/Socket"
import * as Transport from "./internal/transport.ts"

/**
 * The sync server of the host serving the HTTP API at `apiUrl`, as an unencrypted eventlog remote:
 * the host stores what its members do, and serves each of them only their own replica. Building it
 * greets the server and learns its remote ID, failing when the server cannot be reached.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (apiUrl: string) =>
  EventLogRemote.layerUnencrypted.pipe(
    Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
    // http: becomes ws:, and https: wss:.
    Layer.provide(Socket.layerWebSocket(apiUrl.replace(/^http/, "ws").replace(/\/$/, "") + Transport.path)),
    Layer.provide(Transport.layerSerialization)
  )
