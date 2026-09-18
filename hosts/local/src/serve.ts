import { Routes } from "@amends/server-http";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import type { LocalHost } from "./host.ts";
import { LocalSignIn } from "./sign-in.ts";

/**
 * Register the HTTP API, its OpenAPI document, and docs over the required host services.
 *
 * @category layers
 */
export const layerRoutes = Layer.mergeAll(Routes.layer, Routes.layerDocs);

/**
 * Serve the routes over a host on the loopback interface; the web development proxy targets this.
 *
 * @category layers
 */
export const layer = (host: LocalHost.Host, port: number) =>
  HttpRouter.serve(layerRoutes).pipe(
    Layer.provide(Layer.mergeAll(host, LocalSignIn.layer().pipe(Layer.provide(BunCrypto.layer)))),
    Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
  );

export * as LocalServer from "./serve.ts";
