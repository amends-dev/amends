import { ApiErrors, Thread, Turn, Workspace } from "@amends/api-http";
import { Cause, Effect, Option, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { itemKeys } from "./keys.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type { Turn };

/** How many of a thread's turns one read holds, newest first: each agent's latest among them. */
const limit = 50;

/**
 * A thread's turns, newest first, with what the reader may do with each; it follows the thread's
 * turn facts and access changes. Undefined for an invalid workspace or thread ID.
 */
export const threadTurnsRead = (client: ApiClient, workspaceId: string, threadId: string) => {
  const workspace = Schema.decodeOption(Workspace.Id)(workspaceId);
  const thread = Schema.decodeOption(Thread.Id)(threadId);
  if (Option.isNone(workspace) || Option.isNone(thread)) return undefined;
  return client.query("turns", "listByThread", {
    params: { workspaceId: workspace.value, threadId: thread.value },
    query: { limit },
    reactivityKeys: itemKeys(workspaceId, "turns", threadId),
  });
};

/** A new retry attempt; asking again with the same key returns the turn it created. */
export const newTurnRequestKey = newWorkspaceRequestKey;

export type TurnCommand =
  | { readonly kind: "stop"; readonly turnId: string }
  | {
      readonly kind: "retry";
      readonly turnId: string;
      readonly key: ReturnType<typeof newTurnRequestKey>;
    };

/**
 * Stop or retry one of a thread's turns, then refresh the thread's turns before answering, so a
 * completed command is followed by the state it produced. Answers with the turn it acted on, or
 * for a retry, the new turn.
 */
export const turnsRequest = (client: ApiClient, workspace: string, thread: string) =>
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
      const read = threadTurnsRead(client, workspace, thread);
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
