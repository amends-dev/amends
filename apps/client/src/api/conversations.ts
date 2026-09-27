import {
  Group,
  GroupMembership,
  Member,
  Notification,
  NotificationInbox,
  Thread,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline,
  Workspace,
} from "@amends/api-http";
import { DateTime, Effect, Option, Schema } from "effect";
import { AsyncResult, Atom, Reactivity } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { collectionKey, itemKey, itemKeys, workspaceKey } from "./keys.ts";
import { requestAtom } from "./request.ts";
import { refreshResult } from "./refresh.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export {
  Group,
  GroupMembership,
  Member,
  Notification,
  NotificationInbox,
  Thread,
  ThreadParticipation,
  ThreadTimeline,
};

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

/** Every public group the reader may join, read page by page, in group-ID order. */
const publicGroupsOf = perClient((client: ApiClient, workspaceId: string) =>
  client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client;
        const params = { workspaceId: Workspace.Id.make(workspaceId) };
        const groups: Array<Group.PublicItem> = [];
        let after: Group.Id | undefined;
        while (true) {
          const page = yield* api.groups.listPublic({
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
    .pipe(Atom.withReactivity([workspaceKey(workspaceId, "public-groups")])),
);
export const publicGroupsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId) ? publicGroupsOf(client, workspaceId) : undefined;

/** A group's current admissions, read page by page: whom its messages can mention. */
const rosterOf = perClient((client: ApiClient, key: string) => {
  const { workspaceId, id } = split(key);
  return client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client;
        const params = { workspaceId, groupId: Group.Id.make(id) };
        const admissions: Array<GroupMembership.Record> = [];
        let after: GroupMembership.Id | undefined;
        while (true) {
          const page = yield* api.groups.members({
            params,
            query: after === undefined ? { limit: 100 } : { limit: 100, after },
          });
          admissions.push(...page);
          const last = page.at(-1);
          if (page.length < 100 || last === undefined) return admissions;
          after = last.id;
        }
      }),
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "rosters", id)));
});
export const rosterRead = (client: ApiClient, workspaceId: string, groupId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(Group.Id)(groupId))
    ? rosterOf(client, joined(workspaceId, groupId))
    : undefined;

/** A thread's current participants, read page by page: whether the reader follows it. */
const participantsOf = perClient((client: ApiClient, key: string) => {
  const { workspaceId, id } = split(key);
  return client.runtime
    .atom(
      Effect.gen(function* () {
        const api = yield* client;
        const params = { workspaceId, threadId: Thread.Id.make(id) };
        const participants: Array<ThreadParticipation.Summary> = [];
        let after: ThreadParticipation.Id | undefined;
        while (true) {
          const page = yield* api.threads.participants({
            params,
            query: after === undefined ? { limit: 100 } : { limit: 100, after },
          });
          participants.push(...page);
          const last = page.at(-1);
          if (page.length < 100 || last === undefined) return participants;
          after = last.id;
        }
      }),
    )
    .pipe(Atom.withReactivity(itemKeys(workspaceId, "participants", id)));
});
export const participantsRead = (client: ApiClient, workspaceId: string, threadId: string) =>
  valid(workspaceId) && Option.isSome(Schema.decodeOption(Thread.Id)(threadId))
    ? participantsOf(client, joined(workspaceId, threadId))
    : undefined;

/** What the reader may do across the workspace, as permission names. */
export const permissionsRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("assignments", "permissions", {
        params: { workspaceId: Workspace.Id.make(workspaceId) },
        reactivityKeys: [workspaceKey(workspaceId, "permissions")],
      })
    : undefined;

/** The workspace's members, to name authors. */
export const membersRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("members", "list", {
        params: { workspaceId: Workspace.Id.make(workspaceId) },
        reactivityKeys: [workspaceKey(workspaceId, "members")],
      })
    : undefined;

/**
 * A view that pages back from the newest end. `items` are in the order the view shows them;
 * `complete` means nothing older remains. `earlier` counts the reader's requests for older items,
 * so a read can tell a request for more from a refresh.
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

/** How many notifications one inbox page reads. */
export const inboxPageSize = 25;
/** Newest first, then ID in descending binary order: the inbox's page order. */
const recordedAfter = (left: Notification.Record, right: Notification.Record) =>
  DateTime.toEpochMillis(left.recordedAt) - DateTime.toEpochMillis(right.recordedAt) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
/** Everything in the reader's inbox, or only what is still pending for them. */
export type InboxFilter = "all" | "pending";
const inboxOf = perClient(
  (client: ApiClient, key: string): PagedRead<NotificationInbox.Item, unknown> => {
    const { workspaceId, id: filter } = split(key);
    const earlier = Atom.make(0);
    const atom = client.runtime
      .atom(
        Effect.fnUntraced(function* (get) {
          const api = yield* client;
          const requested = get(earlier);
          const previous = previousOf<NotificationInbox.Item>(get);
          // The oldest notification shown stays shown: a refresh reads down to it, and a request
          // for more reads one page past it. New notifications arrive at the top.
          const reach = Option.flatMap(previous, (view) =>
            Option.fromUndefinedOr(view.items.at(-1)),
          );
          const more = Option.isNone(previous) || requested > previous.value.earlier;
          const newestFirst: Array<NotificationInbox.Item> = [];
          let before: Pick<Notification.Record, "recordedAt" | "id"> | undefined;
          let complete = false;
          while (true) {
            const page = yield* api.notifications.inbox({
              params: { workspaceId },
              query: {
                limit: inboxPageSize,
                ...(filter === "pending" ? { pendingOnly: true } : {}),
                ...(before === undefined ? {} : { before }),
              },
            });
            newestFirst.push(...page);
            const last = page.at(-1);
            if (page.length < inboxPageSize || last === undefined) {
              complete = true;
              break;
            }
            before = { recordedAt: last.notification.recordedAt, id: last.notification.id };
            if (Option.isNone(reach)) break;
            const oldest = reach.value.notification;
            const done = more
              ? newestFirst.filter((item) => recordedAfter(item.notification, oldest) < 0).length >=
                inboxPageSize
              : recordedAfter(last.notification, oldest) <= 0;
            if (done) break;
          }
          return { items: newestFirst, complete, earlier: requested };
        }),
      )
      .pipe(Atom.withReactivity([workspaceKey(workspaceId, "inbox")]));
    return { atom, earlier };
  },
);
/** The reader's inbox, newest first, with each notification's source where they can read it. */
export const inboxRead = (client: ApiClient, workspaceId: string, filter: InboxFilter) =>
  valid(workspaceId) ? inboxOf(client, joined(workspaceId, filter)) : undefined;

/** How many notifications are still pending for the reader, as the inbox reads them. */
export const pendingCountRead = (client: ApiClient, workspaceId: string) =>
  valid(workspaceId)
    ? client.query("notifications", "count", {
        params: { workspaceId: Workspace.Id.make(workspaceId) },
        reactivityKeys: [workspaceKey(workspaceId, "inbox")],
      })
    : undefined;

/**
 * Record that the reader saw everything still pending for them up to the newest notification
 * they are shown, then invalidate their inbox and pending counts. What arrived after it stays.
 */
export const seenThroughRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (through: Pick<Notification.Record, "recordedAt" | "id">) =>
    Effect.gen(function* () {
      const api = yield* client;
      const { acknowledged } = yield* api.notifications.acknowledgeThrough({
        params: { workspaceId: yield* command(Workspace.Id)(workspace) },
        payload: { through: { recordedAt: through.recordedAt, id: through.id } },
      });
      yield* Reactivity.invalidate([
        workspaceKey(workspace, "inbox"),
        workspaceKey(workspace, "groups"),
      ]);
      return acknowledged;
    }),
  );

/**
 * Record that the reader saw a notification, then invalidate their inbox and pending counts, as
 * their own signal would when it arrives. Seeing it again keeps the first time.
 */
export const seenRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (notificationId: string) =>
    Effect.gen(function* () {
      const api = yield* client;
      yield* api.notifications.acknowledge({
        params: {
          workspaceId: yield* command(Workspace.Id)(workspace),
          notificationId: yield* command(Notification.Id)(notificationId),
        },
      });
      yield* Reactivity.invalidate([
        workspaceKey(workspace, "inbox"),
        workspaceKey(workspace, "groups"),
      ]);
    }),
  );

/**
 * A team group to create: its name, everyone admitted to it, the creator included, and whether
 * anyone in the workspace may find and join it.
 */
export interface NewGroup {
  readonly name: string;
  readonly memberIds: ReadonlyArray<string>;
  readonly visibility: Group.Visibility;
  readonly key: ReturnType<typeof newWorkspaceRequestKey>;
}
/** Whether a name can name a group: it has something besides surrounding whitespace. */
export const isGroupName = (name: string) => Schema.is(Group.Name)(name.trim());
/**
 * Create a team group, then invalidate the reader's groups and the public ones, as the change feed
 * would when the commit arrives. A retry with the same key returns the first attempt's group.
 */
export const createGroupRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (group: NewGroup) =>
    Effect.gen(function* () {
      const api = yield* client;
      const created = yield* api.groups.create({
        params: { workspaceId: yield* command(Workspace.Id)(workspace) },
        headers: { "idempotency-key": group.key },
        payload: yield* command(Group.CreateTeamInput)({
          name: group.name.trim(),
          memberIds: group.memberIds,
          visibility: group.visibility,
        }),
      });
      yield* Reactivity.invalidate([
        workspaceKey(workspace, "groups"),
        workspaceKey(workspace, "public-groups"),
      ]);
      return created.id;
    }),
  );

/** Give a team group a new name, then invalidate the groups that show it. */
/**
 * Rename a team group from the name the reader last saw. A rename made meanwhile refuses it as
 * changed, and the groups refresh to show that name.
 */
export const renameGroupRequest = (client: ApiClient, workspace: string) =>
  requestAtom(
    client,
    (rename: { readonly groupId: string; readonly name: string; readonly expectedName: string }) =>
      Effect.gen(function* () {
        const api = yield* client;
        const renamed = yield* api.groups
          .rename({
            params: {
              workspaceId: yield* command(Workspace.Id)(workspace),
              groupId: yield* command(Group.Id)(rename.groupId),
            },
            payload: {
              name: yield* command(Group.Name)(rename.name.trim()),
              expectedName: yield* command(Group.Name)(rename.expectedName),
            },
          })
          .pipe(
            Effect.tapError((error) =>
              error._tag === "GroupApplication.Changed"
                ? Reactivity.invalidate([workspaceKey(workspace, "groups")])
                : Effect.void,
            ),
          );
        yield* Reactivity.invalidate([workspaceKey(workspace, "groups")]);
        return renamed;
      }),
  );

/**
 * Join a public group as the reader, then invalidate the groups, the public ones, and the inbox,
 * whose sources follow group access. Joining a group already joined returns the same admission.
 */
export const joinGroupRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (groupId: string) =>
    Effect.gen(function* () {
      const api = yield* client;
      const admission = yield* api.groups.join({
        params: {
          workspaceId: yield* command(Workspace.Id)(workspace),
          groupId: yield* command(Group.Id)(groupId),
        },
      });
      yield* Reactivity.invalidate([
        workspaceKey(workspace, "groups"),
        workspaceKey(workspace, "public-groups"),
        workspaceKey(workspace, "inbox"),
      ]);
      return admission.groupId as string;
    }),
  );

/** A change to who belongs to a team group: adding members, removing one, or leaving. */
export type MembershipChange =
  | { readonly kind: "add"; readonly groupId: string; readonly memberIds: ReadonlyArray<string> }
  | { readonly kind: "remove"; readonly groupId: string; readonly membershipId: string }
  | { readonly kind: "leave"; readonly groupId: string; readonly membershipId: string };
/**
 * Change a group's members, then invalidate what that changes: its roster and stream, the groups,
 * and the inbox, whose sources follow group access. Members are added one at a time; one already
 * added, as by someone else meanwhile, counts as added.
 */
export const membershipRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (change: MembershipChange) =>
    Effect.gen(function* () {
      const api = yield* client;
      const params = {
        workspaceId: yield* command(Workspace.Id)(workspace),
        groupId: yield* command(Group.Id)(change.groupId),
      };
      const invalidate = Reactivity.invalidate([
        itemKey(workspace, "rosters", change.groupId),
        itemKey(workspace, "streams", change.groupId),
        workspaceKey(workspace, "groups"),
        workspaceKey(workspace, "public-groups"),
        workspaceKey(workspace, "inbox"),
      ]);
      switch (change.kind) {
        case "add":
          // What was added before a failure stays added, so the reads refresh either way.
          yield* Effect.forEach(change.memberIds, (memberId) =>
            Effect.flatMap(command(Member.Id)(memberId), (id) =>
              api.groups.addMember({ params, payload: { memberId: id } }),
            ).pipe(
              Effect.asVoid,
              Effect.catchTag("GroupMembershipApplication.AlreadyMember", () => Effect.void),
            ),
          ).pipe(Effect.ensuring(invalidate));
          return;
        case "remove":
        case "leave": {
          const admission = {
            ...params,
            membershipId: yield* command(GroupMembership.Id)(change.membershipId),
          };
          if (change.kind === "remove") yield* api.groups.removeMember({ params: admission });
          else yield* api.groups.leave({ params: admission });
          yield* invalidate;
          return;
        }
      }
    }),
  );

/** Whether text can be sent as a message: it has something besides whitespace. */
export const isMessageText = Schema.is(ThreadMessage.Text);
export const newPostKey = newWorkspaceRequestKey;
interface Message {
  readonly text: string;
  /** The members the message addresses. */
  readonly mentions: ReadonlyArray<string>;
  readonly key: ReturnType<typeof newPostKey>;
}
/**
 * A message to post: the first of a new thread in a group, the first to some people in their
 * direct group, which it creates when they have none, or a reply in a thread.
 */
export type Post =
  | (Message & { readonly kind: "start"; readonly groupId: string })
  | (Message & { readonly kind: "direct"; readonly memberIds: ReadonlyArray<string> })
  | (Message & { readonly kind: "reply"; readonly threadId: string });
/** Where a posted message went. */
export interface Posted {
  readonly groupId?: string;
  readonly threadId: string;
}
/**
 * Post one message, then invalidate the reads it changes, as the change feed would when the
 * commit arrives, so it shows even while the feed is away. A retry with the same key returns the
 * first attempt's result.
 */
export const postRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (post: Post) =>
    Effect.gen(function* () {
      const api = yield* client;
      const workspaceId = yield* command(Workspace.Id)(workspace);
      const payload = {
        text: yield* command(ThreadMessage.Text)(post.text),
        mentions: yield* command(ThreadMessage.PublishInput.fields.mentions)(post.mentions),
      };
      const headers = { "idempotency-key": post.key };
      switch (post.kind) {
        case "start": {
          const groupId = yield* command(Group.Id)(post.groupId);
          const started = yield* api.threads.start({
            params: { workspaceId, groupId },
            headers,
            payload,
          });
          yield* Reactivity.invalidate([
            itemKey(workspace, "streams", groupId),
            workspaceKey(workspace, "groups"),
          ]);
          return { groupId, threadId: started.thread.id };
        }
        case "direct": {
          const started = yield* api.threads.startDirect({
            params: { workspaceId },
            headers,
            payload: {
              ...payload,
              memberIds: yield* command(Thread.StartDirectInput.fields.memberIds)(post.memberIds),
            },
          });
          const groupId = started.thread.groupId;
          yield* Reactivity.invalidate([
            itemKey(workspace, "streams", groupId),
            workspaceKey(workspace, "groups"),
          ]);
          return { groupId, threadId: started.thread.id };
        }
        case "reply": {
          const threadId = yield* command(Thread.Id)(post.threadId);
          yield* api.threads.publish({ params: { workspaceId, threadId }, headers, payload });
          // A reply changes its group's stream, whichever group that is.
          yield* Reactivity.invalidate([
            itemKey(workspace, "timelines", threadId),
            collectionKey(workspace, "streams"),
          ]);
          return { threadId };
        }
      }
    }).pipe(Effect.map((posted): Posted => posted)),
  );

/** What the reader has read: a thread through a timeline position, or a group caught up now. */
export type ReadMark =
  | { readonly kind: "thread"; readonly threadId: string; readonly through: number }
  | { readonly kind: "group"; readonly groupId: string };
/**
 * Record a read mark, then invalidate the unread state and pending counts it changes, as the
 * reader's own read signal would when it arrives. Positions only move forward on the server.
 */
export const readRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (mark: ReadMark) =>
    Effect.gen(function* () {
      const api = yield* client;
      const workspaceId = yield* command(Workspace.Id)(workspace);
      if (mark.kind === "thread")
        yield* api.threads.markRead({
          params: { workspaceId, threadId: yield* command(Thread.Id)(mark.threadId) },
          payload: { throughSequence: yield* command(Thread.Latest.fields.sequence)(mark.through) },
        });
      else
        yield* api.groups.markRead({
          params: { workspaceId, groupId: yield* command(Group.Id)(mark.groupId) },
        });
      // Reading a thread settles the reader's notifications from it.
      yield* Reactivity.invalidate([
        workspaceKey(workspace, "groups"),
        collectionKey(workspace, "streams"),
        ...(mark.kind === "thread" ? [workspaceKey(workspace, "inbox")] : []),
      ]);
    }),
  );

/** Following a thread, which makes the reader take part in it, or a team group, or stopping. */
export type Follow =
  | { readonly kind: "follow-thread"; readonly threadId: string }
  | {
      readonly kind: "unfollow-thread";
      readonly threadId: string;
      readonly participationId: string;
    }
  | { readonly kind: "follow-group"; readonly groupId: string; readonly memberId: string }
  | { readonly kind: "unfollow-group"; readonly groupId: string; readonly memberId: string };
/**
 * Follow or stop following, then refresh the read that shows it and wait for the result, so the
 * read answers once the request does. A refresh that fails leaves the read as it was.
 */
export const followRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (follow: Follow, get) =>
    Effect.gen(function* () {
      const api = yield* client;
      const workspaceId = yield* command(Workspace.Id)(workspace);
      switch (follow.kind) {
        case "follow-thread":
        case "unfollow-thread": {
          const threadId = yield* command(Thread.Id)(follow.threadId);
          if (follow.kind === "follow-thread")
            yield* api.threads.follow({ params: { workspaceId, threadId } });
          else
            yield* api.threads.unfollow({
              params: { workspaceId, threadId },
              payload: {
                participationId: yield* command(ThreadParticipation.Id)(follow.participationId),
              },
            });
          yield* Effect.ignore(
            refreshResult(get, participantsOf(client, joined(workspace, threadId))),
          );
          return;
        }
        case "follow-group":
        case "unfollow-group": {
          const params = { workspaceId, groupId: yield* command(Group.Id)(follow.groupId) };
          const payload = { memberId: yield* command(Member.Id)(follow.memberId) };
          if (follow.kind === "follow-group") yield* api.groups.follow({ params, payload });
          else yield* api.groups.unfollow({ params, payload });
          yield* Effect.ignore(refreshResult(get, groupsOf(client, workspace)));
          return;
        }
      }
    }),
  );
