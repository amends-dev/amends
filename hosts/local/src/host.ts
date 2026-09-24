import { ClusterBackground, Gateway, type WorkspaceDirectory } from "@amends/gateway";
import {
  PostgresClusterStorage,
  PostgresDatabase,
  layer as postgres,
} from "@amends/storage-postgresql";
import { BunCrypto } from "@effect/platform-bun";
import { Duration, Layer, Option, type Redacted } from "effect";
import { RunnerAddress, SingleRunner } from "effect/unstable/cluster";

/** Gateway and directory owned by one host lifetime. */
export type HostLayer = Layer.Layer<Gateway.Service | WorkspaceDirectory.Service, unknown>;

export interface Options {
  /** The most connections to open to the database, ten by default. */
  readonly poolSize?: number | undefined;
  /**
   * This process's address among the processes running background work over the database,
   * `localhost:34431` by default. Two processes must never run at one address at the same time.
   */
  readonly runnerAddress?: { readonly host: string; readonly port: number } | undefined;
}

/**
 * The database, and the cluster that runs background work over the same pool: one SQL client, so
 * a wake a commit asks for is stored in that commit's transaction. Cluster keeps its own tables
 * beside the adapter's, reads for due wakes every two seconds, and holds two of the pool's
 * connections.
 *
 * @category layers
 */
export const layerDatabase = (url: Redacted.Redacted<string>, options: Options = {}) =>
  SingleRunner.layer({
    shardingConfig: {
      runnerAddress: Option.some(
        RunnerAddress.make(
          options.runnerAddress?.host ?? "localhost",
          options.runnerAddress?.port ?? 34431,
        ),
      ),
      entityMessagePollInterval: Duration.seconds(2),
    },
  }).pipe(
    Layer.provide(BunCrypto.layer),
    Layer.provideMerge(PostgresDatabase.layer({ url, maxConnections: options.poolSize ?? 10 })),
  );

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
