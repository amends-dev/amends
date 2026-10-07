import { createHmac, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnthropicConnection } from "@amends/connection-anthropic";
import { ModelCatalog, ModelIntegrations, ToolIntegrations } from "@amends/connection-v2";
import { OpenAiCompatibleConnection } from "@amends/connection-openai-compatible";
import { JobPruning } from "@amends/cluster";
import { TurnJobs } from "@amends/core/turn";
import { Gateway, type WorkspaceDirectory } from "@amends/gateway";
import { OpenCodeHarness } from "@amends/harness-acp";
import { AmendsHarness } from "@amends/harness-amends";
import { AmendsAgent, Models } from "@amends/harness-amends-v2";
import { OpencodeAgent } from "@amends/harness-opencode";
import { DaytonaConnection, DaytonaSandbox } from "@amends/sandbox-daytona";
import { DaytonaSandboxProvider } from "@amends/sandbox-daytona-v2";
import { LocalSandbox } from "@amends/sandbox-local";
import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Network } from "@amends/sandbox-v2";
import {
  PostgresClusterStorage,
  PostgresDatabase,
  layer as postgres,
} from "@amends/storage-postgresql";
import { BunClusterSocket, BunCrypto, BunServices, BunSocket } from "@effect/platform-bun";
import { Duration, Effect, Layer, Option, Redacted } from "effect";
import {
  type MessageStorage,
  RunnerAddress,
  type Runners,
  type Sharding,
  SingleRunner,
} from "effect/cluster";
import { FetchHttpClient } from "effect/http";
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
  /**
   * The directory this machine's sandboxes live in, those of each connection to it in
   * `connections`; `amends-sandboxes` in the system's temporary directory by default.
   */
  readonly sandboxDirectory?: string | undefined;
}

/**
 * What this host installs, as its catalogs declare them: model connections and a Daytona account;
 * amends's harness, in process or in a sandbox, and opencode, in a sandbox; and sandboxes as local
 * directories, for development, and on Daytona.
 */
export const installed = {
  connections: [
    AnthropicConnection.declaration,
    OpenAiCompatibleConnection.declaration,
    DaytonaConnection.declaration,
  ],
  harnesses: [AmendsHarness.harness.declaration, OpenCodeHarness.declaration],
  sandboxes: [LocalSandbox.declaration, DaytonaSandbox.declaration],
};

/**
 * The integrations this host installs, which workspaces connect to: each model provider in the
 * catalog and any OpenAI-compatible API, for models; MCP servers and HTTP APIs, for tools;
 * sandboxes as directories under `directory`, for development, and on Daytona; and amends's agent
 * and opencode, as harnesses.
 *
 * @category constructors
 */
export const makeIntegrations = Effect.fn("LocalHost.makeIntegrations")(
  function* (directory: string) {
    // TODO: Derive bridge tokens from a secret every host shares, and give the bridges in this
    // machine's sandboxes ports of their own, once turns start opencode sessions: these tokens are
    // this process's own, and local sandboxes share this machine's ports.
    const bridgeSecret = randomBytes(32);
    return [
      ...(yield* ModelIntegrations.catalogProviders),
      yield* ModelIntegrations.openAiCompatible,
      yield* ToolIntegrations.mcp,
      yield* ToolIntegrations.openApi,
      yield* LocalSandboxProvider.integration({ directory }),
      yield* DaytonaSandboxProvider.integration,
      yield* AmendsAgent.integration(),
      yield* OpencodeAgent.integration({
        port: Network.Port.make(4096),
        token: (sandboxId) =>
          Redacted.make(createHmac("sha256", bridgeSecret).update(sandboxId).digest("base64url")),
      }),
    ];
  },
  Effect.provide(
    Layer.mergeAll(
      BunServices.layer,
      BunSocket.layerWebSocketConstructor,
      ModelCatalog.layer,
      Models.layer.pipe(Layer.provideMerge(FetchHttpClient.layer)),
    ),
  ),
);

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
 * The gateway and the workspace directory over one PostgreSQL database, through the storage
 * adapter, with handled job requests pruned after seven days. The host runs no turn jobs yet, so
 * work asked of agents waits in their inboxes. The HTTP server resolves bearer tokens before
 * entering the gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>, options: Options = {}): HostLayer => {
  const sandboxDirectory = options.sandboxDirectory ?? join(tmpdir(), "amends-sandboxes");
  const gateway = Layer.unwrap(
    Effect.map(makeIntegrations(join(sandboxDirectory, "connections")), (integrations) =>
      Gateway.layer({ ...installed, integrations }),
    ),
  );
  // TODO: Run the turn job here, and prune its requests, once it is rebuilt on harness-v2.
  return JobPruning.layer({ prune: PostgresClusterStorage.prune, entityTypes: [] }).pipe(
    Layer.provideMerge(
      gateway.pipe(
        Layer.provideMerge(postgres({ credentialKey: options.credentialKey })),
        Layer.provide(TurnJobs.layerNoRunner),
      ),
    ),
    Layer.provide(BunCrypto.layer),
    Layer.provide(layerDatabase(url, options)),
  );
};

export * as LocalHost from "./host.ts";
