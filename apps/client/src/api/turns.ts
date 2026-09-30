import { ApiErrors, Turn, Workspace } from "@amends/api-http";
import { Cause, Effect, Option, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { timelineRead } from "./conversations.ts";
import { command } from "./failures.ts";
import { itemKeys, workspaceKey } from "./keys.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type { Turn };

/**
 * The workspace's active turns in threads the reader may open, for marks where agents are at work.
 * Undefined for an invalid workspace ID.
 */
export const activeTurnsRead = (client: ApiClient, workspaceId: string) => {
  const workspace = Schema.decodeOption(Workspace.Id)(workspaceId);
  if (Option.isNone(workspace)) return undefined;
  return client.query("turns", "listActive", {
    params: { workspaceId: workspace.value },
    query: { limit: 100 },
    reactivityKeys: [workspaceKey(workspaceId, "active-turns")],
  });
};

/**
 * A turn as the reader sees it, following its facts: where it stands and what they may do with it.
 * Its log is followed apart, by `turnLogFeed`. Undefined for invalid IDs.
 */
export const turnRead = (client: ApiClient, workspaceId: string, turnId: string) => {
  const workspace = Schema.decodeOption(Workspace.Id)(workspaceId);
  const turn = Schema.decodeOption(Turn.Id)(turnId);
  if (Option.isNone(workspace) || Option.isNone(turn)) return undefined;
  return client.query("turns", "get", {
    params: { workspaceId: workspace.value, turnId: turn.value },
    reactivityKeys: itemKeys(workspaceId, "turns", turnId),
  });
};

/** A new retry attempt; asking again with the same key returns the turn it created. */
export const newTurnRequestKey = newWorkspaceRequestKey;

/** A stop or retry; `log` also refreshes the turn, for a reader who has its log open. */
export type TurnCommand = (
  | { readonly kind: "stop"; readonly turnId: string }
  | {
      readonly kind: "retry";
      readonly turnId: string;
      readonly key: ReturnType<typeof newTurnRequestKey>;
    }
) & { readonly log?: boolean };

/**
 * Stop or retry a turn, then refresh its thread's timeline, when given, and the turn, when asked,
 * before answering, so a completed command is followed by the state it produced. Answers with the
 * turn it acted on, or for a retry, the new turn.
 */
export const turnsRequest = (client: ApiClient, workspace: string, thread: string | undefined) =>
  requestAtom(client, (input: TurnCommand, get) =>
    Effect.gen(function* () {
      const api = yield* client;
      const params = {
        workspaceId: yield* command(Workspace.Id)(workspace),
        turnId: yield* command(Turn.Id)(input.turnId),
      };
      const turn =
        input.kind === "stop"
          ? yield* api.turns.cancel({ params })
          : yield* api.turns.retry({ params, headers: { "idempotency-key": input.key } });
      const timeline = thread === undefined ? undefined : timelineRead(client, workspace, thread);
      if (timeline !== undefined) yield* Effect.ignore(refreshResult(get, timeline.atom));
      const read = input.log ? turnRead(client, workspace, input.turnId) : undefined;
      if (read !== undefined) yield* Effect.ignore(refreshResult(get, read));
      return turn;
    }),
  );

/**
 * What a turn command was refused for: the turn already finished, so there is nothing to stop,
 * or it cannot run again because it is still active, it replied, a later turn followed it, or
 * its agent no longer takes part in the thread.
 */
export type TurnProblem =
  | { readonly kind: "finished" }
  | { readonly kind: "not-retryable"; readonly reason: Turn.NotRetryableReason };

/** The problem a failed turn command names, if it names one. */
export const turnProblem = (cause: Cause.Cause<unknown>): TurnProblem | undefined => {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (Schema.is(ApiErrors.TurnNotActive)(reason.error)) return { kind: "finished" };
    if (Schema.is(ApiErrors.TurnNotRetryable)(reason.error))
      return { kind: "not-retryable", reason: reason.error.reason };
  }
  return undefined;
};
