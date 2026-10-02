import { Draining, Routes } from "@amends/server-http";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import type { LocalHost } from "./host.ts";
import { DevelopmentAuthentication } from "./authentication/authentication.ts";

/**
 * Register the HTTP API, its OpenAPI document, and docs over the required host services.
 *
 * @category layers
 */
export const layerRoutes = Layer.mergeAll(
  Routes.layer,
  Routes.layerDocs,
  HttpRouter.cors({
    allowedOrigins: [
      "http://127.0.0.1:1420",
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
    ],
    allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "traceparent",
      "tracestate",
      "b3",
    ],
    credentials: false,
  }),
);

/** The largest request body the server reads, in bytes: one mebibyte. Bun answers 413 beyond it. */
export const maxRequestBodySize = 1024 * 1024;

/**
 * Serve the routes over a host on the loopback interface; the web development proxy targets this.
 *
 * @category layers
 */
export const layer = (host: LocalHost.HostLayer, port: number) =>
  // Built after the server, the drain is released first as the host stops, ending open change
  // streams so the server's graceful stop waits only for ordinary requests.
  Draining.layerOnRelease.pipe(
    Layer.provide(
      HttpRouter.serve(layerRoutes).pipe(
        Layer.provide(
          Layer.mergeAll(
            host,
            DevelopmentAuthentication.layer().pipe(Layer.provide(BunCrypto.layer)),
          ),
        ),
        Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port, maxRequestBodySize })),
      ),
    ),
    Layer.provide(Draining.layer),
  );

export * as LocalServer from "./server.ts";
