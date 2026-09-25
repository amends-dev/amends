import { ClusterBackground, Gateway, type WorkspaceDirectory } from "@amends/gateway";
import {
  PostgresClusterStorage,
  PostgresDatabase,
  layer as postgres,
} from "@amends/storage-postgresql";
import { BunClusterSocket, BunCrypto } from "@effect/platform-bun";
import { Duration, Layer, Option, type Redacted } from "effect";
import {
  type MessageStorage,
  RunnerAddress,
  type Runners,
  type Sharding,
  SingleRunner,
} from "effect/unstable/cluster";
import type { SqlClient } from "effect/unstable/sql";

/** Gateway and directory owned by one host lifetime. */
export type HostLayer = Layer.Layer<Gateway.Service | WorkspaceDirectory.Service, unknown>;

export interface Options {
  /** The most connections to open to the database, ten by default. */
  readonly poolSize?: number | undefined;
  /**
   * This process's address among the processes running background work over the database,
   * `localhost:34431` by default. The host refuses to start while another process holds it.
   */
  readonly runnerAddress?: { readonly host: string; readonly port: number } | undefined;
  /**
   * How those processes reach each other: through the database alone, by default, or also over
   * sockets at their runner addresses, which delivers a wake to another process at once rather
   * than at its next read. Cluster's socket messages are not authenticated, so the addresses must
   * be reachable only on a private network.
   */
  readonly runnerTransport?: "storage" | "socket" | undefined;
  /**
   * How long a process that stops answering keeps its workspaces before another takes them,
   * 35 seconds by default. Every process over one database uses the same.
   */
  readonly runnerTakeover?: Duration.Input | undefined;
  /** How often a runner reads for due wakes, every two seconds by default. */
  readonly pollInterval?: Duration.Input | undefined;
}

/**
 * The database, and the cluster that runs background work over the same pool: one SQL client, so
 * a wake a commit asks for is stored in that commit's transaction. The process first claims its
 * runner address, so it fails to start while another process runs at it. Cluster keeps its own
 * tables beside the adapter's and holds two of the pool's connections, and the claim a third.
 *
 * @category layers
 */
export const layerDatabase = (url: Redacted.Redacted<string>, options: Options = {}) => {
  const host = options.runnerAddress?.host ?? "localhost";
  const port = options.runnerAddress?.port ?? 34431;
  const shardingConfig = {
    runnerAddress: Option.some(RunnerAddress.make(host, port)),
    entityMessagePollInterval: Duration.fromInputUnsafe(options.pollInterval ?? "2 seconds"),
    shardLockExpiration: Duration.fromInputUnsafe(options.runnerTakeover ?? "35 seconds"),
  };
  const cluster: Layer.Layer<
    Sharding.Sharding | Runners.Runners | MessageStorage.MessageStorage,
    unknown,
    SqlClient.SqlClient
  > =
    options.runnerTransport === "socket"
      ? BunClusterSocket.layer({ storage: "sql", shardingConfig })
      : SingleRunner.layer({ shardingConfig }).pipe(Layer.provide(BunCrypto.layer));
  return cluster.pipe(
    Layer.provide(Layer.effectDiscard(PostgresClusterStorage.claimAddress(`${host}:${port}`))),
    Layer.provideMerge(PostgresDatabase.layer({ url, maxConnections: options.poolSize ?? 10 })),
  );
};

/**
 * The gateway and the workspace directory over one PostgreSQL database, through the
 * storage adapter, with the workspaces' background work running in this process and handled
 * wakes pruned after seven days. The HTTP server resolves bearer tokens before entering the
 * gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>, options: Options = {}): HostLayer =>
  Layer.merge(
    ClusterBackground.layerWorker,
    ClusterBackground.layerPruning({ prune: PostgresClusterStorage.prune }),
  ).pipe(
    Layer.provideMerge(
      Gateway.layer().pipe(
        Layer.provideMerge(postgres()),
        Layer.provide(ClusterBackground.layerWakes),
      ),
    ),
    Layer.provide(BunCrypto.layer),
    Layer.provide(layerDatabase(url, options)),
  );

export * as LocalHost from "./host.ts";
