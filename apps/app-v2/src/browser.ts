/**
 * What the browser gives the app: its storage, cryptography, HTTP client, and WebSocket. The
 * runtime provides it to every command, and each store opens over it.
 */

import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Socket from "effect/socket/Socket"

/** The browser's services, over `window`. */
export const layer = Layer.mergeAll(
  BrowserKeyValueStore.layerLocalStorage,
  IndexedDb.layerWindow,
  EventLogEncryption.layerSubtle,
  FetchHttpClient.layer,
  Socket.layerWebSocketConstructorGlobal
)
