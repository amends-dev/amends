import { Gateway, WorkspaceEvents, type WorkspaceDirectory } from "@amends/gateway";
import { PostgresDatabase, layer as postgres } from "@amends/storage-postgresql";
import { BunCrypto } from "@effect/platform-bun";
import { Layer, type Redacted } from "effect";

/** Gateway, directory, and shared event registry owned by one host lifetime. */
export type HostLayer = Layer.Layer<
  Gateway.Service | WorkspaceDirectory.Service | WorkspaceEvents.Service,
  unknown
>;

/**
 * The gateway and the workspace directory over one PostgreSQL database, through the
 * storage adapter. The HTTP server resolves bearer tokens before entering the gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>): HostLayer =>
  Gateway.layer().pipe(
    Layer.provideMerge(WorkspaceEvents.layer()),
    Layer.provideMerge(postgres()),
    Layer.provide(Layer.mergeAll(PostgresDatabase.layer({ url }), BunCrypto.layer)),
  );

export * as LocalHost from "./host.ts";
