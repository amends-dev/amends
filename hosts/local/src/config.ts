import { Config, Duration, Effect, Option, Result, Schema } from "effect";
import { Base64 } from "effect/encoding";
import type { Redacted } from "effect";

export interface Options {
  readonly port: number;
  /** The PostgreSQL database the host stores every workspace in. */
  readonly databaseUrl: Redacted.Redacted<string>;
  /** The most connections the host opens to it; one listens for notifications while needed. */
  readonly poolSize: number;
  /** This process's address among those running jobs over the database. */
  readonly runnerAddress: { readonly host: string; readonly port: number };
  /**
   * How processes running jobs reach each other: through the database alone, or also
   * directly over sockets at their runner addresses.
   */
  readonly runnerTransport: "storage" | "socket";
  /** How long a process that stops answering keeps its workspaces before another takes them. */
  readonly runnerTakeover: Duration.Duration;
  /** The key that seals connections' credentials at rest; without one, none can be stored. */
  readonly credentialKey: Redacted.Redacted<string> | undefined;
  /** The directory local sandboxes live in; the host's default when not set. */
  readonly sandboxDirectory: string | undefined;
}

const port = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
  "AMENDS_PORT",
).pipe(Config.withDefault(8787));
const databaseUrl = Config.schema(
  Schema.Redacted(
    Schema.String.check(
      Schema.makeFilter((value) => {
        const url = URL.parse(value);
        return (
          (url !== null && (url.protocol === "postgres:" || url.protocol === "postgresql:")) ||
          "Expected a postgres:// or postgresql:// database URL"
        );
      }),
    ),
  ),
  "AMENDS_DATABASE_URL",
);
const runnerAddress = Config.schema(
  Schema.String.check(
    Schema.makeFilter((value) => {
      const match = /^([A-Za-z0-9.-]+):([0-9]{1,5})$/.exec(value);
      return (
        (match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 65535) ||
        "Expected host:port, with a port from 1 through 65535"
      );
    }),
  ),
  "AMENDS_RUNNER_ADDRESS",
).pipe(
  Config.withDefault("localhost:34431"),
  Config.map((value) => {
    const separator = value.lastIndexOf(":");
    return { host: value.slice(0, separator), port: Number(value.slice(separator + 1)) };
  }),
);
const runnerTransport = Config.schema(
  Schema.Literals(["storage", "socket"]),
  "AMENDS_RUNNER_TRANSPORT",
).pipe(Config.withDefault("storage" as const));
const runnerTakeover = Config.schema(
  Schema.DurationFromString.check(
    Schema.makeFilter(
      (duration) =>
        (Duration.isGreaterThanOrEqualTo(duration, Duration.seconds(6)) &&
          Duration.isLessThanOrEqualTo(duration, Duration.minutes(10))) ||
        "Expected a duration from 6 seconds through 10 minutes",
    ),
  ),
  "AMENDS_RUNNER_TAKEOVER",
).pipe(Config.withDefault(Duration.seconds(35)));
// The runner-address claim, the cluster's shard locks, and the change feed's listener each keep a
// connection; five leaves two for requests, so one long commit does not stall every read.
const poolSize = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 1000 })),
  "AMENDS_DATABASE_POOL_SIZE",
).pipe(Config.withDefault(20));

const credentialKey = Config.schema(
  Schema.Redacted(
    Schema.String.check(
      Schema.makeFilter(
        (value) =>
          Result.match(Base64.decode(value), {
            onFailure: () => false,
            onSuccess: (bytes) => bytes.length === 32,
          }) || "Expected 32 bytes encoded as base64, such as from `openssl rand -base64 32`",
      ),
    ),
  ),
  "AMENDS_CREDENTIAL_KEY",
).pipe(Config.option);

const sandboxDirectory = Config.schema(Schema.NonEmptyString, "AMENDS_SANDBOX_DIRECTORY").pipe(
  Config.option,
);

/** Read and validate startup options without opening a database or server. */
export const load = Effect.fn("LocalConfig.load")(function* (): Effect.fn.Return<
  Options,
  Config.ConfigError
> {
  return {
    port: yield* port,
    databaseUrl: yield* databaseUrl,
    poolSize: yield* poolSize,
    runnerAddress: yield* runnerAddress,
    runnerTransport: yield* runnerTransport,
    runnerTakeover: yield* runnerTakeover,
    credentialKey: Option.getOrUndefined(yield* credentialKey),
    sandboxDirectory: Option.getOrUndefined(yield* sandboxDirectory),
  };
});

export * as LocalConfig from "./config.ts";
