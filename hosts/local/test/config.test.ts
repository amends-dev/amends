import { expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Redacted } from "effect";
import { LocalConfig } from "../src/config.ts";

const load = (values: Record<string, unknown>) =>
  LocalConfig.load().pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown(values, { preserveEmptyStrings: true }),
    ),
  );
const databaseUrl = "postgres://user:secret@localhost/database";

it.effect("configuration defaults to port 8787", () =>
  Effect.gen(function* () {
    const options = yield* load({ AMENDS_DATABASE_URL: databaseUrl });
    expect(options.port).toBe(8787);
    expect(Redacted.value(options.databaseUrl)).toBe(databaseUrl);
  }),
);

it.effect.each([0, 8787, 65535])("configuration accepts port %i", (port) =>
  Effect.gen(function* () {
    const options = yield* load({ AMENDS_PORT: String(port), AMENDS_DATABASE_URL: databaseUrl });
    expect(options.port).toBe(port);
  }),
);

it.effect.each(["", " ", "-1", "65536", "1.5", "not-a-port"])(
  "configuration rejects an invalid port %j",
  (port) =>
    Effect.gen(function* () {
      const error = yield* load({ AMENDS_PORT: port, AMENDS_DATABASE_URL: databaseUrl }).pipe(
        Effect.flip,
      );
      expect(error._tag).toBe("ConfigError");
      expect(error.message).toContain("AMENDS_PORT");
    }),
);

it.effect("configuration requires a database URL", () =>
  Effect.gen(function* () {
    const error = yield* load({}).pipe(Effect.flip);
    expect(error.message).toContain("AMENDS_DATABASE_URL");
  }),
);

it.effect.each(["postgres", "postgresql"])("configuration accepts a %s URL", (protocol) =>
  Effect.gen(function* () {
    const url = `${protocol}://user:secret@localhost/database`;
    const options = yield* load({ AMENDS_DATABASE_URL: url });
    expect(Redacted.value(options.databaseUrl)).toBe(url);
    expect(JSON.stringify(options)).not.toContain("secret");
  }),
);

it.effect.each(["", " ", "not-a-url", "https://user:secret@localhost/database"])(
  "configuration rejects database URL %j without revealing it",
  (url) =>
    Effect.gen(function* () {
      const error = yield* load({ AMENDS_DATABASE_URL: url }).pipe(Effect.flip);
      expect(error.message).toContain("AMENDS_DATABASE_URL");
      expect(error.message).not.toContain("secret");
    }),
);
