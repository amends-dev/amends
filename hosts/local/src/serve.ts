import { Routes } from "@amends/server-http";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { LocalHost } from "./host.ts";
import { LocalSignIn } from "./sign-in.ts";

/** The HTTP API, its OpenAPI document, and docs over the local gateway. */
export const routes = Layer.mergeAll(Routes.api, Routes.docs);

/** Serve the routes on the loopback interface; the web development proxy targets this. */
export const layer = (filename: string, port: number) =>
  HttpRouter.serve(routes).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(filename),
        LocalSignIn.layer().pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port })),
  );

export * as LocalServer from "./serve.ts";
