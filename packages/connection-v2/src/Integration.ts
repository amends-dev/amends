/**
 * An integration is a kind of system amends connects to, such as Anthropic's API, Daytona, or an MCP
 * server, declared in code: the settings a connection to it gives, the ways a connection can
 * authenticate, what a connection gives amends, and how a connection is checked. A connection gives
 * any of three things: models an agent runs on, sandboxes it works in, and tools it calls.
 *
 * `make` declares an integration from what it does with a connection, given the connection's
 * settings decoded and its key, as `Access`. Each operation of the integration it makes takes a
 * connection and its credential as they are stored, and fails with `ConnectionError` for a
 * connection the integration does not take, or for what it does not give.
 */
import type { ModelEndpoint } from "@amends/harness-v2";
import type { SandboxProvider } from "@amends/sandbox-v2";
import type { ToolSource } from "@amends/toolkit";
import { type Array, Effect, type Redacted, type Result, Schema, type Scope } from "effect";
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
export const Capability = Schema.Literals(["models", "sandboxes", "tools"]);

export type Capability = typeof Capability.Type;

/** A connection as an integration's code is given it: with its settings decoded, and its key. */
export interface Access<Settings> {
  readonly connection: Connection;
  readonly settings: Settings;

  /** The connection's API key, when it authenticates with one. */
  readonly apiKey: Redacted.Redacted<string> | undefined;
}

/** The model an agent is to run on through a connection, and how it is to run. */
export interface EndpointOptions {
  /** The model's id, as its provider names it. */
  readonly model: string;

  readonly effort?: ModelEndpoint.Effort;
  readonly maxOutputTokens?: number;
}

export interface Options<Settings> {
  /** Names the integration, as connections name it, such as `anthropic` or `mcp`. */
  readonly id: string;

  /** What people call the system, such as `Anthropic`. */
  readonly name: string;

  /** Where the system's documentation is. */
  readonly docs?: string;

  /** The settings a connection gives, besides its credential, such as a URL. */
  readonly settings: Schema.Decoder<Settings>;

  /** The ways a connection can authenticate, in the order to offer them. */
  readonly auth: Array.NonEmptyReadonlyArray<AuthMethod>;

  /** The models a connection gives an agent. */
  readonly models?: {
    /** The catalog's models a connection offers, for an agent to be given one. */
    readonly listed: ReadonlyArray<ModelCatalog.Model>;

    /** How an agent reaches a model through a connection, or why the connection cannot give it. */
    readonly endpoint: (
      access: Access<Settings>,
      options: EndpointOptions,
    ) => Result.Result<ModelEndpoint.ModelEndpoint, UnsupportedError>;
  };

  /** The sandbox provider of a connection, which works until the scope closes. */
  readonly sandboxes?: (
    access: Access<Settings>,
  ) => Effect.Effect<
    SandboxProvider.SandboxProvider["Service"],
    ConnectionErrorReason,
    Scope.Scope
  >;

  /** The tool source of a connection. */
  readonly tools?: (
    access: Access<Settings>,
  ) => Effect.Effect<ToolSource.ToolSource, ConnectionErrorReason>;

  /** Checks a connection, as by asking the system for something only a working connection gets. */
  readonly check: (access: Access<Settings>) => Effect.Effect<Health>;
}

export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly docs: string | undefined;
  readonly auth: Array.NonEmptyReadonlyArray<AuthMethod>;

  /** What a connection to the integration gives. */
  readonly provides: ReadonlyArray<Capability>;

  /** The catalog's models a connection offers, none for an integration that gives no models. */
  readonly models: ReadonlyArray<ModelCatalog.Model>;

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

/** The integration that `options` declares. */
export const make = <Settings>(options: Options<Settings>): Integration => {
  const fail = (reason: ConnectionErrorReason, cause?: unknown) =>
    new ConnectionError({ integration: options.id, reason, cause });

  /** `connection` as the integration's code takes it, failing for one the integration does not. */
  const accessOf = (connection: Connection, credential: Credential | undefined) =>
    Effect.gen(function* () {
      if (!options.auth.includes(connection.auth)) {
        const description = `${options.name} takes no authentication by ${connection.auth}`;
        return yield* fail(new InvalidConnectionError({ description }));
      }
      if (connection.auth === "apiKey" && credential === undefined) {
        const description = `The connection ${connection.name} has no API key`;
        return yield* fail(new InvalidConnectionError({ description }));
      }
      const settings = yield* Schema.decodeEffect(options.settings)(connection.settings).pipe(
        Effect.mapError((cause) =>
          fail(
            new InvalidConnectionError({
              description: `The settings of ${connection.name} do not match what ${options.name} takes: ${cause.message}`,
            }),
            cause,
          ),
        ),
      );
      const access: Access<Settings> = {
        connection,
        settings,
        apiKey: connection.auth === "apiKey" ? credential?.apiKey : undefined,
      };
      return access;
    });

  const notProvided = (what: string) =>
    Effect.fail(fail(new UnsupportedError({ description: `${options.name} gives no ${what}` })));

  return {
    id: options.id,
    name: options.name,
    docs: options.docs,
    auth: options.auth,
    provides: [
      ...(options.models === undefined ? [] : ["models" as const]),
      ...(options.sandboxes === undefined ? [] : ["sandboxes" as const]),
      ...(options.tools === undefined ? [] : ["tools" as const]),
    ],
    models: options.models?.listed ?? [],

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
