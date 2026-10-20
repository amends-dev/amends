/**
 * What the browser gives the app: its storage, cryptography, clipboard, HTTP client, and WebSocket. The
 * runtime provides it to every command, and each store opens over it.
 */

import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto"
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as Clipboard from "@effect/platform-browser/Clipboard"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Socket from "effect/socket/Socket"

/** The browser's services, over `window`. */
export const layer = Layer.mergeAll(
  BrowserCrypto.layer,
  BrowserKeyValueStore.layerLocalStorage,
  Clipboard.layer,
  IndexedDb.layerWindow,
  EventLogEncryption.layerSubtle,
  FetchHttpClient.layer,
  Socket.layerWebSocketConstructorGlobal
)
