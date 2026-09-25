import { Config, Duration, Effect, Schema } from "effect";
import type { Redacted } from "effect";

export interface Options {
  readonly port: number;
  /** The PostgreSQL database the host stores every workspace in. */
  readonly databaseUrl: Redacted.Redacted<string>;
  /** The most connections the host opens to it; one listens for notifications while needed. */
  readonly poolSize: number;
  /** This process's address among those running background work over the database. */
  readonly runnerAddress: { readonly host: string; readonly port: number };
  /**
   * How processes running background work reach each other: through the database alone, or also
   * directly over sockets at their runner addresses.
   */
  readonly runnerTransport: "storage" | "socket";
  /** How long a process that stops answering keeps its workspaces before another takes them. */
  readonly runnerTakeover: Duration.Duration;
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
const poolSize = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 1000 })),
  "AMENDS_DATABASE_POOL_SIZE",
).pipe(Config.withDefault(20));

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
  };
});

export * as LocalConfig from "./config.ts";
