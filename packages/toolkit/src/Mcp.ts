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
import { Data, Effect, Option, Ref, Result, Schema, Semaphore, Stream } from "effect";
import { McpSchema } from "effect/ai";
import { Sse } from "effect/encoding";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";
import * as McpHeaders from "./McpHeaders.ts";
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

/**
 * The server says that the headers of a request do not match its body, which a call of a tool that
 * the source sent without the headers its parameters need is answered with, when the source did not
 * know them.
 */
class HeaderMismatch extends Data.TaggedError("HeaderMismatch")<{
  readonly description: string;
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
    options?: {
      readonly id?: number;
      readonly toolName?: string;

      /** The headers that mirror parameters of the tool, which only the stateless protocol has. */
      readonly headers?: Readonly<Record<string, string>>;
    },
  ) {
    const version = connection._tag === "Stateless" ? statelessVersion : connection.protocolVersion;
    const request = HttpClientRequest.post(url).pipe(
      HttpClientRequest.setHeaders({
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": version,
        ...(connection._tag === "Stateless"
          ? {
              "mcp-method": method,
              ...(options?.toolName === undefined
                ? {}
                : { "mcp-name": McpHeaders.encodeHeaderValue(options.toolName) }),
              ...options?.headers,
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

  /** Reads the reply to request `id` from a response, which a status the server gave may stand for. */
  const receiveReply = Effect.fnUntraced(function* (
    response: HttpClientResponse.HttpClientResponse,
    id: number,
  ) {
    if (response.status === 401 || response.status === 403) {
      return yield* failWithStatus(response.status);
    }
    return yield* readReply(response, id).pipe(
      // A server that fails a request without a reply, or an HTTP error, is read by its status.
      Effect.catchIf(
        () => response.status >= 400,
        () => Effect.fail(failWithStatus(response.status)),
      ),
    );
  });

  /** What a reply says: its result, or the failure it reports. */
  const resultOfReply = (reply: typeof Reply.Type) =>
    reply.error === undefined ? Effect.succeed(reply.result ?? null) : failWithReply(reply.error);

  /** Fails a call that the server says has headers that do not match, and has no others to send. */
  const refuseMismatch = (mismatch: HeaderMismatch) =>
    Effect.fail(fail(new UnsupportedError({ description: mismatch.description })));

  /**
   * Sends a request and decodes its result, as the server's reply to it has it. A server that finds
   * that the headers do not match the body says so as `HeaderMismatch`, which a caller that can send
   * other headers may act on.
   */
  const exchange = Effect.fnUntraced(function* <A, I>(
    schema: Schema.Codec<A, I>,
    connection: Connection,
    method: string,
    params: Readonly<Record<string, Schema.Json>>,
    options?: {
      readonly toolName?: string;
      readonly headers?: Readonly<Record<string, string>>;
    },
  ) {
    const id = yield* Ref.updateAndGet(requestCount, (count) => count + 1);
    const response = yield* post(connection, method, params, { ...options, id });
    if (response.status === 404 && connection._tag === "Session" && connection.sessionId) {
      return yield* new SessionEnded({ connection });
    }
    const reply = yield* receiveReply(response, id);
    if (reply.error?.code === McpSchema.HEADER_MISMATCH_ERROR_CODE) {
      return yield* new HeaderMismatch({ description: reply.error.message });
    }
    const result = yield* resultOfReply(reply);
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
    const answer = yield* receiveReply(response, id).pipe(
      Effect.flatMap(resultOfReply),
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
      Effect.catchTag("HeaderMismatch", refuseMismatch),
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

  /**
   * Sends a request over the connection, which it settles first, and starts another if it ended. A
   * `HeaderMismatch` is left for the caller.
   */
  const request = <A, I>(
    schema: Schema.Codec<A, I>,
    method: string,
    params: Readonly<Record<string, Schema.Json>>,
    options?: {
      readonly toolName?: string;
      readonly headers?: Readonly<Record<string, string>>;
    },
  ): Effect.Effect<A, ToolSourceError | HeaderMismatch> => {
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

  const listPages = (
    cursor: string | undefined,
    listed: ReadonlyArray<typeof Tool.Type>,
    pagesLeft: number,
  ): Effect.Effect<ReadonlyArray<typeof Tool.Type>, ToolSourceError> =>
    request(ToolList, "tools/list", cursor === undefined ? {} : { cursor }).pipe(
      Effect.catchTag("HeaderMismatch", refuseMismatch),
      Effect.flatMap((page) => {
        const tools = [...listed, ...page.tools];
        if (page.nextCursor === undefined) return Effect.succeed(tools);
        return pagesLeft > 1
          ? listPages(page.nextCursor, tools, pagesLeft - 1)
          : Effect.fail(
              fail(new InvalidResponseError({ description: "The tool list does not end" })),
            );
      }),
    );

  /** The parameters of each tool that is sent as a header too, as of the last time they were listed. */
  const listedBindings = yield* Ref.make<ReadonlyMap<string, ReadonlyArray<McpHeaders.Binding>>>(
    new Map(),
  );

  /**
   * Asks the server for its tools, and remembers which of their parameters are sent as headers, so
   * that a call can send them. A tool that a client may not use, because of what it marks, is left
   * out and logged.
   */
  const listTools = Effect.gen(function* () {
    const tools = yield* listPages(undefined, [], maxToolPages);
    const settled = yield* connection;
    const { usable, refused } = sortTools(tools, settled._tag === "Stateless");
    for (const { tool, reason } of refused) {
      yield* Effect.logWarning(`Leaving out the tool ${tool.name} of ${name}: ${reason}`);
    }
    yield* Ref.set(
      listedBindings,
      new Map(usable.map(({ tool, bindings }) => [tool.name, bindings])),
    );
    return usable.map(({ tool }) => definitionOf(tool));
  });

  const headersOfCall = (
    bindings: ReadonlyMap<string, ReadonlyArray<McpHeaders.Binding>>,
    tool: string,
    input: Schema.JsonObject,
  ) => McpHeaders.headersOf(bindings.get(tool) ?? [], input);

  /**
   * Runs a tool. A server may refuse a call that does not send the parameters its tool marks as
   * headers, so the call sends what the last listing says, and a source that has not listed the
   * tools, or a server whose tools have changed, is told so by the server: it lists the tools again,
   * and sends the call once more with the headers they ask for, if those are other headers.
   */
  const callTool = Effect.fnUntraced(function* (tool: string, input: Schema.JsonObject) {
    const send = (headers: Readonly<Record<string, string>>) =>
      request(
        ToolResult,
        "tools/call",
        { name: tool, arguments: input },
        { toolName: tool, headers },
      );
    const settled = yield* connection;
    const sent =
      settled._tag === "Stateless"
        ? headersOfCall(yield* Ref.get(listedBindings), tool, input)
        : {};
    return yield* send(sent).pipe(
      Effect.catchTag("HeaderMismatch", (mismatch) =>
        Effect.gen(function* () {
          // Only the stateless protocol has headers to send.
          if (settled._tag !== "Stateless") return yield* mismatch;
          yield* listTools;
          const listed = headersOfCall(yield* Ref.get(listedBindings), tool, input);
          // The headers that the listing does not change are the ones the server has refused.
          return sameHeaders(sent, listed) ? yield* mismatch : yield* send(listed);
        }),
      ),
      Effect.catchTag("HeaderMismatch", refuseMismatch),
    );
  });

  const source: ToolSource = {
    name,
    discover: listTools,
    call: (tool, input) =>
      callTool(tool, input).pipe(Effect.flatMap((result) => resultOf(result, fail))),
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
 * The tools of a listing that a source may offer, each with the parameters it sends as headers. A
 * client of the stateless protocol may not use a tool that marks its parameters in a way the
 * protocol does not allow, since a server would refuse its calls, and any other protocol has no use
 * for the marks.
 */
const sortTools = (tools: ReadonlyArray<typeof Tool.Type>, sendsParametersAsHeaders: boolean) => {
  const usable: Array<{ tool: typeof Tool.Type; bindings: ReadonlyArray<McpHeaders.Binding> }> = [];
  const refused: Array<{ tool: typeof Tool.Type; reason: string }> = [];
  for (const tool of tools) {
    if (!sendsParametersAsHeaders) {
      usable.push({ tool, bindings: [] });
      continue;
    }
    const found = McpHeaders.findBindings(tool.inputSchema);
    if (Result.isSuccess(found)) usable.push({ tool, bindings: found.success });
    else refused.push({ tool, reason: found.failure });
  }
  return { usable, refused };
};

const sameHeaders = (
  first: Readonly<Record<string, string>>,
  second: Readonly<Record<string, string>>,
) => {
  const names = Object.keys(first);
  return names.length === Object.keys(second).length && names.every((n) => first[n] === second[n]);
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
