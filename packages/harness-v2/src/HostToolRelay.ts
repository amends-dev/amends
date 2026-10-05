/**
 * How an agent that works in a sandbox calls the host's tools. The agent is given the relay as an
 * MCP server on the sandbox's loopback, and a token of its own for each session. The tools the server
 * lists are those of the turn the session runs, and each call the agent makes becomes a `tool-call`
 * part of that turn, which the host runs as it runs any host tool and answers with
 * `submitToolResult`. The relay answers the agent's request with the result. While it waits, for
 * the host or for a person's approval, it keeps the request alive with progress notifications, which
 * an agent that has a time limit for a request takes as a sign of life.
 *
 * Only the host runs the tools, so nothing they need reaches the sandbox. A session's token lets
 * the agent ask the host to run that session's tools, which the host's toolkit and approvals still
 * decide.
 *
 * `make` is the relay without a transport: it answers the MCP messages it is given. `layer` serves
 * it over the `HttpServer` provided, and is what a bridge program uses. A call waits for the host
 * for as long as an approval takes, so the server must not close a connection for being idle, as
 * Bun's does after ten seconds unless its `idleTimeout` is 0.
 */
import {
  type Cause,
  Crypto,
  Data,
  Deferred,
  type Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  Queue,
  Redacted,
  Ref,
  Schema,
  type Scope,
  Stream,
} from "effect";
import { Context } from "effect";
import { Hex } from "effect/encoding";
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { NetAddress } from "effect/net";
import type { AgentSession, SessionId } from "./Agent.ts";
import type { ToolDefinition } from "./Bridge.ts";
import { isPresented } from "./internal/bearer.ts";
import type { StreamPart } from "./StreamPart.ts";

export interface Options {
  /** How often a request that waits for the host hears from the relay. Ten seconds by default. */
  readonly heartbeat?: Duration.Input;

  /**
   * The longest the relay waits for the host to answer a call, which an approval a person has not
   * given yet counts in. The agent reads the call as failed after it. An hour by default.
   */
  readonly maxWait?: Duration.Input;
}

/** A session of an agent, as far as the relay knows it. */
export interface RelaySession {
  /** What the agent's MCP client presents as `Authorization: Bearer`. It names this session. */
  readonly token: Redacted.Redacted<string>;

  /**
   * Offers `tools` to the agent for the turn that the scope given runs, and returns the parts that
   * stream the calls the agent makes of them, until the scope closes. A call the agent makes when no
   * turn runs, or of a tool the turn did not offer, fails. The tools stay listed after the turn.
   */
  readonly offerTools: (
    tools: ReadonlyArray<ToolDefinition>,
  ) => Effect.Effect<Stream.Stream<StreamPart>, never, Scope.Scope>;

  /**
   * Gives the agent the result of a call it made. A result for a call the agent has given up on, or
   * that the end of the turn ended, is dropped, since nothing waits for it.
   */
  readonly submitToolResult: AgentSession["submitToolResult"];
}

/** What the relay answers one MCP message with. */
export type Answer = Data.TaggedEnum<{
  /** The message names no session the relay has. */
  Unauthorized: {};

  /** A notification, which has no reply. */
  Accepted: {};

  Reply: { readonly message: Schema.Json };

  /** The messages a call is answered with, as they happen: its progress, and then its result. */
  Events: { readonly messages: Stream.Stream<Schema.Json> };
}>;

export const Answer = Data.taggedEnum<Answer>();

export interface Relay {
  /** Starts a session, which lasts until the scope given closes. */
  readonly open: (id: SessionId) => Effect.Effect<RelaySession, never, Scope.Scope>;

  /**
   * Answers an MCP message, as the HTTP request that carried it, with its `Authorization` header and
   * its body, is answered.
   */
  readonly answer: (authorization: string | undefined, message: unknown) => Effect.Effect<Answer>;
}

export class HostToolRelay extends Context.Service<
  HostToolRelay,
  {
    /** Where the agent's MCP client connects, on this machine only. */
    readonly url: string;

    readonly open: Relay["open"];
  }
>()("@amends/harness-v2/HostToolRelay") {}

/** The protocols of MCP the relay speaks, newest first. */
const protocolVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const newestProtocolVersion = "2025-11-25";

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const RequestId = Schema.Union([Schema.String, Schema.Finite]);

type RequestId = typeof RequestId.Type;

const Message = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optional(RequestId),
  method: Schema.String,
  params: Schema.optional(Schema.Json),
});

const InitializeParams = Schema.Struct({ protocolVersion: Schema.optional(Schema.String) });

const CallParams = Schema.Struct({
  name: Schema.String,
  arguments: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  _meta: Schema.optional(
    Schema.Struct({ progressToken: Schema.optional(Schema.Union([Schema.String, Schema.Finite])) }),
  ),
});

const CancelledParams = Schema.Struct({ requestId: Schema.optional(RequestId) });

/** What the host answered a call with. */
interface Outcome {
  readonly result: unknown;
  readonly isFailure: boolean;
}

/** A call of a tool that the host has not answered yet. */
interface PendingCall {
  /** The JSON-RPC id of the agent's request, which a cancellation names. */
  readonly requestId: RequestId;
  readonly answered: Deferred.Deferred<Outcome>;
}

interface Entry {
  readonly token: string;

  /** The tools of the last turn, which the agent lists. */
  readonly tools: Ref.Ref<ReadonlyArray<ToolDefinition>>;

  /** Where the calls of the running turn go: absent when no turn runs. */
  readonly calls: Ref.Ref<Option.Option<Queue.Queue<StreamPart, Cause.Done>>>;

  /** The calls the agent waits on, by the id the host knows each by. */
  readonly pending: Ref.Ref<HashMap.HashMap<string, PendingCall>>;
}

/** Makes the relay, which answers MCP messages without a transport. */
export const make = Effect.fn("HostToolRelay.make")(function* (options?: Options) {
  const crypto = yield* Crypto.Crypto;
  const heartbeat = options?.heartbeat ?? "10 seconds";
  const maxWait = options?.maxWait ?? "1 hour";
  const entries = yield* Ref.make<ReadonlyArray<Entry>>([]);

  const open: Relay["open"] = Effect.fnUntraced(function* (_id) {
    const token = Hex.encode(yield* Effect.orDie(crypto.randomBytes(32)));
    const entry: Entry = {
      token,
      tools: yield* Ref.make<ReadonlyArray<ToolDefinition>>([]),
      calls: yield* Ref.make(Option.none<Queue.Queue<StreamPart, Cause.Done>>()),
      pending: yield* Ref.make(HashMap.empty<string, PendingCall>()),
    };
    yield* Effect.acquireRelease(
      Ref.update(entries, (current) => [...current, entry]),
      () => Ref.update(entries, (current) => current.filter((other) => other !== entry)),
    );
    const session: RelaySession = {
      token: Redacted.make(token),
      offerTools: (tools) => offerTools(entry, tools),
      submitToolResult: ({ id, result, isFailure }) => answerCall(entry, id, { result, isFailure }),
    };
    return session;
  });

  const answer: Relay["answer"] = Effect.fnUntraced(function* (authorization, message) {
    const found = yield* Ref.get(entries).pipe(
      Effect.map((current) =>
        current.find((entry) => isPresented(authorization, `Bearer ${entry.token}`)),
      ),
    );
    if (found === undefined) return Answer.Unauthorized();
    const request = yield* Schema.decodeUnknownEffect(Message)(message).pipe(Effect.option);
    if (Option.isNone(request)) {
      return Answer.Reply({ message: failure(null, INVALID_REQUEST, "Not a JSON-RPC request") });
    }
    const { id, method, params } = request.value;
    if (id === undefined) {
      if (method === "notifications/cancelled") yield* cancel(found, params);
      return Answer.Accepted();
    }
    switch (method) {
      case "initialize":
        return Answer.Reply({ message: yield* initialize(id, params) });
      case "ping":
        return Answer.Reply({ message: success(id, {}) });
      case "tools/list":
        return Answer.Reply({ message: success(id, { tools: yield* listTools(found) }) });
      case "tools/call":
        return yield* call(found, id, params);
      default:
        return Answer.Reply({
          message: failure(id, METHOD_NOT_FOUND, `The relay has no method ${method}`),
        });
    }
  });

  const initialize = Effect.fnUntraced(function* (id: RequestId, params: Schema.Json | undefined) {
    const asked = yield* Schema.decodeUnknownEffect(InitializeParams)(params).pipe(Effect.option);
    const requested = Option.flatMapNullishOr(asked, (it) => it.protocolVersion);
    const protocolVersion = Option.filter(requested, (version) =>
      protocolVersions.includes(version),
    ).pipe(Option.getOrElse(() => newestProtocolVersion));
    return success(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "amends-host-tools", version: "1" },
    });
  });

  const listTools = (entry: Entry) =>
    Effect.map(Ref.get(entry.tools), (tools) =>
      tools.map((tool) => ({
        name: tool.name,
        ...(tool.description === undefined ? {} : { description: tool.description }),
        inputSchema: isObject(tool.parameters) ? tool.parameters : { type: "object" },
      })),
    );

  /** Ends the call the agent cancelled, if the relay still waits on it. */
  const cancel = Effect.fnUntraced(function* (entry: Entry, params: Schema.Json | undefined) {
    const cancelled = yield* Schema.decodeUnknownEffect(CancelledParams)(params).pipe(
      Effect.option,
    );
    const requestId = Option.flatMapNullishOr(cancelled, (it) => it.requestId);
    if (Option.isNone(requestId)) return;
    const pending = yield* Ref.get(entry.pending);
    for (const call of HashMap.values(pending)) {
      if (call.requestId === requestId.value) {
        yield* Deferred.succeed(call.answered, failed("The call was cancelled"));
      }
    }
  });

  const call = Effect.fnUntraced(function* (
    entry: Entry,
    requestId: RequestId,
    params: Schema.Json | undefined,
  ) {
    const decoded = yield* Schema.decodeUnknownEffect(CallParams)(params).pipe(Effect.option);
    if (Option.isNone(decoded)) {
      return Answer.Reply({ message: failure(requestId, INVALID_PARAMS, "Invalid tool call") });
    }
    const { name, _meta } = decoded.value;
    const running = yield* Ref.get(entry.calls);
    const offered = (yield* Ref.get(entry.tools)).some((tool) => tool.name === name);
    if (Option.isNone(running)) {
      return Answer.Reply({ message: toolResult(requestId, failed("No turn is running")) });
    }
    if (!offered) {
      return Answer.Reply({
        message: toolResult(requestId, failed(`The tool ${name} is not offered`)),
      });
    }

    const callId = yield* Effect.orDie(crypto.randomUUIDv4);
    const answered = yield* Deferred.make<Outcome>();
    yield* Ref.update(entry.pending, HashMap.set(callId, { requestId, answered }));
    yield* Queue.offer(running.value, {
      type: "tool-call",
      id: callId,
      name,
      params: decoded.value.arguments ?? {},
    });

    const outcome = Deferred.await(answered).pipe(
      Effect.timeoutOption(maxWait),
      Effect.map(Option.getOrElse(() => failed("The host did not answer in time"))),
      Effect.map((it) => toolResult(requestId, it)),
    );
    const progressToken = _meta?.progressToken;
    const progress: Stream.Stream<Schema.Json> =
      progressToken === undefined
        ? Stream.never
        : Stream.tick(heartbeat).pipe(
            Stream.zipWithIndex,
            Stream.map(([, count]) => progressMessage(progressToken, count + 1)),
          );
    return Answer.Events({
      // The request ends with its result; the call is no longer waited on however it ends.
      messages: Stream.merge(progress, Stream.fromEffect(outcome), { haltStrategy: "right" }).pipe(
        Stream.ensuring(Ref.update(entry.pending, HashMap.remove(callId))),
      ),
    });
  });

  const offerTools = Effect.fnUntraced(function* (
    entry: Entry,
    tools: ReadonlyArray<ToolDefinition>,
  ) {
    const queue = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const calls = yield* Queue.unbounded<StreamPart, Cause.Done>();
        yield* Ref.set(entry.tools, tools);
        yield* Ref.set(entry.calls, Option.some(calls));
        return calls;
      }),
      // The agent waits on no call of a turn that is over.
      (calls) =>
        Effect.gen(function* () {
          yield* Ref.set(entry.calls, Option.none());
          const pending = yield* Ref.get(entry.pending);
          for (const call of HashMap.values(pending)) {
            yield* Deferred.succeed(call.answered, failed("The turn ended"));
          }
          yield* Queue.end(calls);
        }),
    );
    return Stream.fromQueue(queue);
  });

  const answerCall = (entry: Entry, id: string, outcome: Outcome) =>
    Effect.gen(function* () {
      const pending = HashMap.get(yield* Ref.get(entry.pending), id);
      if (Option.isSome(pending)) yield* Deferred.succeed(pending.value.answered, outcome);
    });

  const relay: Relay = { open, answer };
  return relay;
});

/** Serves the relay over the `HttpServer` provided, on that server's own address. */
export const layer = (options?: Options) =>
  Layer.effect(HostToolRelay)(
    Effect.gen(function* () {
      const relay = yield* make(options);
      const server = yield* HttpServer.HttpServer;
      const address = server.address;
      if (NetAddress.isUnixPathAddress(address)) {
        return yield* Effect.die(new Error("The host tool relay needs a server on a TCP port"));
      }
      yield* Layer.build(
        HttpRouter.serve(
          Layer.mergeAll(
            HttpRouter.add("POST", path, (request) =>
              request.json.pipe(
                Effect.matchEffect({
                  onFailure: () =>
                    Effect.succeed(
                      HttpServerResponse.jsonUnsafe(failure(null, -32700, "Not JSON"), {
                        status: 400,
                      }),
                    ),
                  onSuccess: (body) =>
                    Effect.map(relay.answer(request.headers.authorization, body), respond),
                }),
              ),
            ),
            // A client that asks for a stream of notifications is told the relay has none.
            HttpRouter.add("GET", path, () =>
              Effect.succeed(HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })),
            ),
          ),
          { disableLogger: true },
        ),
      );
      return HostToolRelay.of({
        url: `http://127.0.0.1:${address.port}${path}`,
        open: relay.open,
      });
    }),
  );

const path = "/mcp";

/** The HTTP response that carries `answer`. */
const respond = (answer: Answer) =>
  Answer.$match(answer, {
    Unauthorized: () => HttpServerResponse.empty({ status: 401 }),
    Accepted: () => HttpServerResponse.empty({ status: 202 }),
    Reply: ({ message }) => HttpServerResponse.jsonUnsafe(message),
    Events: ({ messages }) =>
      HttpServerResponse.stream(
        messages.pipe(
          Stream.map((message) => `event: message\ndata: ${JSON.stringify(message)}\n\n`),
          Stream.encodeText,
        ),
        { contentType: "text/event-stream", headers: { "cache-control": "no-cache" } },
      ),
  });

const isObject = (json: Schema.Json): json is Schema.JsonObject =>
  typeof json === "object" && json !== null && !Array.isArray(json);

const success = (id: RequestId, result: Schema.Json): Schema.Json => ({
  jsonrpc: "2.0",
  id,
  result,
});

const failure = (id: RequestId | null, code: number, message: string): Schema.Json => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const progressMessage = (token: string | number, progress: number): Schema.Json => ({
  jsonrpc: "2.0",
  method: "notifications/progress",
  params: { progressToken: token, progress },
});

const failed = (message: string): Outcome => ({ result: message, isFailure: true });

/**
 * The result of a tool call, as MCP has it: the host's result as text, which the agent's model
 * reads, and `isError` when the host reports a failure.
 */
const toolResult = (id: RequestId, outcome: Outcome): Schema.Json =>
  success(id, {
    content: [{ type: "text", text: textOf(outcome) }],
    ...(outcome.isFailure ? { isError: true } : {}),
  });

/** What a host reports of a call that failed, which the model reads in place of the result. */
const Reported = Schema.Union([
  Schema.Struct({ message: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("execution-denied"),
    reason: Schema.optional(Schema.String),
  }),
]);

/**
 * What the model reads of an outcome: a text as it is, a failure by its message, or by the reason a
 * call was refused, and any other result as JSON.
 */
const textOf = ({ result, isFailure }: Outcome): string => {
  if (typeof result === "string") return result;
  if (isFailure) {
    const reported = Schema.decodeUnknownOption(Reported)(result);
    if (Option.isSome(reported)) {
      return "message" in reported.value
        ? reported.value.message
        : (reported.value.reason ?? "The call was refused");
    }
  }
  return JSON.stringify(result) ?? "";
};
