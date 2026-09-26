import { ApiErrors, Workspace } from "@amends/api-http";
import { Cause, Clock, Data, Duration, Effect, Exit, Queue, Random, Schema, Stream } from "effect";
import { Sse } from "effect/unstable/encoding";
import { Atom, AtomRegistry, Reactivity } from "effect/unstable/reactivity";
import { watchWake } from "../live/wake.ts";
import { isUnauthorized, type ApiClient } from "./client.ts";
import { posted, typing, typistsAtom } from "./typing.ts";
import {
  collectionKey,
  directoryKey,
  itemKey,
  workspaceCollections,
  workspaceKey,
  workspaceResources,
  type WorkspaceCollection,
  type WorkspaceResource,
} from "./keys.ts";

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
  "workspace.ownership-transferred": [
    "settings",
    "ownership",
    "members",
    "permissions",
    directoryKey,
  ],
  "workspace.member.added": ["members", "ownership", directoryKey],
  "workspace.member.removed": ["members", "ownership", directoryKey],
  // A member's name shows wherever members are named, and in the directory's memberships.
  "workspace.member.renamed": ["members", directoryKey],
  "workspace.invitation.issued": ["invitations"],
  "workspace.invitation.revoked": ["invitations"],
  "workspace.invitation.accepted": ["invitations", "members", "ownership", directoryKey],
  "workspace.role.created": ["settings", "members"],
  "workspace.role.renamed": ["settings", "members"],
  // Grants decide what the reader may do and see, including another member's access, and which
  // notification sources they can still read.
  "workspace.role.permissions-changed": [
    "settings",
    "ownership",
    "members",
    "groups",
    "inbox",
    "permissions",
  ],
  "workspace.assignment.created": [
    "settings",
    "ownership",
    "members",
    "groups",
    "inbox",
    "permissions",
  ],
  "workspace.assignment.revoked": [
    "settings",
    "ownership",
    "members",
    "groups",
    "inbox",
    "permissions",
  ],
  "group.created": ["groups"],
  // A team group's name shows in the sidebar and on its page.
  "group.renamed": ["groups"],
  // Group access decides the same for the group's threads.
  "group.membership.added": ["groups", "inbox"],
  "group.membership.removed": ["groups", "inbox"],
  "group.follow.started": ["groups"],
  "group.follow.ended": ["groups"],
  // A group's latest activity, and whether it is new to the reader.
  "thread.activity.recorded": ["groups"],
};
/** A field of an event's JSON payload, when it is a string. */
const text = (value: unknown, ...path: ReadonlyArray<string>): string | undefined => {
  let current = value;
  for (const name of path) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, name))
      return undefined;
    current = (current as Readonly<Record<string, unknown>>)[name];
  }
  return typeof current === "string" ? current : undefined;
};
interface Target {
  readonly collection: WorkspaceCollection;
  readonly id: string | undefined;
}
/** The reads of one group or thread each fact can change, found from its payload. */
const targets: Readonly<Record<string, (payload: unknown) => ReadonlyArray<Target>>> = {
  // Starting a thread, replying, and joining or leaving it: the thread's timeline and its group's
  // stream, whose reply counts and unread state follow.
  "thread.activity.recorded": (payload) => [
    { collection: "timelines", id: text(payload, "activity", "threadId") },
    { collection: "streams", id: text(payload, "groupId") },
  ],
  // Who belongs to a group, and which of its threads the reader may see. A fact names its group
  // but not its threads, so every open timeline and participant list checks its access again.
  "group.membership.added": (payload) => [
    { collection: "streams", id: text(payload, "groupId") },
    { collection: "rosters", id: text(payload, "groupId") },
    { collection: "timelines", id: undefined },
    { collection: "participants", id: undefined },
  ],
  "group.membership.removed": (payload) => [
    { collection: "streams", id: text(payload, "groupId") },
    { collection: "rosters", id: text(payload, "groupId") },
    { collection: "timelines", id: undefined },
    { collection: "participants", id: undefined },
  ],
  // Who takes part in a thread, and so follows it.
  "thread.participation.added": (payload) => [
    { collection: "participants", id: text(payload, "threadId") },
  ],
  "thread.participation.ended": (payload) => [
    { collection: "participants", id: text(payload, "threadId") },
  ],
  // Rosters list active workspace members only.
  "workspace.member.added": () => [{ collection: "rosters", id: undefined }],
  "workspace.member.removed": () => [{ collection: "rosters", id: undefined }],
};
/** Grants decide which threads each stream shows, which threads and rosters are readable. */
const everyStream = new Set([
  "workspace.role.permissions-changed",
  "workspace.assignment.created",
  "workspace.assignment.revoked",
]);
const key = (workspaceId: string) => (affected: Affected) =>
  affected === directoryKey ? directoryKey : workspaceKey(workspaceId, affected);
/**
 * The keys a commit invalidates, each once, so every affected read refreshes once. An item's key
 * is dropped when its whole collection is invalidated.
 */
export const affectedKeys = (
  workspaceId: string,
  events: Iterable<{ readonly name: string; readonly payload?: unknown }>,
  notified = false,
): Array<string> => {
  const affected = new Set<Affected>(notified ? ["groups", "inbox"] : []);
  const collections = new Set<WorkspaceCollection>(),
    items = new Set<string>();
  for (const event of events) {
    for (const resource of affects[event.name] ?? []) affected.add(resource);
    for (const target of targets[event.name]?.(event.payload) ?? [])
      if (target.id === undefined) collections.add(target.collection);
      else items.add(itemKey(workspaceId, target.collection, target.id));
    if (everyStream.has(event.name))
      for (const collection of workspaceCollections) collections.add(collection);
  }
  const whole = [...collections].map((collection) => collectionKey(workspaceId, collection));
  return [
    ...[...affected].map(key(workspaceId)),
    ...whole,
    ...[...items].filter((item) => !whole.some((prefix) => item.startsWith(`${prefix}:`))),
  ];
};
/**
 * The reads a signal to the reader's own sessions changes. Reading a thread changes its stream's
 * unread state, and settles notifications from it, changing the inbox and pending counts; seeing
 * notifications changes the inbox and counts; catching up, the groups.
 */
export const signalKeys = (workspaceId: string, signal: { readonly _tag: string }) => {
  switch (signal._tag) {
    case "ThreadRead":
      return [
        workspaceKey(workspaceId, "groups"),
        collectionKey(workspaceId, "streams"),
        workspaceKey(workspaceId, "inbox"),
      ];
    case "NotificationsSeen":
      return [workspaceKey(workspaceId, "groups"), workspaceKey(workspaceId, "inbox")];
    case "GroupCaughtUp":
      return [workspaceKey(workspaceId, "groups")];
    default:
      return [];
  }
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
  const registry = yield* AtomRegistry.AtomRegistry;
  const typists = typistsAtom(workspaceId);
  const everything = [
    directoryKey,
    ...workspaceResources.map(key(workspaceId)),
    ...workspaceCollections.map((collection) => collectionKey(workspaceId, collection)),
  ];
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
        // A member whose message arrived is no longer typing it.
        for (const event of message.events)
          if (event.name === "thread.message.published") {
            const threadId = text(event.payload, "threadId"),
              memberId = text(event.payload, "author", "memberId");
            if (threadId && memberId)
              registry.update(typists, (current) =>
                posted(current, threadId, memberId, Date.now()),
              );
          }
        // A notification for the reader changes their inbox and pending counts.
        const keys = affectedKeys(workspaceId, message.events, message.notifications.length > 0);
        return keys.length > 0 ? reactivity.invalidate(keys) : Effect.void;
      }
      case "Signal": {
        const signal = message.signal;
        if (signal._tag === "Typing")
          registry.update(typists, (current) => typing(current, signal, Date.now()));
        const keys = signalKeys(workspaceId, signal);
        return keys.length > 0 ? reactivity.invalidate(keys) : Effect.void;
      }
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
