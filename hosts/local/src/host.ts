import { Gateway, WorkspaceEvents, type WorkspaceDirectory } from "@amends/gateway";
import { PostgresDatabase, layer as postgres } from "@amends/storage-postgresql";
import { SqliteDatabase, layer as sqlite } from "@amends/storage-sqlite";
import { BunCrypto } from "@effect/platform-bun";
import { Layer, type Redacted } from "effect";

/** Gateway, directory, and shared event registry owned by one host lifetime. */
export type HostLayer = Layer.Layer<
  Gateway.Service | WorkspaceDirectory.Service | WorkspaceEvents.Service,
  unknown
>;

/**
 * The gateway and the workspace directory over one SQLite file, through the
 * storage adapter. The HTTP server resolves bearer tokens before entering the gateway.
 *
 * @category layers
 */
export const layerSqlite = (filename: string): HostLayer =>
  Gateway.layer.pipe(
    Layer.provideMerge(WorkspaceEvents.layer()),
    Layer.provideMerge(sqlite),
    Layer.provide(Layer.mergeAll(SqliteDatabase.layer(filename), BunCrypto.layer)),
  );

/**
 * Provide the gateway and directory over a PostgreSQL database through its adapter.
 *
 * @category layers
 */
export const layerPostgres = (url: Redacted.Redacted<string>): HostLayer =>
  Gateway.layer.pipe(
    Layer.provideMerge(WorkspaceEvents.layer()),
    Layer.provideMerge(postgres()),
    Layer.provide(Layer.mergeAll(PostgresDatabase.layer({ url }), BunCrypto.layer)),
  );

export * as LocalHost from "./host.ts";
