import { Config, Data, Effect, Option, Schema } from "effect";
import type { Redacted } from "effect";

/** The selected storage backend; unused backend settings are not read. */
export type Storage = Data.TaggedEnum<{
  Sqlite: { readonly filename: string };
  Postgres: { readonly url: Redacted.Redacted<string> };
}>;
export const Storage = Data.taggedEnum<Storage>();

export interface Options {
  readonly port: number;
  readonly storage: Storage;
}

const port = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
  "AMENDS_PORT",
).pipe(Config.withDefault(8787));
const filename = Config.schema(
  Schema.String.check(Schema.isPattern(/\S/, { title: "non-blank SQLite filename" })),
  "AMENDS_DATABASE",
).pipe(Config.withDefault("./data/amends.sqlite"));
const databaseUrl = Config.option(
  Config.schema(
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
  ),
);

/** Read and validate startup options without opening a database or server. */
export const load = Effect.fn("LocalConfig.load")(function* (): Effect.fn.Return<
  Options,
  Config.ConfigError
> {
  const selectedPort = yield* port;
  const url = yield* databaseUrl;
  const storage = Option.isSome(url)
    ? Storage.Postgres({ url: url.value })
    : Storage.Sqlite({ filename: yield* filename });
  return { port: selectedPort, storage };
});

export * as LocalConfig from "./config.ts";
