/**
 * The local host's HTTP server: the routes and OpenAPI documentation of `@amends-dev/http`, and the
 * sync server's WebSocket from `@amends-dev/sync`, served by Bun on the loopback interface over a
 * host layer and an authentication. As the server stops, open streams and sockets end first, so it
 * waits only for ordinary requests.
 *
 * @since 0.1.0
 */

import type { Accounts, SessionTokens, SignIn, SignInStorage } from "@amends-dev/gateway"
import { Draining, Routes } from "@amends-dev/http"
import { SyncServer } from "@amends-dev/sync"
import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import type * as Crypto from "effect/Crypto"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import type * as LocalHost from "./LocalHost.ts"

/**
 * The largest request body the server reads, in bytes: one mebibyte. Bun answers 413 beyond it.
 *
 * @category constants
 * @since 0.1.0
 */
export const maxRequestBodySize = 1024 * 1024

/**
 * How the host signs people in and resolves their bearer tokens, over the host's services:
 * `DevelopmentAuthentication.layer` or `EmailAuthentication.layer`.
 *
 * @category models
 * @since 0.1.0
 */
export type Authentication = Layer.Layer<
  SignIn.SignIn | SessionTokens.SessionTokens,
  never,
  Crypto.Crypto | Accounts.Accounts | SignInStorage.SignInStorage
>

/** The HTTP API, its OpenAPI document and docs, and the sync server's WebSocket. */
const layerRoutes = Layer.mergeAll(Routes.layer, Routes.layerDocs, SyncServer.layer)

/**
 * Serve the routes over a host and its authentication on the HTTP server provided beneath: Bun's,
 * on a port, for `layer`, and its test server in tests. `options` are `HttpRouter.serve`'s.
 *
 * @category layers
 * @since 0.1.0
 */
export const serve = <E>(
  host: LocalHost.HostLayer<E>,
  authentication: Authentication,
  options?: { readonly disableLogger?: boolean | undefined; readonly disableListenLog?: boolean }
) =>
  // Built after the server, the drain is released first as the host stops, ending open turn logs
  // and sync sockets so their clients reconnect at once. Bun counts a socket the server closed as
  // open, so the graceful stop of a server that had one waits its full limit.
  Draining.layerOnRelease.pipe(
    Layer.provide(
      HttpRouter.serve(layerRoutes, options).pipe(
        Layer.provide(authentication.pipe(Layer.provideMerge(host), Layer.provideMerge(BunCrypto.layer)))
      )
    ),
    Layer.provide(Draining.layer)
  )

/**
 * Serve the routes over a host and its authentication on the loopback interface at `port`; the web
 * development proxy targets this.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = <E>(host: LocalHost.HostLayer<E>, authentication: Authentication, port: number) =>
  serve(host, authentication).pipe(
    Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port, maxRequestBodySize }))
  )
