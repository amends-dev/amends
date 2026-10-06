/**
 * An integration is a kind of system amends connects to, such as opencode, Anthropic's API, Daytona,
 * or an MCP server, declared in code: the settings a connection to it gives, the ways a connection
 * can authenticate, what a connection gives amends, and how a connection is checked. A connection
 * gives any of four things: harnesses, which run agents, models an agent runs on, sandboxes it works
 * in, and tools it calls.
 *
 * `make` declares an integration from what it does with a connection, given the connection's
 * settings decoded and its key, as `Access`. Each operation of the integration it makes takes a
 * connection and its credential as they are stored, and fails with `ConnectionError` for a
 * connection the integration does not take, or for what it does not give.
 *
 * An integration describes its settings as a form a person fills in, `SettingsForm`, which is how
 * MCP asks a person for input, so that settings can be asked for without code for each integration.
 */
import type { Agent, Harness, ModelEndpoint } from "@amends/harness-v2";
import type { SandboxProvider } from "@amends/sandbox-v2";
import type { ToolSource } from "@amends/toolkit";
import { type Array, Effect, type Redacted, type Result, Schema, type Scope } from "effect";
import { McpSchema } from "effect/ai";
import {
  type AuthMethod,
  type Connection,
  ConnectionError,
  type ConnectionErrorReason,
  type Credential,
  type Health,
  InvalidConnectionError,
  UnsupportedError,
} from "./Connection.ts";
import type * as ModelCatalog from "./ModelCatalog.ts";

/** What a connection gives amends. */
export const Capability = Schema.Literals(["harnesses", "models", "sandboxes", "tools"]);

export type Capability = typeof Capability.Type;

/**
 * The settings a connection gives, as a form a person fills in: an object of text, number,
 * yes-or-no, and choice fields, each with a title and a description, which is how MCP asks a person
 * for input.
 */
export const SettingsForm = McpSchema.ElicitRequestFormParams.fields.requestedSchema;

export type SettingsForm = typeof SettingsForm.Type;

/** The settings of an integration that takes none: an object with no keys. */
const noSettings = Schema.Record(Schema.String, Schema.Never);

export type NoSettings = typeof noSettings.Type;

/**
 * A connection as an integration's code is given it: with its settings decoded, and its key, which
 * the code of an integration that a connection authenticates with only by a key is always given.
 */
export interface Access<Settings, Auth extends AuthMethod = AuthMethod> {
  readonly connection: Connection;
  readonly settings: Settings;

  /** The connection's API key, when it authenticates with one. */
  readonly apiKey: "none" extends Auth
    ? Redacted.Redacted<string> | undefined
    : Redacted.Redacted<string>;
}

/** The model an agent is to run on through a connection, and how it is to run. */
export interface EndpointOptions {
  /** The model's id, as its provider names it. */
  readonly model: string;

  readonly effort?: ModelEndpoint.Effort;
  readonly maxOutputTokens?: number;
}

export interface Options<Settings, Auth extends AuthMethod = AuthMethod> {
  /** Names the integration, as connections name it, such as `anthropic` or `mcp`. */
  readonly id: string;

  /** What people call the system, such as `Anthropic`. */
  readonly name: string;

  /** Where the system's documentation is. */
  readonly docs?: string;

  /**
   * The settings a connection gives, besides its credential, such as a URL: no more and no fewer.
   * They make a form, of fields whose `title` and `description` annotations the form shows. Left
   * out, a connection gives none. An empty struct is not none, as it takes any value.
   */
  readonly settings?: Schema.Decoder<Settings>;

  /** The ways a connection can authenticate, in the order to offer them. */
  readonly auth: Array.NonEmptyReadonlyArray<Auth>;

  /**
   * The harness of a connection, running its agent on the models it is given, or why it cannot run
   * on them.
   */
  readonly harnesses?: (
    access: Access<Settings, Auth>,
    options: Agent.Options,
  ) => Effect.Effect<Harness.Harness["Service"], ConnectionErrorReason>;

  /** The models a connection gives an agent. */
  readonly models?: {
    /** The catalog's models a connection offers, for an agent to be given one. */
    readonly listed: ReadonlyArray<ModelCatalog.Model>;

    /** How an agent reaches a model through a connection, or why the connection cannot give it. */
    readonly endpoint: (
      access: Access<Settings, Auth>,
      options: EndpointOptions,
    ) => Result.Result<ModelEndpoint.ModelEndpoint, UnsupportedError>;
  };

  /** The sandbox provider of a connection, which works until the scope closes. */
  readonly sandboxes?: (
    access: Access<Settings, Auth>,
  ) => Effect.Effect<
    SandboxProvider.SandboxProvider["Service"],
    ConnectionErrorReason,
    Scope.Scope
  >;

  /** The tool source of a connection. */
  readonly tools?: (
    access: Access<Settings, Auth>,
  ) => Effect.Effect<ToolSource.ToolSource, ConnectionErrorReason>;

  /** Checks a connection, as by asking the system for something only a working connection gets. */
  readonly check: (access: Access<Settings, Auth>) => Effect.Effect<Health>;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly docs: string | undefined;
  readonly auth: Array.NonEmptyReadonlyArray<AuthMethod>;

  /** The settings a connection gives, as the form a person fills in to give them. */
  readonly settings: SettingsForm;

  /** What a connection to the integration gives. */
  readonly provides: ReadonlyArray<Capability>;

  /** The catalog's models a connection offers, none for an integration that gives no models. */
  readonly models: ReadonlyArray<ModelCatalog.Model>;

  /**
   * Fails for `connection` when the integration does not take it, by its settings or by how it
   * authenticates, and runs nothing. Its credential is apart from it, so whether it has the key it
   * needs is not checked.
   */
  readonly validate: (connection: Connection) => Effect.Effect<void, ConnectionError>;

  /** The harness of `connection`, running its agent on the models `options` gives. */
  readonly harness: (
    connection: Connection,
    credential: Credential | undefined,
    options: Agent.Options,
  ) => Effect.Effect<Harness.Harness["Service"], ConnectionError>;

  /** How an agent reaches a model through `connection`. */
  readonly modelEndpoint: (
    connection: Connection,
    credential: Credential | undefined,
    options: EndpointOptions,
  ) => Effect.Effect<ModelEndpoint.ModelEndpoint, ConnectionError>;

  /** The sandbox provider of `connection`, which works until the scope closes. */
  readonly sandboxProvider: (
    connection: Connection,
    credential: Credential | undefined,
  ) => Effect.Effect<SandboxProvider.SandboxProvider["Service"], ConnectionError, Scope.Scope>;

  /** The tool source of `connection`. */
  readonly toolSource: (
    connection: Connection,
    credential: Credential | undefined,
  ) => Effect.Effect<ToolSource.ToolSource, ConnectionError>;

  /** Checks `connection`. */
  readonly check: (
    connection: Connection,
    credential: Credential | undefined,
  ) => Effect.Effect<Health, ConnectionError>;
}

/**
 * The integration that `options` declares. It throws for settings that do not make a form, which
 * the integration's code must change.
 */
export const make = <Settings = NoSettings, Auth extends AuthMethod = AuthMethod>(
  options: Options<Settings, Auth>,
): Integration => {
  const auth: Array.NonEmptyReadonlyArray<AuthMethod> = options.auth;
  // An integration that leaves its settings out has the settings `NoSettings` describes.
  const settings = (options.settings ?? noSettings) as Schema.Decoder<Settings>;
  const fail = (reason: ConnectionErrorReason, cause?: unknown) =>
    new ConnectionError({ integration: options.id, reason, cause });

  /** The connection's settings decoded, failing for a connection the integration does not take. */
  const settingsOf = (connection: Connection) =>
    Effect.gen(function* () {
      if (!auth.includes(connection.auth)) {
        const description = `${options.name} takes no authentication by ${connection.auth}`;
        return yield* fail(new InvalidConnectionError({ description }));
      }
      return yield* Schema.decodeEffect(settings)(connection.settings, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((cause) =>
          fail(
            new InvalidConnectionError({
              description: `The settings of ${connection.name} do not match what ${options.name} takes: ${cause.message}`,
            }),
            cause,
          ),
        ),
      );
    });

  /** `connection` as the integration's code takes it, failing for one the integration does not. */
  const accessOf = (connection: Connection, credential: Credential | undefined) =>
    Effect.gen(function* () {
      const decoded = yield* settingsOf(connection);
      if (connection.auth === "apiKey" && credential === undefined) {
        const description = `The connection ${connection.name} has no API key`;
        return yield* fail(new InvalidConnectionError({ description }));
      }
      // A connection that authenticates with a key has one, as checked above.
      const access = {
        connection,
        settings: decoded,
        apiKey: connection.auth === "apiKey" ? credential?.apiKey : undefined,
      } as Access<Settings, Auth>;
      return access;
    });

  const notProvided = (what: string) =>
    Effect.fail(fail(new UnsupportedError({ description: `${options.name} gives no ${what}` })));

  return {
    id: options.id,
    name: options.name,
    docs: options.docs,
    auth,
    settings: settingsFormOf(options.name, settings),
    provides: [
      ...(options.harnesses === undefined ? [] : ["harnesses" as const]),
      ...(options.models === undefined ? [] : ["models" as const]),
      ...(options.sandboxes === undefined ? [] : ["sandboxes" as const]),
      ...(options.tools === undefined ? [] : ["tools" as const]),
    ],
    models: options.models?.listed ?? [],

    validate: (connection) => Effect.asVoid(settingsOf(connection)),

    harness: (connection, credential, agentOptions) => {
      const { harnesses } = options;
      if (harnesses === undefined) return notProvided("harnesses");
      return accessOf(connection, credential).pipe(
        Effect.flatMap((access) =>
          Effect.mapError(harnesses(access, agentOptions), (reason) => fail(reason)),
        ),
      );
    },

    modelEndpoint: (connection, credential, endpointOptions) => {
      const { models } = options;
      if (models === undefined) return notProvided("models");
      return accessOf(connection, credential).pipe(
        Effect.flatMap((access) =>
          Effect.fromResult(models.endpoint(access, endpointOptions)).pipe(
            Effect.mapError((reason) => fail(reason)),
          ),
        ),
      );
    },

    sandboxProvider: (connection, credential) => {
      const { sandboxes } = options;
      if (sandboxes === undefined) return notProvided("sandboxes");
      return accessOf(connection, credential).pipe(
        Effect.flatMap((access) => Effect.mapError(sandboxes(access), (reason) => fail(reason))),
      );
    },

    toolSource: (connection, credential) => {
      const { tools } = options;
      if (tools === undefined) return notProvided("tools");
      return accessOf(connection, credential).pipe(
        Effect.flatMap((access) => Effect.mapError(tools(access), (reason) => fail(reason))),
      );
    },

    check: (connection, credential) =>
      Effect.flatMap(accessOf(connection, credential), options.check),
  };
};

/**
 * The form of the settings an integration named `name` takes, from their JSON Schema. It throws for
 * settings that do not make a form, such as a nested object.
 */
const settingsFormOf = (name: string, settings: Schema.Decoder<unknown>): SettingsForm => {
  const { schema } = Schema.toJsonSchemaDocument(settings);
  // The JSON Schema of an object with no keys lists no properties, which a form must.
  const form = Schema.decodeUnknownExit(SettingsForm)({ properties: {}, ...schema });
  if (form._tag === "Success") return form.value;
  throw new Error(`The settings of ${name} do not make a form: ${String(form.cause)}`);
};
