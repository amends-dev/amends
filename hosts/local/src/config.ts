import { Config, Effect, Schema } from "effect";
import type { Redacted } from "effect";

export interface Options {
  readonly port: number;
  /** The PostgreSQL database the host stores every workspace in. */
  readonly databaseUrl: Redacted.Redacted<string>;
  /** The most connections the host opens to it; one listens for notifications while needed. */
  readonly poolSize: number;
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
const poolSize = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 1000 })),
  "AMENDS_DATABASE_POOL_SIZE",
).pipe(Config.withDefault(10));

/** Read and validate startup options without opening a database or server. */
export const load = Effect.fn("LocalConfig.load")(function* (): Effect.fn.Return<
  Options,
  Config.ConfigError
> {
  return { port: yield* port, databaseUrl: yield* databaseUrl, poolSize: yield* poolSize };
});

export * as LocalConfig from "./config.ts";
