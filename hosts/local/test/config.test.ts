import { expect, test } from "bun:test";
import { ConfigProvider, Effect, Redacted } from "effect";
import { LocalConfig } from "../src/config.ts";

const load = (values: Record<string, unknown>) =>
  LocalConfig.load().pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown(values, { preserveEmptyStrings: true }),
    ),
  );

test("configuration defaults to SQLite on port 8787", async () => {
  expect(await Effect.runPromise(load({}))).toEqual({
    port: 8787,
    storage: { _tag: "Sqlite", filename: "./data/amends.sqlite" },
  });
});

test.each([0, 8787, 65535])(
  "configuration accepts port %i and an explicit SQLite filename",
  async (port) => {
    expect(
      await Effect.runPromise(
        load({ AMENDS_PORT: String(port), AMENDS_DATABASE: "/tmp/host.sqlite" }),
      ),
    ).toEqual({ port, storage: { _tag: "Sqlite", filename: "/tmp/host.sqlite" } });
  },
);

test.each(["", " ", "-1", "65536", "1.5", "not-a-port"])(
  "configuration rejects an invalid port %j",
  async (port) => {
    const error = await Effect.runPromise(load({ AMENDS_PORT: port }).pipe(Effect.flip));
    expect(error._tag).toBe("ConfigError");
    expect(error.message).toContain("AMENDS_PORT");
  },
);

test.each(["", "   "])("configuration rejects a blank SQLite filename %j", async (filename) => {
  const error = await Effect.runPromise(load({ AMENDS_DATABASE: filename }).pipe(Effect.flip));
  expect(error.message).toContain("AMENDS_DATABASE");
});

test.each(["postgres", "postgresql"])(
  "%s URL takes precedence without reading the SQLite filename",
  async (protocol) => {
    const url = `${protocol}://user:secret@localhost/database`;
    const options = await Effect.runPromise(
      load({ AMENDS_DATABASE_URL: url, AMENDS_DATABASE: "" }),
    );
    if (options.storage._tag !== "Postgres") throw new Error("Expected PostgreSQL");
    expect(Redacted.value(options.storage.url)).toBe(url);
    expect(JSON.stringify(options)).not.toContain("secret");
  },
);

test.each(["", " ", "not-a-url", "https://user:secret@localhost/database"])(
  "invalid database URL %j fails without falling back to SQLite",
  async (url) => {
    const error = await Effect.runPromise(load({ AMENDS_DATABASE_URL: url }).pipe(Effect.flip));
    expect(error.message).toContain("AMENDS_DATABASE_URL");
    expect(error.message).not.toContain("secret");
  },
);
