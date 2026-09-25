import { ApiErrors, Workspace } from "@amends/api-http";
import { Cause, Clock, Data, Duration, Effect, Exit, Queue, Random, Schema, Stream } from "effect";
import { Sse } from "effect/unstable/encoding";
import { Atom, Reactivity } from "effect/unstable/reactivity";
import { watchWake } from "../live/wake.ts";
import { isUnauthorized, type ApiClient } from "./client.ts";
import { directoryKey, workspaceKey, workspaceResources, type WorkspaceResource } from "./keys.ts";

export type WorkspaceFeedState = Data.TaggedEnum<{
  /** Opening the first connection. */
  Connecting: {};
  /** Changes arrive as they commit. */
  Live: {};
  /** The connection dropped; it resumes after the last change received. */
  Reconnecting: { readonly attempt: number };
  /** Credentials were rejected, or the workspace is no longer available to this member. */
  Ended: { readonly reason: "unauthorized" | "unavailable" };
}>;
export const WorkspaceFeedState = Data.taggedEnum<WorkspaceFeedState>();

type Affected = WorkspaceResource | typeof directoryKey;
/**
 * The reads each delivered fact can change. Facts not listed change no read this client makes
 * yet; add a fact here when a read starts depending on it.
 */
const affects: Readonly<Record<string, ReadonlyArray<Affected>>> = {
  "workspace.initialized": ["settings", "ownership", directoryKey],
  "workspace.renamed": ["settings", "ownership", directoryKey],
  "workspace.ownership-transferred": ["settings", "ownership", "members", directoryKey],
  "workspace.member.added": ["members", "ownership", directoryKey],
  "workspace.member.removed": ["members", "ownership", directoryKey],
  "workspace.invitation.issued": ["invitations"],
  "workspace.invitation.revoked": ["invitations"],
  "workspace.invitation.accepted": ["invitations", "members", "ownership", directoryKey],
  "workspace.role.created": ["settings", "members"],
  "workspace.role.renamed": ["settings", "members"],
  // Grants decide what the reader may do and see, including another member's access.
  "workspace.role.permissions-changed": ["settings", "ownership", "members"],
  "workspace.assignment.created": ["settings", "ownership", "members"],
  "workspace.assignment.revoked": ["settings", "ownership", "members"],
};
const key = (workspaceId: string) => (affected: Affected) =>
  affected === directoryKey ? directoryKey : workspaceKey(workspaceId, affected);
export const affectedKeys = (workspaceId: string, names: Iterable<string>): Array<string> => {
  const keys = new Set<Affected>();
  for (const name of names) for (const affected of affects[name] ?? []) keys.add(affected);
  return [...keys].map(key(workspaceId));
};

const failures = (cause: Cause.Cause<unknown>) =>
  cause.reasons.flatMap((reason) => (Cause.isFailReason(reason) ? [reason.error] : []));
const unavailable = (cause: Cause.Cause<unknown>) =>
  failures(cause).some(
    (error) =>
      Schema.is(ApiErrors.NotMember)(error) || Schema.is(ApiErrors.WorkspaceNotFound)(error),
  );
/** How long a connection must stay live before its failure counts as the first in a row. */
const healthy = 10_000;
/** Exponential from one second to thirty, halved at random so clients do not return together. */
const retryDelay = Effect.fnUntraced(function* (attempt: number, cause: Cause.Cause<unknown>) {
  const errors = failures(cause);
  const requested = errors.find((error) => Sse.Retry.is(error));
  if (requested) return requested.duration;
  const exponential = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5));
  const limited = errors.some(Schema.is(ApiErrors.TooManyStreams))
    ? Math.max(exponential, 15_000)
    : exponential;
  return Duration.millis(limited * (0.5 + (yield* Random.next) / 2));
});

/**
 * Keep one workspace's change stream open, emitting its connection state. Each commit
 * invalidates the reads it affects; a reset invalidates all of them. Reconnection resumes after
 * the last commit received, backing off between failures and retrying at once when the page
 * wakes. Rejected credentials or lost membership end the feed.
 */
const run = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: string,
  states: Queue.Queue<WorkspaceFeedState, Cause.Done>,
) {
  const api = yield* client;
  const reactivity = yield* Reactivity.Reactivity;
  const everything = [directoryKey, ...workspaceResources.map(key(workspaceId))];
  const id = Schema.decodeOption(Workspace.Id)(workspaceId);
  if (id._tag === "None") {
    Queue.offerUnsafe(states, WorkspaceFeedState.Ended({ reason: "unavailable" }));
    return;
  }
  const wake = yield* Queue.sliding<void>(1);
  yield* Effect.acquireRelease(
    Effect.sync(() => watchWake(window, () => Queue.offerUnsafe(wake, undefined))),
    (stop) => Effect.sync(stop),
  );
  type Message = Stream.Success<Effect.Success<ReturnType<typeof api.changes.watch>>>;
  let cursor: Extract<Message, { _tag: "Committed" }>["cursor"] | undefined;
  let attempt = 0;
  let connected = false;
  let liveSince: number | undefined;
  const receive = (message: Message): Effect.Effect<void> => {
    switch (message._tag) {
      case "Ready":
        return Effect.flatMap(Clock.currentTimeMillis, (now) => {
          connected = true;
          liveSince = now;
          if (message.cursor !== null) cursor = message.cursor;
          Queue.offerUnsafe(states, WorkspaceFeedState.Live());
          return message.reset ? reactivity.invalidate(everything) : Effect.void;
        });
      case "Committed": {
        cursor = message.cursor;
        const keys = affectedKeys(
          workspaceId,
          message.events.map((event) => event.name),
        );
        return keys.length > 0 ? reactivity.invalidate(keys) : Effect.void;
      }
      case "Signal":
        return Effect.void;
    }
  };
  while (true) {
    Queue.offerUnsafe(
      states,
      connected || attempt > 0
        ? WorkspaceFeedState.Reconnecting({ attempt: Math.max(attempt, 1) })
        : WorkspaceFeedState.Connecting(),
    );
    yield* Queue.clear(wake);
    const connection = api.changes
      .watch({
        params: { workspaceId: id.value },
        query: cursor === undefined ? {} : { after: cursor },
      })
      .pipe(Effect.flatMap(Stream.runForEach(receive)));
    const outcome = yield* Effect.raceFirst(
      Effect.exit(connection),
      Queue.take(wake).pipe(Effect.as("wake" as const)),
    );
    // The page woke while connected: the connection may be dead without knowing it.
    if (outcome === "wake") {
      liveSince = undefined;
      continue;
    }
    const cause = Exit.isFailure(outcome) ? outcome.cause : Cause.empty;
    if (isUnauthorized(cause)) {
      Queue.offerUnsafe(states, WorkspaceFeedState.Ended({ reason: "unauthorized" }));
      return;
    }
    if (unavailable(cause)) {
      yield* reactivity.invalidate([directoryKey]);
      Queue.offerUnsafe(states, WorkspaceFeedState.Ended({ reason: "unavailable" }));
      return;
    }
    // A connection that stayed up starts over; one that fails as soon as it opens, such as on
    // a replayed commit this client cannot read, keeps backing off.
    const now = yield* Clock.currentTimeMillis;
    attempt = liveSince !== undefined && now - liveSince >= healthy ? 1 : attempt + 1;
    liveSince = undefined;
    Queue.offerUnsafe(states, WorkspaceFeedState.Reconnecting({ attempt }));
    yield* Effect.raceFirst(
      Effect.flatMap(retryDelay(attempt, cause), Effect.sleep),
      Queue.take(wake),
    );
  }
});

const makeFamily = (client: ApiClient) =>
  Atom.family((workspaceId: string) =>
    client.runtime.atom(
      Stream.callback(
        (states: Queue.Queue<WorkspaceFeedState, Cause.Done>) => run(client, workspaceId, states),
        {
          bufferSize: 1,
          strategy: "sliding",
        },
      ),
    ),
  );
const families = new WeakMap<ApiClient, ReturnType<typeof makeFamily>>();
/** One shared stream per workspace in a credential scope, open while any consumer is mounted. */
export const workspaceFeed = (client: ApiClient, workspaceId: string) => {
  let family = families.get(client);
  if (!family) {
    family = makeFamily(client);
    families.set(client, family);
  }
  return family(workspaceId);
};
