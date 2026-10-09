/**
 * How a session runs the host's tools for the agent. A tool starts on the host as soon as the agent
 * calls it, its results stream after the call, and its final result goes to the agent. A tool that
 * needs approval is asked about first: the turn streams a `tool-approval-request` and waits for
 * `approve`, and a refusal is answered as `execution-denied`. `makeSession` makes these for each
 * session; the package does not export this module.
 */
import {
  type Cause,
  Deferred,
  Effect,
  HashMap,
  Option,
  Queue,
  Ref,
  Schema,
  type Scope,
  Stream,
} from "effect";
import type { Prompt, Response, Tool, Toolkit } from "effect/ai";
import type { AgentSession } from "../Agent.ts";
import { AgentContractError, HarnessError, type HarnessErrorReason } from "../HarnessError.ts";
import type { TurnError, TurnServices } from "../Session.ts";
import type { StreamPart } from "../StreamPart.ts";

/** What `approve` answers a request with. */
export type ApprovalResponse = Parameters<AgentSession["approve"]>[0];

/** The host's tools of one session, which answer the calls the agent makes of them. */
export interface HostTools {
  /**
   * The agent's parts, each call of the host's tools followed by the tool's results, or by the
   * request to approve it first. A host's tool starts as soon as the agent calls it, so the tools
   * of calls the agent makes together run side by side, while their results, and the requests to
   * approve them, stream in the order of the calls.
   */
  readonly answerCalls: <Tools extends Record<string, Tool.Any>>(
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ) => Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>>;

  /**
   * Answers the request `response` names, if one of the host's tools waits on it, and says whether
   * one did. A request is answered once.
   */
  readonly answerRequest: (response: ApprovalResponse) => Effect.Effect<boolean>;
}

export const makeHostTools = Effect.fnUntraced(function* (options: {
  /** Names the agent, as its errors do. */
  readonly agent: string;

  /** Gives the agent a tool's final result. */
  readonly submitToolResult: AgentSession["submitToolResult"];

  /** The conversation as the session has recorded it, which a tool's `needsApproval` reads. */
  readonly conversation: Effect.Effect<ReadonlyArray<Prompt.Message>>;
}) {
  const { agent, conversation } = options;
  /**
   * The calls that wait for `approve`, each with the answer its request awaits, by the request's
   * id. A request lives only as long as the stream that made it.
   */
  const pendingApprovals = yield* Ref.make(
    HashMap.empty<string, Deferred.Deferred<ApprovalResponse>>(),
  );

  const harnessError = (reason: HarnessErrorReason, cause?: unknown) =>
    new HarnessError({ agent, reason, cause });

  const answerCalls = <Tools extends Record<string, Tool.Any>>(
    agentTurn: Stream.Stream<StreamPart, HarnessError>,
    toolkit: Toolkit.WithHandler<Tools> | undefined,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> =>
    Stream.unwrap(
      Effect.map(Effect.scope, (scope) =>
        agentTurn.pipe(
          Stream.mapEffect((part) =>
            part.type === "tool-call" && part.providerExecuted !== true
              ? Effect.map(startTool(toolkit, part, scope), (results) =>
                  Stream.concat(Stream.succeed(part), results),
                )
              : Effect.succeed(Stream.succeed(part)),
          ),
          // Reads the agent's parts ahead, so that a tool it calls next starts while the results
          // of an earlier one still stream.
          Stream.buffer({ capacity: "unbounded" }),
          Stream.flatten(),
        ),
      ),
    );

  /** Starts the tool `call` names in `scope`, returning the stream of its results. */
  const startTool = Effect.fnUntraced(function* <Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.WithHandler<Tools> | undefined,
    call: Response.ToolCallPartEncoded,
    scope: Scope.Scope,
  ): Effect.fn.Return<Stream.Stream<StreamPart, TurnError<Tools>>, never, TurnServices<Tools>> {
    const results = yield* Queue.unbounded<StreamPart, TurnError<Tools> | Cause.Done>();
    yield* runTool(toolkit, call).pipe(Stream.runIntoQueue(results), Effect.forkIn(scope));
    return Stream.fromQueue(results);
  });

  /**
   * Runs the tool `call` names, streaming its results and giving the final one to the agent. A tool
   * that needs approval first runs only once `approve` allows it, and is answered as denied when
   * `approve` refuses it.
   */
  const runTool = <Tools extends Record<string, Tool.Any>>(
    toolkit: Toolkit.WithHandler<Tools> | undefined,
    call: Response.ToolCallPartEncoded,
  ): Stream.Stream<StreamPart, TurnError<Tools>, TurnServices<Tools>> => {
    const found = toolkit === undefined ? undefined : findTool(toolkit, call.name);
    if (toolkit === undefined || found === undefined) {
      const description = `The agent called ${call.name}, which is not one of the host's tools`;
      return Stream.fail(harnessError(new AgentContractError({ description })));
    }
    const { name, tool } = found;
    // `handle` decodes the params with the tool's schema and fails on a mismatch, so they need no
    // type of their own here.
    const params = call.params as Tool.ParametersEncoded<Tools[typeof name]>;
    const callTool: Stream.Stream<
      StreamPart,
      TurnError<Tools>,
      TurnServices<Tools>
    > = Stream.unwrap(toolkit.handle(name, params, call.id)).pipe(
      Stream.mapEffect((handled) => {
        const part = {
          type: "tool-result",
          id: call.id,
          name,
          result: handled.encodedResult,
          isFailure: handled.isFailure,
          providerExecuted: false,
          preliminary: handled.preliminary,
        } as const;
        return handled.preliminary ? Effect.succeed(part) : submitResult(part);
      }),
    );
    return Stream.unwrap(
      Effect.map(needsApproval(tool, call, conversation), (needed) =>
        needed ? askThenRun(call, callTool) : callTool,
      ),
    );
  };

  // TODO: Ask about the calls an agent makes together all at once, so that a caller can answer a
  // later call's request before an earlier one's: requests now stream in the order of the calls, as
  // their results do.
  /**
   * Streams a `tool-approval-request` for `call`, and then `ifApproved`, or the call answered as
   * denied once `approve` refuses it. The request waits in `pendingApprovals` until the stream
   * ends, whether `approve` answered it or the turn was released.
   */
  const askThenRun = <E, R>(
    call: Response.ToolCallPartEncoded,
    ifApproved: Stream.Stream<StreamPart, E, R>,
  ): Stream.Stream<StreamPart, E | HarnessError, R> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const approvalId = approvalIdOf(call);
        const answer = yield* Effect.acquireRelease(
          Effect.tap(Deferred.make<ApprovalResponse>(), (deferred) =>
            Ref.update(pendingApprovals, HashMap.set(approvalId, deferred)),
          ),
          () => Ref.update(pendingApprovals, HashMap.remove(approvalId)),
        );
        const request: StreamPart = {
          type: "tool-approval-request",
          approvalId,
          toolCallId: call.id,
        };
        const decided = Stream.unwrap(
          Effect.map(
            Deferred.await(answer),
            (response): Stream.Stream<StreamPart, E | HarnessError, R> =>
              response.approved ? ifApproved : denyTool(call, response.reason),
          ),
        );
        return Stream.concat(Stream.make(request), decided);
      }),
    );

  /** Answers `call` as denied, without running the tool. The agent gets the denial as the result. */
  const denyTool = (
    call: Response.ToolCallPartEncoded,
    reason: string | undefined,
  ): Stream.Stream<StreamPart, HarnessError> => {
    const part = {
      type: "tool-result",
      id: call.id,
      name: call.name,
      result: { type: "execution-denied", reason: reason ?? "The tool call was denied" },
      isFailure: true,
      providerExecuted: false,
    } as const;
    return Stream.fromEffect(submitResult(part));
  };

  /** Gives the agent `part`, a tool's final result, and returns it to stream. */
  const submitResult = <Part extends Parameters<AgentSession["submitToolResult"]>[0]>(part: Part) =>
    Effect.as(options.submitToolResult(part), part);

  const answerRequest = (response: ApprovalResponse) =>
    Effect.flatMap(
      Ref.modify(pendingApprovals, (current) => [
        HashMap.get(current, response.approvalId),
        HashMap.remove(current, response.approvalId),
      ]),
      (asked) =>
        Option.isNone(asked)
          ? Effect.succeed(false)
          : Effect.as(Deferred.succeed(asked.value, response), true),
    );

  const hostTools: HostTools = { answerCalls, answerRequest };
  return hostTools;
});

/** Names the request to approve `call` after the call: unique, and no counter. */
const approvalIdOf = (call: Response.ToolCallPartEncoded) => `approval-${call.id}`;

/**
 * Whether `tool` needs approval before running `call`, as Effect AI decides it for a language
 * model: a boolean, or a function of the call's decoded params and the conversation, which is read
 * only for a function. Params that do not decode need none, since the tool's handler rejects them
 * without running.
 */
const needsApproval = Effect.fnUntraced(
  function* <T extends Tool.Any>(
    tool: T,
    call: Response.ToolCallPartEncoded,
    conversation: Effect.Effect<ReadonlyArray<Prompt.Message>>,
  ): Effect.fn.Return<boolean, Schema.SchemaError, Tool.HandlerServices<T>> {
    const { needsApproval: needed } = tool;
    if (typeof needed !== "function") return needed === true;
    // Decoding needs the services `HandlerServices` names for the tool, which TypeScript cannot
    // relate to the schema of a tool it knows only as `Tool.Any`, as in Effect AI's own check.
    const decodeParams = Schema.decodeUnknownEffect(tool.parametersSchema) as (
      params: unknown,
    ) => Effect.Effect<unknown, Schema.SchemaError, Tool.HandlerServices<T>>;
    const params = yield* decodeParams(call.params);
    const answer = needed(params, { toolCallId: call.id, messages: yield* conversation });
    return Effect.isEffect(answer) ? yield* answer : answer;
  },
  Effect.orElseSucceed(() => false),
);

/** The tool that `name` names, with the name as the toolkit declares it, or nothing when none. */
const findTool = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
) => {
  if (!isToolName(toolkit, name)) return undefined;
  const tool = toolkit.tools[name];
  return tool === undefined ? undefined : { name, tool };
};

const isToolName = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.WithHandler<Tools>,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(toolkit.tools, name);
