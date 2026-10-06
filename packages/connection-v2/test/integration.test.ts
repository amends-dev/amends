import { type Agent, Harness, type ModelEndpoint } from "@amends/harness-v2";
import { SandboxProvider } from "@amends/sandbox-v2";
import type { ToolSource } from "@amends/toolkit";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Redacted, Result, Schema } from "effect";
import * as Connection from "../src/Connection.ts";
import * as Integration from "../src/Integration.ts";
import * as Integrations from "../src/Integrations.ts";

const key = Redacted.make("secret-key");

/** What the integration's code was given, for each operation it ran. */
const given: Array<Integration.Access<{ readonly region: string }>> = [];

/** The options each harness the integration made was given. */
const madeWith: Array<Agent.Options> = [];

const provider = SandboxProvider.SandboxProvider.of({
  create: () => Effect.die("unused"),
  resume: () => Effect.die("unused"),
});

const source: ToolSource.ToolSource = {
  name: "unused",
  discover: Effect.succeed([]),
  call: () => Effect.die("unused"),
};

/** An agent that is never started. */
const agent: Agent.Agent = {
  id: "everything",
  requiresSandbox: false,
  startSession: () => Effect.die("unused"),
};

/**
 * An integration that gives everything, and remembers what it is given. Its harness runs only on
 * models served over Chat Completions.
 */
const everything = Integration.make({
  id: "everything",
  name: "Everything",
  settings: Schema.Struct({
    region: Schema.NonEmptyString.annotate({ title: "Region", description: "Where it runs." }),
  }),
  auth: ["apiKey", "none"],
  harnesses: (access, options) =>
    Effect.gen(function* () {
      given.push(access);
      madeWith.push(options);
      const { protocol } = options.model;
      if (protocol !== "openai-chat") {
        return yield* new Connection.UnsupportedError({
          description: `Everything runs no model over ${protocol}`,
        });
      }
      return Harness.make(agent);
    }),
  models: {
    listed: [],
    endpoint: (access, options) => {
      given.push(access);
      return Result.succeed({
        provider: "everything",
        model: options.model,
        protocol: "openai-chat",
        url: `https://${access.settings.region}.everything.example/v1`,
        ...(access.apiKey === undefined ? {} : { apiKey: access.apiKey }),
      });
    },
  },
  sandboxes: (access) => Effect.sync(() => given.push(access)).pipe(Effect.as(provider)),
  tools: (access) => Effect.sync(() => given.push(access)).pipe(Effect.as(source)),
  check: (access) =>
    Effect.sync(() => given.push(access)).pipe(Effect.as({ status: "healthy" as const })),
});

/** An integration that gives only models, takes no settings, and authenticates only with a key. */
const modelsOnly = Integration.make({
  id: "models-only",
  name: "Models only",
  auth: ["apiKey"],
  models: {
    listed: [],
    endpoint: () => Result.fail(new Connection.UnsupportedError({ description: "No model" })),
  },
  check: () => Effect.succeed({ status: "healthy" }),
});

/** An endpoint served over Chat Completions, which the harness of `everything` runs on. */
const chatEndpoint = {
  provider: "everything",
  model: "m",
  protocol: "openai-chat",
  url: "https://eu.everything.example/v1",
} satisfies ModelEndpoint.ModelEndpoint;

const connection = (fields: Partial<Connection.Connection> = {}): Connection.Connection => ({
  id: Connection.ConnectionId.make("conn-1"),
  integration: "everything",
  name: "Mine",
  settings: { region: "eu" },
  auth: "apiKey",
  ...fields,
});

const reasonOf = <A, R>(effect: Effect.Effect<A, Connection.ConnectionError, R>) =>
  Effect.map(Effect.flip(effect), (error) => ({
    integration: error.integration,
    tag: error.reason._tag,
    description: error.reason.description,
  }));

describe("Integration.make", () => {
  it("says what a connection to the integration gives", () => {
    expect(everything.provides).toEqual(["harnesses", "models", "sandboxes", "tools"]);
    expect(modelsOnly.provides).toEqual(["models"]);
  });

  it("describes the settings a connection gives as a form", () => {
    expect(everything.settings).toEqual({
      type: "object",
      properties: {
        region: { type: "string", title: "Region", description: "Where it runs.", minLength: 1 },
      },
      required: ["region"],
    });
    expect(modelsOnly.settings).toEqual({ type: "object", properties: {} });
  });

  it("throws for settings that make no form", () => {
    const declaring = (settings: Schema.Decoder<unknown>) => () =>
      Integration.make({
        id: "formless",
        name: "Formless",
        settings,
        auth: ["none"],
        check: () => Effect.succeed({ status: "healthy" }),
      });

    expect(declaring(Schema.Struct({ nested: Schema.Struct({ a: Schema.String }) }))).toThrow(
      "The settings of Formless do not make a form",
    );
    // An empty struct takes any value, as no settings would not.
    expect(declaring(Schema.Struct({}))).toThrow("The settings of Formless do not make a form");
  });

  it.effect("validates a connection without its key, running nothing", () =>
    Effect.gen(function* () {
      given.length = 0;
      yield* everything.validate(connection());
      yield* modelsOnly.validate(connection({ integration: "models-only", settings: {} }));
      const refusals = [
        yield* reasonOf(modelsOnly.validate(connection({ auth: "none", settings: {} }))),
        yield* reasonOf(everything.validate(connection({ settings: {} }))),
        yield* reasonOf(everything.validate(connection({ settings: { region: "eu", zone: "a" } }))),
        yield* reasonOf(modelsOnly.validate(connection({ settings: { region: "eu" } }))),
      ];

      expect(refusals.map(({ integration, tag }) => [integration, tag])).toEqual([
        ["models-only", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["models-only", "InvalidConnectionError"],
      ]);
      expect(refusals[0]?.description).toBe("Models only takes no authentication by none");
      expect(refusals[2]?.description).toContain(
        "The settings of Mine do not match what Everything takes",
      );
      expect(given).toHaveLength(0);
    }),
  );

  it.effect("gives each operation the connection's settings decoded, and its key", () =>
    Effect.gen(function* () {
      given.length = 0;
      madeWith.length = 0;
      const harness = yield* everything.harness(
        connection(),
        { apiKey: key },
        { model: chatEndpoint },
      );
      const endpoint = yield* everything.modelEndpoint(
        connection(),
        { apiKey: key },
        { model: "m" },
      );
      yield* Effect.scoped(everything.sandboxProvider(connection(), { apiKey: key }));
      yield* everything.toolSource(connection(), { apiKey: key });
      const health = yield* everything.check(connection(), { apiKey: key });

      expect(harness.agent).toBe("everything");
      expect(madeWith).toEqual([{ model: chatEndpoint }]);
      expect(endpoint).toMatchObject({ model: "m", url: "https://eu.everything.example/v1" });
      expect(endpoint.apiKey).toBe(key);
      expect(health).toEqual({ status: "healthy" });
      expect(given).toHaveLength(5);
      for (const access of given) {
        expect(access.settings).toEqual({ region: "eu" });
        expect(access.apiKey).toBe(key);
        expect(access.connection.name).toBe("Mine");
      }
    }),
  );

  it.effect("gives a connection that authenticates with nothing no key, whatever it holds", () =>
    Effect.gen(function* () {
      given.length = 0;
      const endpoint = yield* everything.modelEndpoint(
        connection({ auth: "none" }),
        { apiKey: key },
        { model: "m" },
      );

      expect(endpoint).not.toHaveProperty("apiKey");
      expect(given[0]?.apiKey).toBeUndefined();
    }),
  );

  it.effect("refuses a connection that the integration does not take", () =>
    Effect.gen(function* () {
      const refusals = [
        yield* reasonOf(modelsOnly.check(connection({ auth: "none", settings: {} }), undefined)),
        yield* reasonOf(everything.check(connection(), undefined)),
        yield* reasonOf(
          everything.check(connection({ settings: { region: "" } }), { apiKey: key }),
        ),
        yield* reasonOf(everything.check(connection({ settings: {} }), { apiKey: key })),
        yield* reasonOf(
          everything.check(connection({ settings: { region: "eu", zone: "a" } }), { apiKey: key }),
        ),
        yield* reasonOf(
          modelsOnly.check(connection({ settings: { region: "eu" } }), { apiKey: key }),
        ),
      ];

      expect(refusals.map(({ integration, tag }) => [integration, tag])).toEqual([
        ["models-only", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["everything", "InvalidConnectionError"],
        ["models-only", "InvalidConnectionError"],
      ]);
      expect(refusals[0]?.description).toBe("Models only takes no authentication by none");
      expect(refusals[1]?.description).toBe("The connection Mine has no API key");
      expect(refusals[3]?.description).toContain(
        "The settings of Mine do not match what Everything takes",
      );
    }),
  );

  it.effect("refuses what the integration does not give", () =>
    Effect.gen(function* () {
      const settled = { settings: {}, integration: "models-only" };
      const refusals = [
        yield* reasonOf(
          Effect.scoped(modelsOnly.sandboxProvider(connection(settled), { apiKey: key })),
        ),
        yield* reasonOf(modelsOnly.toolSource(connection(settled), { apiKey: key })),
        yield* reasonOf(
          modelsOnly.harness(connection(settled), { apiKey: key }, { model: chatEndpoint }),
        ),
        yield* reasonOf(
          modelsOnly.modelEndpoint(connection(settled), { apiKey: key }, { model: "m" }),
        ),
        yield* reasonOf(
          everything.harness(
            connection(),
            { apiKey: key },
            { model: { ...chatEndpoint, protocol: "anthropic-messages" } },
          ),
        ),
      ];

      expect(refusals).toEqual([
        {
          integration: "models-only",
          tag: "UnsupportedError",
          description: "Models only gives no sandboxes",
        },
        {
          integration: "models-only",
          tag: "UnsupportedError",
          description: "Models only gives no tools",
        },
        {
          integration: "models-only",
          tag: "UnsupportedError",
          description: "Models only gives no harnesses",
        },
        { integration: "models-only", tag: "UnsupportedError", description: "No model" },
        {
          integration: "everything",
          tag: "UnsupportedError",
          description: "Everything runs no model over anthropic-messages",
        },
      ]);
    }),
  );
});

describe("Integrations", () => {
  it.effect("finds an integration by id, and fails for an id it has not", () =>
    Effect.gen(function* () {
      const integrations = yield* Integrations.make([everything, modelsOnly]);

      const found = yield* integrations.find("models-only");
      const missing = yield* reasonOf(integrations.find("elsewhere"));

      expect(found).toBe(modelsOnly);
      expect(integrations.all).toEqual([everything, modelsOnly]);
      expect(missing).toEqual({
        integration: "elsewhere",
        tag: "NotFoundError",
        description: "No integration is installed as elsewhere",
      });
    }),
  );

  it.effect("refuses integrations that share an id", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Integrations.make([everything, everything]));

      expect(Exit.hasDies(exit)).toBe(true);
    }),
  );
});
