/**
 * An MCP server as a tool source, reached over Streamable HTTP with an HTTP client the caller has
 * already given the credentials the server asks for, so no credential enters this package. The
 * source asks the server for its tools and runs them, and nothing else of MCP: resources, prompts,
 * and the requests a server makes of its client are left out.
 *
 * The source speaks the stateless protocol of 2026-07-28 to a server that does, and otherwise the
 * protocol with sessions that older servers speak, which starts with `initialize`. It finds out
 * which when it first needs the server, and again when the server ends a session.
 */
import { Data, Effect, Option, Ref, Schema, Semaphore, Stream } from "effect";
import { McpSchema } from "effect/ai";
import { Sse } from "effect/encoding";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { ToolDefinition } from "./ToolDefinition.ts";
import type { ToolSource } from "./ToolSource.ts";
import {
  AuthenticationError,
  CallFailedError,
  InvalidInputError,
  InvalidResponseError,
  ToolSourceError,
  UnavailableError,
  UnknownError,
  UnsupportedError,
  type ToolSourceErrorReason,
} from "./ToolSourceError.ts";

export interface Options {
  /** Names the source, as `ToolSource.name` says. */
  readonly name: string;

  readonly url: string;

  /** Sends the requests, with the credentials the server asks for set on every one of them. */
  readonly client: HttpClient.HttpClient;

  /** Tells the server who is asking. */
  readonly clientInfo?: { readonly name: string; readonly version: string };
}

const statelessVersion = "2026-07-28";

/** The protocols with sessions this source speaks, newest first. */
const newestSessionVersion = "2025-11-25";
const sessionVersions = [newestSessionVersion, "2025-06-18", "2025-03-26", "2024-11-05"];

/** How the server is spoken to, which the first request settles. */
type Connection =
  | { readonly _tag: "Stateless" }
  | {
      readonly _tag: "Session";
      readonly protocolVersion: string;

      /** A server may not give one. */
      readonly sessionId: string | undefined;
    };

/** The server has ended the session a request belonged to, so the next request starts another. */
class SessionEnded extends Data.TaggedError("SessionEnded")<{
  readonly connection: Connection;
}> {}

/** What a server answers a request with, as JSON-RPC defines it. */
const Reply = Schema.Struct({
  id: Schema.Union([Schema.String, Schema.Finite, Schema.Null]),
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Finite, message: Schema.String })),
});

const decodeReply = Schema.decodeUnknownEffect(Schema.fromJsonString(Reply));

const Discovered = Schema.Struct({ supportedVersions: Schema.Array(Schema.String) });

const Initialized = Schema.Struct({ protocolVersion: Schema.String });

const Tool = Schema.Struct({
  name: Schema.NonEmptyString,
  title: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  inputSchema: McpSchema.ToolJson,
  annotations: Schema.optionalKey(
    Schema.Struct({
      title: Schema.optionalKey(Schema.String),
      readOnlyHint: Schema.optionalKey(Schema.Boolean),
      destructiveHint: Schema.optionalKey(Schema.Boolean),
      idempotentHint: Schema.optionalKey(Schema.Boolean),
      openWorldHint: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});

const ToolList = Schema.Struct({
  tools: Schema.Array(Tool),
  nextCursor: Schema.optionalKey(Schema.String),
});

const ToolResult = Schema.Struct({
  /** `complete`, or `input_required` when the tool asks the caller for something first. */
  resultType: Schema.optionalKey(Schema.String),
  content: Schema.optionalKey(Schema.Array(Schema.Json)),
  structuredContent: Schema.optionalKey(Schema.Json),
  isError: Schema.optionalKey(Schema.Boolean),
});

const TextBlock = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String });

/** The most pages of tools a server may list before the source takes its cursors for a loop. */
const maxToolPages = 100;

// TODO: End a session with a DELETE when the source is released, and give a request that never
// answers a limit. Both need the source to have a lifetime, which it does not have yet.
/** Makes a source of the tools of the MCP server at `options.url`. */
export const http = Effect.fn("Mcp.http")(function* (options: Options) {
  const { name, url, client } = options;
  const clientInfo = options.clientInfo ?? { name: "amends", version: "0.0.0" };
  const requestCount = yield* Ref.make(0);
  const settledConnection = yield* Ref.make(Option.none<Connection>());
  const settling = yield* Semaphore.make(1);

  const fail = (reason: ToolSourceErrorReason, cause?: unknown) =>
    new ToolSourceError({ source: name, reason, cause });

  const failToReach = (error: HttpClientError.HttpClientError) =>
    fail(
      error.reason._tag === "TransportError"
        ? new UnavailableError({})
        : new UnknownError({ description: error.message }),
      error,
    );

  const failWithStatus = (status: number) => {
    const description = `The server answered ${status}`;
    if (status === 401 || status === 403) return fail(new AuthenticationError({ description }));
    if (status === 408 || status === 429 || status >= 500) {
      return fail(new UnavailableError({ description }));
    }
    return fail(new UnsupportedError({ description }));
  };

  const failWithReply = (error: { readonly code: number; readonly message: string }) => {
    const description = error.message;
    switch (error.code) {
      case McpSchema.INVALID_PARAMS_ERROR_CODE:
        return fail(new InvalidInputError({ description }));
      case McpSchema.METHOD_NOT_FOUND_ERROR_CODE:
      case McpSchema.INVALID_REQUEST_ERROR_CODE:
      case McpSchema.PARSE_ERROR_CODE:
      case McpSchema.HEADER_MISMATCH_ERROR_CODE:
        return fail(new UnsupportedError({ description }));
      default:
        return fail(new UnknownError({ description }));
    }
  };

  /**
   * Sends a JSON-RPC request, or a notification, and returns the response whatever its status,
   * which a client that rejects statuses reports as a failure.
   */
  const post = Effect.fnUntraced(function* (
    connection: Connection,
    method: string,
    params: Readonly<Record<string, Schema.Json>>,
    options?: { readonly id?: number; readonly toolName?: string },
  ) {
    const version = connection._tag === "Stateless" ? statelessVersion : connection.protocolVersion;
    const request = HttpClientRequest.post(url).pipe(
      HttpClientRequest.setHeaders({
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": version,
        ...(connection._tag === "Stateless"
          ? {
              "mcp-method": method,
              // TODO: Encode a name that is not plain ASCII, as the protocol says to.
              ...(options?.toolName === undefined ? {} : { "mcp-name": options.toolName }),
            }
          : connection.sessionId === undefined
            ? {}
            : { "mcp-session-id": connection.sessionId }),
      }),
      HttpClientRequest.bodyJsonUnsafe({
        jsonrpc: "2.0",
        ...(options?.id === undefined ? {} : { id: options.id }),
        method,
        params:
          connection._tag === "Stateless"
            ? {
                ...params,
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": statelessVersion,
                  "io.modelcontextprotocol/clientCapabilities": {},
                  "io.modelcontextprotocol/clientInfo": clientInfo,
                },
              }
            : params,
      }),
    );
    return yield* client.execute(request).pipe(
      Effect.catchReason("HttpClientError", "StatusCodeError", (reason) =>
        Effect.succeed(reason.response),
      ),
      Effect.mapError(failToReach),
    );
  });

  /** Reads the reply to request `id` from a response, which is JSON or a stream of events. */
  const readReply = (response: HttpClientResponse.HttpClientResponse, id: number) => {
    const isStream = (response.headers["content-type"] ?? "").includes("text/event-stream");
    // Whatever fails to be read is reported as one failure, so the errors are not told apart.
    const replies: Stream.Stream<typeof Reply.Type, unknown> = isStream
      ? response.stream.pipe(
          Stream.decodeText(),
          Stream.pipeThroughChannel(Sse.decode()),
          Stream.map((event) => event.data),
          Stream.filter((data) => data.length > 0),
          Stream.mapEffect((data) => Effect.option(decodeReply(data))),
          Stream.filter(Option.isSome),
          Stream.map((reply) => reply.value),
        )
      : Stream.fromEffect(Effect.flatMap(response.text, decodeReply));
    return replies.pipe(
      // A message that is no reply to this request, such as a notification, is not for the source.
      // A server that cannot tell which request failed gives the failure no id, as JSON-RPC says.
      Stream.filter(
        (reply) =>
          (reply.id === id && (reply.result !== undefined || reply.error !== undefined)) ||
          (reply.id === null && reply.error !== undefined),
      ),
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(fail(new InvalidResponseError({ description: "No reply" }))),
          onSome: Effect.succeed,
        }),
      ),
      Effect.mapError((error) =>
        error instanceof ToolSourceError
          ? error
          : fail(new InvalidResponseError({ description: "The reply is not JSON-RPC" }), error),
      ),
    );
  };

  /** Reads what the response to request `id` says: its result, or the failure it reports. */
  const readResult = Effect.fnUntraced(function* (
    response: HttpClientResponse.HttpClientResponse,
    id: number,
  ) {
    if (response.status === 401 || response.status === 403) {
      return yield* failWithStatus(response.status);
    }
    const reply = yield* readReply(response, id).pipe(
      // A server that fails a request without a reply, or an HTTP error, is read by its status.
      Effect.catchIf(
        () => response.status >= 400,
        () => Effect.fail(failWithStatus(response.status)),
      ),
    );
    if (reply.error !== undefined) return yield* failWithReply(reply.error);
    return reply.result ?? null;
  });

  /** Sends a request and decodes its result, as the server's reply to it has it. */
  const exchange = Effect.fnUntraced(function* <A, I>(
    schema: Schema.Codec<A, I>,
    connection: Connection,
    method: string,
    params: Readonly<Record<string, Schema.Json>>,
    options?: { readonly toolName?: string },
  ) {
    const id = yield* Ref.updateAndGet(requestCount, (count) => count + 1);
    const response = yield* post(connection, method, params, { ...options, id });
    if (response.status === 404 && connection._tag === "Session" && connection.sessionId) {
      return yield* new SessionEnded({ connection });
    }
    const result = yield* readResult(response, id);
    return yield* Schema.decodeUnknownEffect(schema)(result).pipe(
      Effect.mapError((error) =>
        fail(
          new InvalidResponseError({ description: `The result of ${method} is not as expected` }),
          error,
        ),
      ),
    );
  });

  /** Starts a session with a server that has them. */
  const initialize = Effect.gen(function* () {
    const unstarted: Connection = {
      _tag: "Session",
      protocolVersion: newestSessionVersion,
      sessionId: undefined,
    };
    const params = { protocolVersion: newestSessionVersion, capabilities: {}, clientInfo };
    const id = yield* Ref.updateAndGet(requestCount, (count) => count + 1);
    const response = yield* post(unstarted, "initialize", params, { id });
    const answer = yield* readResult(response, id).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Initialized)),
      Effect.mapError((error) =>
        error instanceof ToolSourceError
          ? error
          : fail(
              new InvalidResponseError({
                description: "The result of initialize is not as expected",
              }),
              error,
            ),
      ),
    );
    if (!sessionVersions.includes(answer.protocolVersion)) {
      return yield* fail(
        new UnsupportedError({
          description: `The server speaks ${answer.protocolVersion}, which is not supported`,
        }),
      );
    }
    const connection: Connection = {
      _tag: "Session",
      protocolVersion: answer.protocolVersion,
      sessionId: response.headers["mcp-session-id"],
    };
    const acknowledged = yield* post(connection, "notifications/initialized", {});
    if (acknowledged.status >= 400) return yield* failWithStatus(acknowledged.status);
    return connection;
  });

  /** Finds out how the server is spoken to: statelessly if it says it can be, or else with sessions. */
  const settleConnection = Effect.gen(function* () {
    const stateless: Connection = { _tag: "Stateless" };
    const isStateless = yield* exchange(Discovered, stateless, "server/discover", {}).pipe(
      Effect.map((discovered) => discovered.supportedVersions.includes(statelessVersion)),
      // A stateless request carries no session, so none can have ended.
      Effect.catchTag("SessionEnded", () => Effect.succeed(false)),
      // A server that is not reached, or does not let the source in, would not answer `initialize`
      // either. Any other failure is one an older server gives to a method it does not know.
      Effect.catchIf(
        (error) =>
          error.reason._tag !== "AuthenticationError" && error.reason._tag !== "UnavailableError",
        () => Effect.succeed(false),
      ),
    );
    return isStateless ? stateless : yield* initialize;
  });

  const connection = settling.withPermit(
    Ref.get(settledConnection).pipe(
      Effect.flatMap(
        Option.match({
          onSome: Effect.succeed,
          onNone: () =>
            settleConnection.pipe(
              Effect.tap((settled) => Ref.set(settledConnection, Option.some(settled))),
            ),
        }),
      ),
    ),
  );

  /** Forgets `ended`, unless another request has already settled a new connection. */
  const forgetConnection = (ended: Connection) =>
    Ref.update(
      settledConnection,
      Option.filter((current) => current !== ended),
    );

  /** Sends a request over the connection, which it settles first, and starts another if it ended. */
  const request = <A, I>(
    schema: Schema.Codec<A, I>,
    method: string,
    params: Readonly<Record<string, Schema.Json>>,
    options?: { readonly toolName?: string },
  ): Effect.Effect<A, ToolSourceError> => {
    const attempt = connection.pipe(
      Effect.flatMap((settled) => exchange(schema, settled, method, params, options)),
    );
    return attempt.pipe(
      Effect.catchTag("SessionEnded", (ended) =>
        forgetConnection(ended.connection).pipe(
          Effect.andThen(attempt),
          Effect.catchTag("SessionEnded", () =>
            Effect.fail(
              fail(new UnavailableError({ description: "The server keeps ending the session" })),
            ),
          ),
        ),
      ),
    );
  };

  const listTools = (
    cursor: string | undefined,
    listed: ReadonlyArray<ToolDefinition>,
    pagesLeft: number,
  ): Effect.Effect<ReadonlyArray<ToolDefinition>, ToolSourceError> =>
    request(ToolList, "tools/list", cursor === undefined ? {} : { cursor }).pipe(
      Effect.flatMap((page) => {
        const tools = [...listed, ...page.tools.map(definitionOf)];
        if (page.nextCursor === undefined) return Effect.succeed(tools);
        return pagesLeft > 1
          ? listTools(page.nextCursor, tools, pagesLeft - 1)
          : Effect.fail(
              fail(new InvalidResponseError({ description: "The tool list does not end" })),
            );
      }),
    );

  const source: ToolSource = {
    name,
    discover: listTools(undefined, [], maxToolPages),
    call: (tool, input) =>
      request(ToolResult, "tools/call", { name: tool, arguments: input }, { toolName: tool }).pipe(
        Effect.flatMap((result) => resultOf(result, fail)),
      ),
  };
  return source;
});

/** The definition of a tool as an MCP server lists it. */
const definitionOf = (tool: typeof Tool.Type): ToolDefinition => {
  const hints = tool.annotations;
  const title = hints?.title ?? tool.title;
  return {
    name: tool.name,
    ...(tool.description === undefined ? {} : { description: tool.description }),
    inputSchema: tool.inputSchema,
    annotations: {
      ...(title === undefined ? {} : { title }),
      ...(hints?.readOnlyHint === undefined ? {} : { readOnly: hints.readOnlyHint }),
      ...(hints?.destructiveHint === undefined ? {} : { destructive: hints.destructiveHint }),
      ...(hints?.idempotentHint === undefined ? {} : { idempotent: hints.idempotentHint }),
      ...(hints?.openWorldHint === undefined ? {} : { openWorld: hints.openWorldHint }),
    },
  };
};

/**
 * What a tool answers with: the structured content when it has some, or else the content blocks,
 * which MCP leaves as the tool wrote them. A tool that reports a failure is a failed call, with what
 * it said as text.
 */
const resultOf = (
  result: typeof ToolResult.Type,
  fail: (reason: ToolSourceErrorReason) => ToolSourceError,
) => {
  if (result.resultType === "input_required") {
    return Effect.fail(
      fail(
        new UnsupportedError({ description: "The tool asks for input, which is not supported" }),
      ),
    );
  }
  if (result.isError === true) {
    const said = (result.content ?? []).filter(Schema.is(TextBlock)).map((block) => block.text);
    return Effect.fail(
      fail(new CallFailedError(said.length === 0 ? {} : { description: said.join("\n") })),
    );
  }
  return Effect.succeed(result.structuredContent ?? result.content ?? []);
};
