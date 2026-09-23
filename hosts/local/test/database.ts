import { PgClient } from "@effect/sql-pg";
import { inject } from "@effect/vitest";
import { Effect, Redacted } from "effect";

declare module "vitest" {
  interface ProvidedContext {
    amendsPostgresUrl: string | null;
  }
}

/** Create a database on the server for one test, drop it afterwards, and pass its URL. */
const temporary = Effect.fnUntraced(function* <A, E, R>(
  serverUrl: string,
  use: (url: string) => Effect.Effect<A, E, R>,
) {
  const name = `amends_host_${crypto.randomUUID().replaceAll("-", "")}`;
  const maintenance = PgClient.layer({ url: Redacted.make(serverUrl), maxConnections: 1 });
  const control = (statement: string) =>
    Effect.flatMap(PgClient.PgClient, (sql) => sql.unsafe(statement)).pipe(
      Effect.scoped,
      Effect.provide(maintenance),
      Effect.orDie,
    );
  yield* Effect.acquireRelease(control(`CREATE DATABASE "${name}"`), () =>
    control(`DROP DATABASE "${name}" WITH (FORCE)`),
  );
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return yield* use(url.toString());
}, Effect.scoped);

/**
 * PostgreSQL for host tests: the server the PostgreSQL project's global setup provides, with a
 * fresh database for each test. Without a server the tests skip.
 */
export const setup = () => {
  const url = inject("amendsPostgresUrl");
  return {
    available: url !== null,
    withDatabase: <A, E, R>(use: (url: string) => Effect.Effect<A, E, R>) => {
      if (url === null) throw new Error("PostgreSQL is unavailable");
      return temporary(url, use);
    },
  };
};
