/**
 * What the server's and the browser's ends of the WebSocket agree on: where a host serves it, and
 * how RPC messages are encoded on it.
 */

import * as RpcSerialization from "effect/rpc/RpcSerialization"

/** The path a host serves the sync server's WebSocket at, beside its HTTP API. */
export const path = "/sync"

/** Effect's binary schema encoding, which carries eventlog's binary payloads as they are. */
export const layerSerialization = RpcSerialization.layerSchemaBinary()
