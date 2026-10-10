/**
 * Translates the events of an opencode turn into the parts a harness streams for it, one event at
 * a time, from what the turn has done so far. The translation is pure: the driver feeds it the
 * turn's events in order, from the first after the turn's prompt.
 *
 * opencode records text, reasoning, and tool input whole when they end, so each streams as one
 * delta. Every tool runs inside opencode, so its calls and results are `providerExecuted`, and a
 * result is what the model read. A turn finishes at a step that ends for a reason other than
 * calling tools, or at a step that fails. A turn opencode stops without either, as when it is
 * interrupted while tools run or cannot load its model, ends when its events do, with
 * `finishStopped`.
 */
import { HarnessError, type StreamPart } from "@amends/harness";
import { Result } from "effect";
import type { Response } from "effect/ai";
import { addTokens, finishReasonOf, noTokens, type Tokens, usageOf } from "../Steps.ts";
import type { SessionEvent } from "./Event.ts";

/** What a turn has done so far, as its events told. */
export interface Turn {
  /** The tools the turn called, by call id; a call's result names only the call. */
  readonly toolNames: ReadonlyMap<string, string>;

  /** The tokens of the turn's ended steps, together. */
  readonly tokens: Tokens;

  /** Whether the turn streamed its `finish` part. Events after it stream nothing. */
  readonly finished: boolean;
}

/** A turn none of whose events were translated yet. */
export const initial: Turn = {
  toolNames: new Map(),
  tokens: noTokens,
  finished: false,
};

/**
 * Translates the turn's next event into the parts it streams and the turn after it. Fails with
 * `AgentContractError` for the result of a call the turn did not make.
 */
export const translate = (
  turn: Turn,
  event: SessionEvent,
): Result.Result<
  readonly [Turn, ReadonlyArray<StreamPart.StreamPart>],
  HarnessError.AgentContractError
> => {
  if (turn.finished) return Result.succeed([turn, []]);
  switch (event.type) {
    case "session.next.prompted":
    case "session.next.compaction.started":
      return Result.succeed([turn, []]);

    case "session.next.step.started":
      return Result.succeed([
        turn,
        [
          {
            type: "response-metadata",
            id: event.data.assistantMessageID,
            modelId: `${event.data.model.providerID}/${event.data.model.id}`,
            timestamp: new Date(event.data.timestamp).toISOString(),
          },
        ],
      ]);

    case "session.next.reasoning.started":
      return Result.succeed([turn, [{ type: "reasoning-start", id: event.data.reasoningID }]]);

    case "session.next.reasoning.ended":
      return Result.succeed([
        turn,
        [
          { type: "reasoning-delta", id: event.data.reasoningID, delta: event.data.text },
          {
            type: "reasoning-end",
            id: event.data.reasoningID,
            metadata: event.data.providerMetadata,
          },
        ],
      ]);

    case "session.next.text.started":
      return Result.succeed([turn, [{ type: "text-start", id: event.data.textID }]]);

    case "session.next.text.ended":
      return Result.succeed([
        turn,
        [
          { type: "text-delta", id: event.data.textID, delta: event.data.text },
          { type: "text-end", id: event.data.textID },
        ],
      ]);

    case "session.next.tool.input.started":
      return Result.succeed([
        turn,
        [
          {
            type: "tool-params-start",
            id: event.data.callID,
            name: event.data.name,
            providerExecuted: true,
          },
        ],
      ]);

    case "session.next.tool.input.ended":
      return Result.succeed([
        turn,
        [
          { type: "tool-params-delta", id: event.data.callID, delta: event.data.text },
          { type: "tool-params-end", id: event.data.callID },
        ],
      ]);

    case "session.next.tool.called":
      return Result.succeed([
        { ...turn, toolNames: new Map(turn.toolNames).set(event.data.callID, event.data.tool) },
        [
          {
            type: "tool-call",
            id: event.data.callID,
            name: event.data.tool,
            params: event.data.input,
            providerExecuted: true,
            metadata: event.data.provider.metadata,
          },
        ],
      ]);

    case "session.next.tool.success":
    case "session.next.tool.failed": {
      const { callID } = event.data;
      const name = turn.toolNames.get(callID);
      if (name === undefined) {
        return Result.fail(
          new HarnessError.AgentContractError({
            description: `opencode reported the result of the call ${callID}, which the turn did not make`,
          }),
        );
      }
      return Result.succeed([
        turn,
        [
          {
            type: "tool-result",
            id: callID,
            name,
            ...(event.type === "session.next.tool.success"
              ? { result: event.data.content, isFailure: false }
              : { result: event.data.error.message, isFailure: true }),
            providerExecuted: true,
            metadata: event.data.provider.metadata,
          },
        ],
      ]);
    }

    case "session.next.step.ended": {
      const ended = { ...turn, tokens: addTokens(turn.tokens, event.data.tokens) };
      const reason = finishReasonOf(event.data.finish);
      const finishStep: StreamPart.StreamPart = {
        type: "finish-step",
        reason,
        usage: usageOf(event.data.tokens),
      };
      return Result.succeed(
        reason === "tool-calls"
          ? [ended, [finishStep]]
          : [{ ...ended, finished: true }, [finishStep, finishOf(ended, reason)]],
      );
    }

    case "session.next.step.failed":
      return Result.succeed([
        { ...turn, finished: true },
        [{ type: "error", error: event.data.error }, finishOf(turn, "error")],
      ]);

    case "session.next.compaction.ended":
      return Result.succeed([
        turn,
        [{ type: "compaction", trigger: event.data.reason, summary: event.data.text }],
      ]);
  }
};

/**
 * The parts that end a turn whose events ended before it finished, because opencode stopped it
 * without a step that ends it. Nothing for a turn that finished.
 */
export const finishStopped = (turn: Turn): ReadonlyArray<StreamPart.StreamPart> =>
  turn.finished
    ? []
    : [
        {
          type: "error",
          error: { type: "unknown", message: "opencode stopped the turn unfinished" },
        },
        finishOf(turn, "error"),
      ];

/** The turn's `finish` part, with the tokens of all its ended steps. */
const finishOf = (turn: Turn, reason: Response.FinishReason): StreamPart.StreamPart => ({
  type: "finish",
  reason,
  usage: usageOf(turn.tokens),
});
