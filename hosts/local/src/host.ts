import { createHmac, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Integrations,
  ModelCatalog,
  ModelIntegrations,
  ToolIntegrations,
} from "@amends-dev/connection";
import { DeliveryJob, JobPruning, TurnJob } from "@amends-dev/cluster";
import {
  type Accounts,
  Gateway,
  type SignInStorage,
  type WorkspaceDirectory,
} from "@amends-dev/gateway";
import { Models } from "@amends-dev/harness-amends";
import {
  PostgresClusterStorage,
  PostgresDatabase,
  PostgresStorage,
} from "@amends-dev/storage-postgresql";
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
import * as HarnessIntegrations from "./harness-integrations.ts";
import * as SandboxIntegrations from "./sandbox-integrations.ts";

/** Gateway, directory, accounts, and sign-in storage owned by one host lifetime. */
export type HostLayer = Layer.Layer<
  | Gateway.Gateway
  | WorkspaceDirectory.WorkspaceDirectory
  | Accounts.Accounts
  | SignInStorage.SignInStorage,
  unknown
>;

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
   * The directory this machine's sandboxes live in, a directory for each connection to it;
   * `amends-sandboxes` in the system's temporary directory by default.
   */
  readonly sandboxDirectory?: string | undefined;
}

/**
 * A secret for one purpose, such as opencode's bridge tokens: one made from the credential key,
 * which every host over the database shares, so that hosts agree on it; or, without a credential
 * key, this process's own.
 */
export const deriveSecret = (
  credentialKey: Redacted.Redacted<string> | undefined,
  purpose: string,
) =>
  credentialKey === undefined
    ? randomBytes(32)
    : createHmac("sha256", Buffer.from(Redacted.value(credentialKey), "base64"))
        .update(purpose)
        .digest();

/**
 * The integrations this host installs, which workspaces connect to: each model provider in the
 * catalog and any OpenAI-compatible API, for models; MCP servers and HTTP APIs, for tools;
 * sandboxes as directories under `directory`, for development, and on Daytona; and amends's agent
 * and opencode's two, as harnesses. opencode's bridges take tokens derived from `credentialKey`.
 *
 * @category constructors
 */
export const makeIntegrations = Effect.fn("LocalHost.makeIntegrations")(
  function* (directory: string, credentialKey?: Redacted.Redacted<string>) {
    // A host reaches a bridge another host launched.
    const bridgeSecret = deriveSecret(credentialKey, "amends/opencode-bridge");
    const opencodeOptions: HarnessIntegrations.OpencodeOptions = {
      token: (sandboxId) =>
        Redacted.make(createHmac("sha256", bridgeSecret).update(sandboxId).digest("base64url")),
    };
    return [
      ...(yield* ModelIntegrations.catalogProviders),
      yield* ModelIntegrations.openAiCompatible,
      yield* ToolIntegrations.mcp,
      yield* ToolIntegrations.openApi,
      yield* SandboxIntegrations.local({ directory }),
      yield* SandboxIntegrations.daytona,
      yield* HarnessIntegrations.amends(),
      yield* HarnessIntegrations.opencode(opencodeOptions),
      yield* HarnessIntegrations.opencode2(opencodeOptions),
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
 * The gateway, the workspace directory, the accounts, and sign-in's storage over one PostgreSQL
 * database, through
 * the storage adapter, with the turn jobs that run agents' turns and the delivery jobs that carry messages to
 * channels, both on the integrations the host installs, and handled job requests pruned after
 * seven days. The HTTP server resolves bearer tokens before
 * entering the gateway.
 *
 * @category layers
 */
export const layer = (url: Redacted.Redacted<string>, options: Options = {}): HostLayer => {
  const sandboxDirectory = options.sandboxDirectory ?? join(tmpdir(), "amends-sandboxes");
  const jobs = Effect.map(
    makeIntegrations(sandboxDirectory, options.credentialKey),
    (integrations) => {
      const gateway = Gateway.layer({ integrations }).pipe(
        Layer.provideMerge(PostgresStorage.layer({ credentialKey: options.credentialKey })),
        Layer.provide(Layer.merge(TurnJob.layerRequests, DeliveryJob.layerRequests)),
      );
      const installed = Layer.effect(Integrations.Integrations, Integrations.make(integrations));
      return Layer.mergeAll(
        Layer.merge(TurnJob.layerWorker, DeliveryJob.layerWorker).pipe(Layer.provide(installed)),
        JobPruning.layer({
          prune: PostgresClusterStorage.prune,
          entityTypes: [TurnJob.entity.type, DeliveryJob.entity.type],
        }),
      ).pipe(Layer.provideMerge(gateway));
    },
  );
  return Layer.unwrap(jobs).pipe(
    Layer.provide(BunCrypto.layer),
    Layer.provide(layerDatabase(url, options)),
  );
};
