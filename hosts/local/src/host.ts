import { AnthropicConnection } from "@amends/connection-anthropic";
import { OpenAiCompatibleConnection } from "@amends/connection-openai-compatible";
import { AgentJob, JobPruning, TurnJob, TurnRunner } from "@amends/cluster";
import { Gateway, type WorkspaceDirectory } from "@amends/gateway";
import { AmendsHarness } from "@amends/harness-amends";
import { DaytonaConnection, DaytonaSandbox } from "@amends/sandbox-daytona";
import { LocalSandbox } from "@amends/sandbox-local";
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
} from "effect/cluster";
import type { SqlClient } from "effect/sql";

/** Gateway and directory owned by one host lifetime. */
export type HostLayer = Layer.Layer<Gateway.Service | WorkspaceDirectory.Service, unknown>;

export interface Options {
  /** The most connections to open to the database, twenty by default. */
  readonly poolSize?: number | undefined;
  /**
   * This process's address among the processes running jobs over the database,
   * `localhost:34431` by default. The host refuses to start while another process holds it.
   */
  readonly runnerAddress?: { readonly host: string; readonly port: number } | undefined;
  /**
   * How those processes reach each other: through the database alone, by default, or also over
   * sockets at their runner addresses, which delivers a request to another process at once rather
   * than at its next read. Cluster's socket messages are not authenticated, so the addresses must
   * be reachable only on a private network.
   */
  readonly runnerTransport?: "storage" | "socket" | undefined;
  /**
   * How long a process that stops answering keeps its workspaces before another takes them,
   * 35 seconds by default. Every process over one database uses the same.
   */
  readonly runnerTakeover?: Duration.Input | undefined;
  /** How often a runner reads for due job requests, every two seconds by default. */
  readonly pollInterval?: Duration.Input | undefined;
  /**
   * The key that seals connections' credentials at rest, 32 bytes as base64. Without one, the
   * host stores no credentials.
   */
  readonly credentialKey?: Redacted.Redacted<string> | undefined;
}

/**
 * What this host installs, as its catalogs declare them: model connections and a Daytona account;
 * amends's own harness; and sandboxes as local directories, for development, and on Daytona.
 */
export const installed = {
  connections: [
    AnthropicConnection.declaration,
    OpenAiCompatibleConnection.declaration,
    DaytonaConnection.declaration,
  ],
  harnesses: [AmendsHarness.declaration],
  sandboxes: [LocalSandbox.declaration, DaytonaSandbox.declaration],
};

/** The code that runs agents' turns: amends's harness in process, with either model connection. */
export const turnRunnerOptions: TurnRunner.Options = {
  harnesses: [AmendsHarness.make()],
  models: [AnthropicConnection.modelInference, OpenAiCompatibleConnection.modelInference],
};

/**
 * The database, and the cluster that runs jobs over the same pool: one SQL client, so a job a
 * commit requests is stored in that commit's transaction. The process first claims its
 * runner address, so it fails to start while another process runs at it. Cluster keeps its own
 * tables beside the adapter's and holds one of the pool's connections for its shard locks, and the
 * claim another.
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
    Layer.provideMerge(PostgresDatabase.layer({ url, maxConnections: options.poolSize ?? 20 })),
  );
};

/**
 * The gateway and the workspace directory over one PostgreSQL database, through the
 * storage adapter, with agents' jobs and turns' jobs running in this process, and handled job
 * requests pruned after seven days. The HTTP server resolves
 * bearer tokens before entering the gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>, options: Options = {}): HostLayer =>
  Layer.mergeAll(
    AgentJob.layerWorker,
    JobPruning.layer({
      prune: PostgresClusterStorage.prune,
      entityTypes: [AgentJob.entity.type, TurnJob.entity.type],
    }),
    TurnJob.layerWorker.pipe(Layer.provide(TurnRunner.layer(turnRunnerOptions))),
  ).pipe(
    Layer.provideMerge(
      Gateway.layer(installed).pipe(
        Layer.provideMerge(postgres({ credentialKey: options.credentialKey })),
        Layer.provide(AgentJob.layerRequests),
        Layer.provide(TurnJob.layerRequests),
      ),
    ),
    Layer.provide(BunCrypto.layer),
    Layer.provide(layerDatabase(url, options)),
  );

export * as LocalHost from "./host.ts";
