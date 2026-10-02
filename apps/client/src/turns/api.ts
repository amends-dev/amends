import { ApiErrors, Turn, Workspace } from "@amends/api-http";
import type { TurnProblem } from "@amends/ui/screens/turns";
import { Cause, Effect, Exit, Option, Queue, Schema, Stream } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { isUnauthorized, type Api, type ApiClient } from "../api/client.ts";
import { command } from "../api/failures.ts";
import { itemKeys, workspaceKey } from "../api/keys.ts";
import { retryDelay } from "../live/api.ts";
import { watchWake } from "../live/wake.ts";
import { drafted, type Drafts } from "./drafts.ts";

export { Turn };

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

/** A stop or retry of one turn. */
export interface TurnCommand {
  readonly kind: "stop" | "retry";
  readonly turnId: string;
}
/** Stop or retry a turn, answering with the turn it acted on, or for a retry, the new turn. */
export const controlTurn = (workspace: string) => (api: Api, input: TurnCommand) =>
  Effect.gen(function* () {
    const params = {
      workspaceId: yield* command(Workspace.Id)(workspace),
      turnId: yield* command(Turn.Id)(input.turnId),
    };
    return input.kind === "stop"
      ? yield* api.turns.cancel({ params })
      : yield* api.turns.retry({ params });
  });

const refusals = {
  active: "still-running",
  completed: "replied",
  superseded: "superseded",
  departed: "departed",
} as const satisfies Record<Turn.NotRetryableReason, TurnProblem>;

/**
 * What a turn command was refused for, if the host refused it: the turn already finished, so there
 * is nothing to stop, or it cannot run again because it is still active, it replied, a later turn
 * followed it, or its agent no longer takes part in the thread.
 */
export const turnRefusal = (cause: Cause.Cause<unknown>): TurnProblem | undefined => {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (Schema.is(ApiErrors.TurnNotActive)(reason.error)) return "finished";
    if (Schema.is(ApiErrors.TurnNotRetryable)(reason.error)) return refusals[reason.error.reason];
  }
  return undefined;
};

/**
 * A turn's log as following it holds it: its items, the response being written, whether the turn
 * ended with every item delivered, and how following it stands.
 */
export interface TurnLogFeed {
  /** The log's items, oldest first, once following it opened. */
  readonly items: ReadonlyArray<Turn.LogItem> | undefined;
  /** The response being written, by part, as its drafts carried it. */
  readonly drafts: Drafts;
  /** The turn ended and every item arrived: nothing more follows. */
  readonly ended: boolean;
  /**
   * Opening the first subscription, following, reconnecting after a drop, or stopped: the turn is
   * gone to the reader, they may no longer read its thread, or their credentials were rejected.
   */
  readonly connection: "connecting" | "live" | "reconnecting" | "gone" | "denied" | "unauthorized";
  /** When the log last arrived. */
  readonly updatedAt: Date | undefined;
}

const initial: TurnLogFeed = {
  items: undefined,
  drafts: new Map(),
  ended: false,
  connection: "connecting",
  updatedAt: undefined,
};

/** The reader can no longer see the turn: it is not theirs to read, or they left the workspace. */
const gone = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) =>
      Cause.isFailReason(reason) &&
      (Schema.is(ApiErrors.TurnNotFound)(reason.error) ||
        Schema.is(ApiErrors.NotMember)(reason.error) ||
        Schema.is(ApiErrors.WorkspaceNotFound)(reason.error)),
  );

/** The reader is in the turn's thread's group, but may no longer read the thread. */
const denied = (cause: Cause.Cause<unknown>) =>
  cause.reasons.some(
    (reason) => Cause.isFailReason(reason) && Schema.is(ApiErrors.Denied)(reason.error),
  );

/** The items with each change put in its place. */
const changed = (
  items: ReadonlyArray<Turn.LogItem>,
  changes: ReadonlyArray<Turn.LogChange>,
): ReadonlyArray<Turn.LogItem> => {
  const next = [...items];
  for (const { index, item } of changes) next[index] = item;
  return next;
};

/**
 * Follow one turn's log, emitting what it holds as it changes. Each subscription opens with the
 * items as they stand, so reconnecting after a drop replaces them; drafts carry on, and a part
 * that missed text while disconnected waits for its block. Following stops once the turn ended
 * and its last items arrived, or when the turn is gone to the reader.
 */
const run = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: string,
  turnId: string,
  states: Queue.Queue<TurnLogFeed, Cause.Done>,
) {
  const api = yield* client;
  let state = initial;
  const set = (next: Partial<TurnLogFeed>) => {
    state = { ...state, ...next };
    Queue.offerUnsafe(states, state);
  };
  const workspace = Schema.decodeOption(Workspace.Id)(workspaceId);
  const turn = Schema.decodeOption(Turn.Id)(turnId);
  if (Option.isNone(workspace) || Option.isNone(turn)) return set({ connection: "gone" });
  const params = { workspaceId: workspace.value, turnId: turn.value };
  const wake = yield* Queue.sliding<void>(1);
  yield* Effect.acquireRelease(
    Effect.sync(() => watchWake(window, () => Queue.offerUnsafe(wake, undefined))),
    (stop) => Effect.sync(stop),
  );
  let attempt = 0;
  const receive = (message: Turn.LogMessage) =>
    Effect.sync(() => {
      Turn.LogMessage.match(message, {
        Opened: (message) => {
          attempt = 0;
          return set({ items: message.items, connection: "live", updatedAt: new Date() });
        },
        Changed: (message) =>
          set({
            items: changed(state.items ?? [], message.changes),
            updatedAt: new Date(),
          }),
        Drafted: (message) => set({ drafts: drafted(state.drafts, { ...message, turnId }) }),
        Ended: () => set({ ended: true, drafts: new Map() }),
      });
    });
  while (true) {
    yield* Queue.clear(wake);
    const following = api.turns
      .watchLog({ params })
      .pipe(Effect.flatMap(Stream.runForEach(receive)));
    const outcome = yield* Effect.raceFirst(
      Effect.exit(following),
      Queue.take(wake).pipe(Effect.as("wake" as const)),
    );
    if (state.ended) return;
    // The page woke while following: the connection may be dead without knowing it.
    if (outcome === "wake") continue;
    const cause = Exit.isFailure(outcome) ? outcome.cause : Cause.empty;
    if (isUnauthorized(cause)) return set({ connection: "unauthorized" });
    if (gone(cause)) return set({ connection: "gone" });
    if (denied(cause)) return set({ connection: "denied" });
    attempt += 1;
    set({ connection: "reconnecting" });
    yield* Effect.raceFirst(
      Effect.flatMap(retryDelay(attempt, cause), Effect.sleep),
      Queue.take(wake),
    );
  }
});

const makeFamily = (client: ApiClient) =>
  Atom.family((key: string) => {
    const [workspaceId = "", turnId = ""] = key.split("\u0000");
    return client.runtime.atom(
      Stream.callback(
        (states: Queue.Queue<TurnLogFeed, Cause.Done>) => run(client, workspaceId, turnId, states),
        { bufferSize: 1, strategy: "sliding" },
      ),
    );
  });
const families = new WeakMap<ApiClient, ReturnType<typeof makeFamily>>();
/** Follow one turn's log in a credential scope, while any consumer is mounted. */
export const turnLogFeed = (client: ApiClient, workspaceId: string, turnId: string) => {
  let family = families.get(client);
  if (!family) {
    family = makeFamily(client);
    families.set(client, family);
  }
  return family(`${workspaceId}\u0000${turnId}`);
};
