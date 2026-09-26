import { Group, Member, Thread, ThreadTimeline, Workspace } from "@amends/api-http";
import { DateTime, Effect, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { itemKeys, workspaceKey } from "./keys.ts";

export { Group, Member, Thread, ThreadTimeline };

/** How many threads or timeline items one page reads. */
export const pageSize = 50;

/** One read per client and key, shared by every consumer while any is mounted. */
const perClient = <K extends string, A extends object>(make: (client: ApiClient, key: K) => A) => {
  const families = new WeakMap<ApiClient, (key: K) => A>();
  return (client: ApiClient, key: K): A => {
    const family = families.get(client) ?? Atom.family((key: K) => make(client, key));
    families.set(client, family);
    return family(key);
  };
};
const split = (key: string) => {
  const [workspaceId = "", id = ""] = key.split("\u0000");
  return { workspaceId: Workspace.Id.make(workspaceId), id };
};
const joined = (workspaceId: string, id: string) => `${workspaceId}\u0000${id}`;
const valid = (workspaceId: string) =>
  Option.isSome(Schema.decodeOption(Workspace.Id)(workspaceId));

/** Every group the reader belongs to, read page by page, in group-ID order. */
const groupsOf = perClient((client: ApiClient, workspaceId: string) =>
  client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client;
        const params = { workspaceId: Workspace.Id.make(workspaceId) };
        const groups: Array<Group.ListItem> = [];
        let after: Group.Id | undefined;
        while (true) {
          const page = yield* api.groups.list({
            params,
            query: after === undefined ? { limit: 100 } : { limit: 100, after },
          });
          groups.push(...page);
          const last = page.at(-1);
          if (page.length < 100 || last === undefined) return groups;
          after = last.group.id;
        }
      }),
    )
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "groups")])),
);
export const groupsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId) ? groupsOf(client, workspaceId) : undefined;

/** The workspace's members, to name authors. */
export const membersRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("members", "list", {
        params: { workspaceId: Workspace.Id.make(workspaceId) },
        reactivityKeys: [workspaceKey(workspaceId, "members")],
      })
    : undefined;

/**
 * A view that pages back from the newest end. `items` are in the order the view shows them,
 * oldest first; `complete` means nothing older remains. `earlier` counts the reader's requests for
 * older items, so a read can tell a request for more from a refresh.
 */
export interface Paged<A> {
  readonly items: ReadonlyArray<A>;
  readonly complete: boolean;
  readonly earlier: number;
}
export interface PagedRead<A, E> {
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<Paged<A>, E>>;
  /** Written with the next request count to read one page further back. */
  readonly earlier: Atom.Writable<number>;
}
const previousOf = <A>(get: Atom.AtomContext): Option.Option<Paged<A>> =>
  Option.flatMap(get.self<AsyncResult.AsyncResult<Paged<A>, unknown>>(), (result) =>
    AsyncResult.value(result),
  );

/** Newest start first, then ID in descending binary order: the stream's page order. */
const newerThan = (left: Thread.Record, right: Thread.Record) =>
  DateTime.toEpochMillis(left.createdAt) - DateTime.toEpochMillis(right.createdAt) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
const streamOf = perClient((client: ApiClient, key: string): PagedRead<Thread.Opening, unknown> => {
  const { workspaceId, id } = split(key);
  const earlier = Atom.make(0);
  const atom = client.runtime
    .atom(
      Effect.fnUntraced(function* (get) {
        const api = yield* client;
        const requested = get(earlier);
        const previous = previousOf<Thread.Opening>(get);
        // The oldest thread shown stays shown: a refresh reads down to it, and a request for
        // more reads one page past it. New threads arrive at the newest end.
        const reach = Option.flatMap(previous, (view) => Option.fromUndefinedOr(view.items[0]));
        const more = Option.isNone(previous) || requested > previous.value.earlier;
        const params = { workspaceId, groupId: Group.Id.make(id) };
        const newestFirst: Array<Thread.Opening> = [];
        let before: Thread.OpeningCursor | undefined;
        let complete = false;
        while (true) {
          const page = yield* api.threads.openings({
            params,
            query: before === undefined ? { limit: pageSize } : { limit: pageSize, before },
          });
          newestFirst.push(...page);
          const last = page.at(-1);
          if (page.length < pageSize || last === undefined) {
            complete = true;
            break;
          }
          before = { createdAt: last.thread.createdAt, threadId: last.thread.id };
          if (Option.isNone(reach)) break;
          // A refresh stops once it reaches the oldest thread shown; a request for more once a
          // page of older threads follows it.
          const done = more
            ? newestFirst.filter((item) => newerThan(item.thread, reach.value.thread) < 0).length >=
              pageSize
            : newerThan(last.thread, reach.value.thread) <= 0;
          if (done) break;
        }
        return { items: newestFirst.toReversed(), complete, earlier: requested };
      }),
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "streams", id)));
  return { atom, earlier };
});
/** A group's stream: its readable threads by when they started, oldest shown first. */
export const streamRead = (client: ApiClient, workspaceId: string, groupId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(Group.Id)(groupId))
    ? streamOf(client, joined(workspaceId, groupId))
    : undefined;

const timelineOf = perClient(
  (client: ApiClient, key: string): PagedRead<ThreadTimeline.Item, unknown> => {
    const { workspaceId, id } = split(key);
    const earlier = Atom.make(0);
    const atom = client.runtime
      .atom(
        Effect.fnUntraced(function* (get) {
          const api = yield* client;
          const requested = get(earlier);
          const previous = previousOf<ThreadTimeline.Item>(get);
          const params = { workspaceId, threadId: Thread.Id.make(id) };
          const read = (query: {
            readonly afterSequence?: number;
            readonly beforeSequence?: number;
            readonly from?: "newest";
          }) => api.threads.timeline({ params, query: { limit: pageSize, ...query } });
          if (Option.isNone(previous)) {
            const page = yield* read({ from: "newest" });
            return { items: page, complete: page.length < pageSize, earlier: requested };
          }
          let { items, complete } = previous.value;
          // A timeline only grows: older pages are read once, and a change reads what followed.
          const first = items[0];
          if (requested > previous.value.earlier && first !== undefined && !complete) {
            const page = yield* read({ beforeSequence: first.activity.sequence, from: "newest" });
            items = [...page, ...items];
            complete = page.length < pageSize;
          }
          while (true) {
            const last = items.at(-1);
            const page = yield* read({ afterSequence: last?.activity.sequence ?? 0 });
            items = [...items, ...page];
            if (page.length < pageSize) break;
          }
          return { items, complete, earlier: requested };
        }),
      )
      .pipe(Atom.withReactivity(itemKeys(workspaceId, "timelines", id)));
    return { atom, earlier };
  },
);
/** A thread's timeline from its newest activity, oldest shown first. */
export const timelineRead = (client: ApiClient, workspaceId: string, threadId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(Thread.Id)(threadId))
    ? timelineOf(client, joined(workspaceId, threadId))
    : undefined;
