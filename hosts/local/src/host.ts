import { Gateway, type WorkspaceDirectory, WorkspaceWakes } from "@amends/gateway";
import { PostgresDatabase, layer as postgres } from "@amends/storage-postgresql";
import { BunCrypto } from "@effect/platform-bun";
import { Layer, type Redacted } from "effect";

/** Gateway and directory owned by one host lifetime. */
export type HostLayer = Layer.Layer<Gateway.Service | WorkspaceDirectory.Service, unknown>;

export interface Options {
  /** The most connections to open to the database, ten by default. */
  readonly poolSize?: number | undefined;
}

/**
 * The gateway and the workspace directory over one PostgreSQL database, through the
 * storage adapter. The HTTP server resolves bearer tokens before entering the gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>, options: Options = {}): HostLayer =>
  Gateway.layer().pipe(
    Layer.provideMerge(postgres()),
    Layer.provide(
      Layer.mergeAll(
        PostgresDatabase.layer({ url, maxConnections: options.poolSize ?? 10 }),
        BunCrypto.layer,
        // No background process is registered yet, so nothing asks for a wake.
        WorkspaceWakes.layerUnavailable,
      ),
    ),
  );

export * as LocalHost from "./host.ts";
