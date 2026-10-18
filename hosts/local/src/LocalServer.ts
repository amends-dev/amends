/**
 * The local host's HTTP server: the routes and OpenAPI documentation of `@amends-dev/http`, served
 * by Bun on the loopback interface over a host layer and an authentication. As the server stops,
 * open streams end first, so it waits only for ordinary requests.
 *
 * @since 0.1.0
 */

import type { Accounts, SessionTokens, SignIn, SignInStorage } from "@amends-dev/gateway"
import { Draining, Routes } from "@amends-dev/http"
import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import type * as Crypto from "effect/Crypto"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import type * as LocalHost from "./LocalHost.ts"

/**
 * Register the HTTP API, its OpenAPI document, and docs over the required host services. Tests
 * serve it without the Bun server.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerRoutes = Layer.mergeAll(Routes.layer, Routes.layerDocs)

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

/**
 * Serve the routes over a host and its authentication on the loopback interface at `port`; the web
 * development proxy targets this.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = <E>(host: LocalHost.HostLayer<E>, authentication: Authentication, port: number) =>
  // Built after the server, the drain is released first as the host stops, ending open change
  // streams so the server's graceful stop waits only for ordinary requests.
  Draining.layerOnRelease.pipe(
    Layer.provide(
      HttpRouter.serve(layerRoutes).pipe(
        Layer.provide(authentication.pipe(Layer.provide(BunCrypto.layer), Layer.provideMerge(host))),
        Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port, maxRequestBodySize }))
      )
    ),
    Layer.provide(Draining.layer)
  )
