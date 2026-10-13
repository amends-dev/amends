import { expect, it } from "@effect/vitest";
import { ConfigProvider, Duration, Effect, Redacted } from "effect";
import * as LocalConfig from "../src/LocalConfig.ts";

const load = (values: Record<string, unknown>) =>
  LocalConfig.load().pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown(values, { preserveEmptyStrings: true }),
    ),
  );
const databaseUrl = "postgres://user:secret@localhost/database";

it.effect("configuration defaults to port 8787 and a pool of twenty connections", () =>
  Effect.gen(function* () {
    const options = yield* load({ AMENDS_DATABASE_URL: databaseUrl });
    expect(options.port).toBe(8787);
    expect(options.poolSize).toBe(20);
    expect(Redacted.value(options.databaseUrl)).toBe(databaseUrl);
  }),
);

it.effect.each([5, 50, 1000])("configuration accepts a pool of %i connections", (size) =>
  Effect.gen(function* () {
    const options = yield* load({
      AMENDS_DATABASE_URL: databaseUrl,
      AMENDS_DATABASE_POOL_SIZE: String(size),
    });
    expect(options.poolSize).toBe(size);
  }),
);

// A process that runs jobs holds three connections (the address claim, shard locks, and the notice
// listener), and requests need two more; three hangs once a change stream opens.
it.effect.each(["", "0", "1", "3", "4", "1001", "5.5", "many"])(
  "configuration rejects a pool size of %j",
  (size) =>
    Effect.gen(function* () {
      const error = yield* load({
        AMENDS_DATABASE_URL: databaseUrl,
        AMENDS_DATABASE_POOL_SIZE: size,
      }).pipe(Effect.flip);
      expect(error.message).toContain("AMENDS_DATABASE_POOL_SIZE");
    }),
);

it.effect("background work runs at localhost:34431 unless told otherwise", () =>
  Effect.gen(function* () {
    expect((yield* load({ AMENDS_DATABASE_URL: databaseUrl })).runnerAddress).toEqual({
      host: "localhost",
      port: 34431,
    });
    const options = yield* load({
      AMENDS_DATABASE_URL: databaseUrl,
      AMENDS_RUNNER_ADDRESS: "runner-2.internal:40001",
    });
    expect(options.runnerAddress).toEqual({ host: "runner-2.internal", port: 40001 });
  }),
);

it.effect("background work coordinates through the database, and hands over after 35 seconds", () =>
  Effect.gen(function* () {
    const defaults = yield* load({ AMENDS_DATABASE_URL: databaseUrl });
    expect(defaults.runnerTransport).toBe("storage");
    expect(Duration.toMillis(defaults.runnerTakeover)).toBe(35_000);
    const options = yield* load({
      AMENDS_DATABASE_URL: databaseUrl,
      AMENDS_RUNNER_TRANSPORT: "socket",
      AMENDS_RUNNER_TAKEOVER: "15 seconds",
    });
    expect(options.runnerTransport).toBe("socket");
    expect(Duration.toMillis(options.runnerTakeover)).toBe(15_000);
  }),
);

it.effect.each([
  ["AMENDS_RUNNER_TRANSPORT", "http"],
  ["AMENDS_RUNNER_TAKEOVER", "5 seconds"],
  ["AMENDS_RUNNER_TAKEOVER", "11 minutes"],
  ["AMENDS_RUNNER_TAKEOVER", "soon"],
] as const)("configuration rejects %s=%j", ([name, value]) =>
  Effect.gen(function* () {
    const error = yield* load({ AMENDS_DATABASE_URL: databaseUrl, [name]: value }).pipe(
      Effect.flip,
    );
    expect(error.message).toContain(name);
  }),
);

it.effect.each(["", "localhost", ":34431", "localhost:0", "localhost:65536", "a b:1"])(
  "configuration rejects a runner address of %j",
  (address) =>
    Effect.gen(function* () {
      const error = yield* load({
        AMENDS_DATABASE_URL: databaseUrl,
        AMENDS_RUNNER_ADDRESS: address,
      }).pipe(Effect.flip);
      expect(error.message).toContain("AMENDS_RUNNER_ADDRESS");
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

it.effect("people sign in with emailed codes unless development sign-in is asked for", () =>
  Effect.gen(function* () {
    expect((yield* load({ AMENDS_DATABASE_URL: databaseUrl })).signIn).toBe("email");
    const options = yield* load({
      AMENDS_DATABASE_URL: databaseUrl,
      AMENDS_SIGN_IN: "development",
    });
    expect(options.signIn).toBe("development");
    const error = yield* load({ AMENDS_DATABASE_URL: databaseUrl, AMENDS_SIGN_IN: "open" }).pipe(
      Effect.flip,
    );
    expect(error.message).toContain("AMENDS_SIGN_IN");
  }),
);

it.effect("a process serves the API and runs jobs unless told to do one alone", () =>
  Effect.gen(function* () {
    expect((yield* load({ AMENDS_DATABASE_URL: databaseUrl })).role).toBe("all");
    for (const role of ["api", "jobs"] as const)
      expect((yield* load({ AMENDS_DATABASE_URL: databaseUrl, AMENDS_ROLE: role })).role).toBe(
        role,
      );
    const error = yield* load({ AMENDS_DATABASE_URL: databaseUrl, AMENDS_ROLE: "web" }).pipe(
      Effect.flip,
    );
    expect(error.message).toContain("AMENDS_ROLE");
  }),
);
