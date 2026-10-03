/**
 * The Agent Client Protocol's transport: JSON-RPC 2.0 messages, one per line, over an agent
 * process's standard input and output. This side is the client: it sends requests and
 * notifications, and answers the requests the agent sends it. Messages from the agent are handled
 * one at a time, in the order they arrive, so the answer to a request is seen only after every
 * notification the agent sent before it.
 */
import { Deferred, Effect, Fiber, Queue, Schema, Stream } from "effect";
import type { Cause, Sink } from "effect";

/** The agent answered a request with an error. */
export class RequestFailed extends Schema.TaggedError<RequestFailed>()(
  "AcpConnection.RequestFailed",
  { method: Schema.String, code: Schema.Int, message: Schema.String },
) {}

/** The agent's output ended, so nothing more will be answered. */
export class Closed extends Schema.TaggedError<Closed>()("AcpConnection.Closed", {
  message: Schema.String,
}) {}

const Message = Schema.Struct({
  id: Schema.optional(Schema.Union([Schema.Finite, Schema.String, Schema.Null])),
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Struct({ code: Schema.Int, message: Schema.String })),
});
const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(Message));

/** How the client handles what the agent sends unasked. */
export interface Handlers {
  /** A notification, such as `session/update`. */
  readonly notification: (method: string, params: unknown) => Effect.Effect<void>;
  /** A request, answered with what this returns, or refused when it fails. */
  readonly request: (method: string, params: unknown) => Effect.Effect<unknown, RequestFailed>;
}

export interface Connection {
  /** Send a request and wait for its answer. */
  readonly request: (
    method: string,
    params: unknown,
  ) => Effect.Effect<unknown, RequestFailed | Closed>;
  /** Send a notification, which has no answer. */
  readonly notify: (method: string, params: unknown) => Effect.Effect<void>;
}

/** The agent's process, as the connection reads and writes it. */
export interface Agent<E> {
  readonly stdin: Sink.Sink<void, Uint8Array, never, E>;
  readonly stdout: Stream.Stream<Uint8Array, E>;
}

/** Speak ACP with the agent over its standard input and output for the scope's lifetime. */
export const make = Effect.fnUntraced(function* <E>(agent: Agent<E>, handlers: Handlers) {
  const outgoing = yield* Queue.unbounded<string, Cause.Done>();
  const pending = new Map<
    number,
    { readonly method: string; readonly answer: Deferred.Deferred<unknown, RequestFailed | Closed> }
  >();
  let closed: Closed | undefined;
  let nextId = 0;

  const send = (message: object) =>
    Queue.offer(outgoing, `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const writer = yield* Stream.fromQueue(outgoing).pipe(
    Stream.encodeText,
    Stream.run(agent.stdin),
    Effect.ignore,
    Effect.forkScoped,
  );
  // Ending its input is how a client tells the agent it is done: what was sent goes first.
  yield* Effect.addFinalizer(() => Queue.end(outgoing).pipe(Effect.andThen(Fiber.await(writer))));

  /** Nothing more will be answered: fail every request still waiting. */
  const close = (message: string) =>
    Effect.suspend(() => {
      closed = new Closed({ message });
      const waiting = [...pending.values()];
      pending.clear();
      return Effect.forEach(waiting, ({ answer }) => Deferred.fail(answer, closed!), {
        discard: true,
      });
    });

  const answerRequest = (id: string | number, method: string, params: unknown) =>
    handlers.request(method, params).pipe(
      Effect.matchEffect({
        onFailure: (failure) =>
          send({ id, error: { code: failure.code, message: failure.message } }),
        onSuccess: (result) => send({ id, result }),
      }),
    );

  const receive = (line: string) =>
    Effect.suspend(() => {
      const decoded = decodeMessage(line);
      if (decoded._tag === "None") return Effect.void;
      const { id, method, params, result, error } = decoded.value;
      if (method !== undefined)
        return id === undefined || id === null
          ? handlers.notification(method, params)
          : answerRequest(id, method, params);
      const request = typeof id === "number" ? pending.get(id) : undefined;
      if (request === undefined) return Effect.void;
      pending.delete(id as number);
      return error === undefined
        ? Deferred.succeed(request.answer, result)
        : Deferred.fail(
            request.answer,
            new RequestFailed({ method: request.method, code: error.code, message: error.message }),
          );
    });

  yield* agent.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach(receive),
    Effect.matchCauseEffect({
      onFailure: () => close("The agent's output failed."),
      onSuccess: () => close("The agent's output ended."),
    }),
    Effect.forkScoped,
  );

  const request = (method: string, params: unknown) =>
    Effect.suspend(() => {
      if (closed !== undefined) return Effect.fail(closed);
      const id = nextId++;
      return Deferred.make<unknown, RequestFailed | Closed>().pipe(
        Effect.tap((answer) => {
          pending.set(id, { method, answer });
          return send({ id, method, params });
        }),
        Effect.flatMap(Deferred.await),
        Effect.onInterrupt(() => Effect.sync(() => pending.delete(id))),
      );
    });

  return {
    request,
    notify: (method, params) => send({ method, params }).pipe(Effect.asVoid),
  } satisfies Connection;
});

export * as AcpConnection from "./connection.ts";
