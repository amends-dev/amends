import { Gateway, type WorkspaceDirectory } from "@amends/gateway";
import { PostgresDatabase, contracts as postgres } from "@amends/storage-postgresql";
import { SqliteDatabase, contracts as sqlite } from "@amends/storage-sqlite";
import { BunCrypto } from "@effect/platform-bun";
import { Layer, type Redacted } from "effect";

/** What a host supplies to the server: the gateway and the directory, however they are stored. */
export type Host = Layer.Layer<Gateway.Service | WorkspaceDirectory.Service, unknown>;

/**
 * The gateway and the workspace directory over one SQLite file, through the
 * storage adapter. Callers supply identities established by a trusted ingress:
 * the CLI treats its arguments as local operator assertions, and the HTTP
 * server resolves bearer tokens before calling it.
 */
export const layer = (filename: string): Host =>
  Gateway.layer.pipe(
    Layer.provideMerge(sqlite),
    Layer.provide(Layer.mergeAll(SqliteDatabase.layer(filename), BunCrypto.layer)),
  );

/** The same gateway and directory over a PostgreSQL database, through its adapter. */
export const postgresLayer = (url: Redacted.Redacted<string>): Host =>
  Gateway.layer.pipe(
    Layer.provideMerge(postgres()),
    Layer.provide(Layer.mergeAll(PostgresDatabase.layer({ url }), BunCrypto.layer)),
  );

export * as LocalHost from "./host.ts";
