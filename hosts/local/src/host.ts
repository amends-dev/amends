import { Gateway } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import { Layer } from "effect";
import { Database } from "./database.ts";
import { LocalDirectory } from "./directory.ts";
import { Storage } from "./storage.ts";

/**
 * The gateway and the workspace directory over one SQLite database. Callers
 * supply identities established by a trusted ingress: the CLI treats its
 * arguments as local operator assertions, and the HTTP server resolves bearer
 * tokens before calling it.
 */
export const layer = (filename: string) =>
  Layer.mergeAll(Gateway.layer.pipe(Layer.provide(Storage.layer)), LocalDirectory.layer).pipe(
    Layer.provide(Layer.mergeAll(Database.layer(filename), BunCrypto.layer)),
  );

export * as LocalHost from "./host.ts";
