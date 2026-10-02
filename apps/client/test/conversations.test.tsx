import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useGroupFollow,
  useThreadFollow,
  type FollowController,
  useGroupStream,
  useInbox,
  useInboxPending,
  useMarkAllSeen,
  useCreateGroup,
  useJoinGroup,
  usePublicGroups,
  useDirectMessage,
  useRenameGroup,
  useGroupMembers,
  useWorkspacePermission,
  useMarkGroupRead,
  useMarkSeen,
  useMarkThreadRead,
  useNewThread,
  useReply,
  useThreadTimeline,
  type ComposerController,
  type CreateGroupController,
  type JoinGroupController,
  type RenameGroupController,
  type GroupMembersController,
  type NotificationInbox,
  type PagedView,
  type SeenAllController,
  type SeenController,
  type SessionStore,
  type Thread,
  type ThreadTimeline,
} from "../src/index.ts";
import { affectedKeys, signalKeys } from "../src/live/api.ts";

afterEach(cleanup);
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };
const minute = (index: number) => new Date(Date.UTC(2026, 8, 25, 12, index)).toISOString();
const author = { _tag: "Member", memberId: "owner" };
const message = (id: string, threadId: string, at: string) => ({
  id,
  workspaceId: "one",
  threadId,
  author,
  text: `Message ${id}`,
  mentions: [],
  publishedAt: at,
  turnId: null,
});
/** A thread started at the given minute, with its opening message and no replies. */
const opening = (index: number) => {
  const id = `thread-${String(index).padStart(3, "0")}`;
  return {
    thread: {
      id,
      workspaceId: "one",
      groupId: "group",
      createdBy: author,
      createdAt: minute(index),
    },
    message: message(`${id}-opening`, id, minute(index)),
    replies: 0,
    latest: { threadId: id, sequence: 1, occurredAt: minute(index) },
    readThrough: 1,
    unread: false,
  };
};
const item = (sequence: number) => ({
  activity: {
    id: `activity-${sequence}`,
    workspaceId: "one",
    threadId: "thread",
    sequence,
    occurredAt: minute(sequence),
    kind: "message.published",
    subject: `message:message-${sequence}`,
    occurrence: `message:message-${sequence}`,
    newActivity: true,
    details: { messageId: `message-${sequence}` },
  },
  message: message(`message-${sequence}`, "thread", minute(sequence)),
});
/** Serves a group's openings newest start first, and a thread's timeline, from arrays. */
function host(
  openings: Array<ReturnType<typeof opening>>,
  timeline: Array<ReturnType<typeof item>>,
) {
  const requests: Array<URL> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = new URL(new Request(input, init).url);
    requests.push(url);
    const limit = Number(url.searchParams.get("limit"));
    if (url.pathname.endsWith("/openings")) {
      const before = url.searchParams.get("before");
      const cursor = before === null ? undefined : (JSON.parse(before) as { threadId: string });
      const ordered = openings.toSorted((a, b) => (a.thread.id < b.thread.id ? 1 : -1));
      const start =
        cursor === undefined ? 0 : ordered.findIndex((o) => o.thread.id < cursor.threadId);
      return Promise.resolve(json(start < 0 ? [] : ordered.slice(start, start + limit)));
    }
    const after = Number(url.searchParams.get("afterSequence") ?? 0);
    const before = Number(url.searchParams.get("beforeSequence") ?? Infinity);
    const range = timeline.filter(
      (entry) => entry.activity.sequence > after && entry.activity.sequence < before,
    );
    return Promise.resolve(
      json(url.searchParams.get("from") === "newest" ? range.slice(-limit) : range.slice(0, limit)),
    );
  });
  return { fetch, requests };
}
function mount<A>(fetch: typeof globalThis.fetch, use: () => PagedView<A>) {
  let view!: PagedView<A>;
  function Consumer() {
    view = use();
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  return () => view;
}

it("maps conversation facts and signals to the reads of their groups and threads", () => {
  const keys = (names: Array<{ name: string; payload?: unknown }>) =>
    affectedKeys("one", names).toSorted();
  expect(
    keys([
      {
        name: "thread.activity.recorded",
        payload: { groupId: "group", activity: { threadId: "thread" } },
      },
    ]),
  ).toEqual([
    "workspace/one/groups",
    "workspace/one/streams:group",
    "workspace/one/timelines:thread",
  ]);
  // Leaving a group also changes which notification sources the reader can still read.
  // Every open thread checks its access again, since the fact names no threads.
  // Public groups show who belongs, so their listing refreshes too.
  expect(keys([{ name: "group.membership.removed", payload: { groupId: "group" } }])).toEqual([
    "workspace/one/active-turns",
    "workspace/one/groups",
    "workspace/one/inbox",
    "workspace/one/participants",
    "workspace/one/public-groups",
    "workspace/one/rosters:group",
    "workspace/one/streams:group",
    "workspace/one/timelines",
  ]);
  // A payload without the expected field refreshes the whole collection rather than none.
  expect(keys([{ name: "thread.activity.recorded", payload: {} }])).toEqual([
    "workspace/one/groups",
    "workspace/one/streams",
    "workspace/one/timelines",
  ]);
  expect(keys([{ name: "workspace.assignment.revoked" }])).toContain("workspace/one/streams");
  // A new name shows wherever the groups list names the group, and among public groups.
  expect(keys([{ name: "group.renamed", payload: { groupId: "group" } }])).toEqual([
    "workspace/one/groups",
    "workspace/one/public-groups",
  ]);
  // A public group's creation reaches everyone who might join it.
  expect(keys([{ name: "group.created", payload: { id: "group" } }])).toEqual([
    "workspace/one/groups",
    "workspace/one/public-groups",
  ]);
  // Each read refreshes once: a notification repeats no key, and a collection covers its items.
  expect(
    affectedKeys(
      "one",
      [
        {
          name: "thread.activity.recorded",
          payload: { groupId: "group", activity: { threadId: "thread" } },
        },
        { name: "workspace.assignment.created" },
      ],
      true,
    ).toSorted(),
  ).toEqual([
    "workspace/one/active-turns",
    "workspace/one/agents",
    "workspace/one/connections",
    "workspace/one/environments",
    "workspace/one/groups",
    "workspace/one/inbox",
    "workspace/one/members",
    "workspace/one/ownership",
    "workspace/one/participants",
    "workspace/one/permissions",
    "workspace/one/rosters",
    "workspace/one/settings",
    "workspace/one/streams",
    "workspace/one/timelines",
    "workspace/one/turns",
  ]);
  // Reading a thread settles notifications from it.
  expect(signalKeys("one", { _tag: "ThreadRead" })).toEqual([
    "workspace/one/groups",
    "workspace/one/streams",
    "workspace/one/inbox",
  ]);
  expect(signalKeys("one", { _tag: "NotificationsSeen" })).toEqual([
    "workspace/one/groups",
    "workspace/one/inbox",
  ]);
  expect(signalKeys("one", { _tag: "GroupRead" })).toEqual(["workspace/one/groups"]);
  expect(signalKeys("one", { _tag: "Typing" })).toEqual([]);
});

it("a stream opens at its newest threads, pages back, and a refresh keeps what is shown", async () => {
  const openings = Array.from({ length: 120 }, (_, index) => opening(index));
  const { fetch, requests } = host(openings, []);
  const view = mount(fetch, () => useGroupStream("one", "group"));
  const ids = () =>
    view()
      .value()
      ?.map((entry: Thread.Opening) => entry.thread.id) ?? [];
  await waitFor(() => expect(ids()).toHaveLength(50));
  // Oldest first, ending at the newest.
  expect(ids()[0]).toBe("thread-070");
  expect(ids().at(-1)).toBe("thread-119");
  expect(view().complete()).toBe(false);
  view().loadEarlier();
  await waitFor(() => expect(ids()).toHaveLength(100));
  expect(ids()[0]).toBe("thread-020");
  // A new thread arrives at the newest end; nothing shown drops off the oldest end.
  openings.push(opening(120));
  requests.length = 0;
  view().retry();
  await waitFor(() => expect(ids().at(-1)).toBe("thread-120"));
  expect((ids()[0] ?? "") <= "thread-020").toBe(true);
  expect(requests.every((url) => url.pathname.endsWith("/groups/group/openings"))).toBe(true);
  view().loadEarlier();
  await waitFor(() => expect(view().complete()).toBe(true));
  expect(ids()).toHaveLength(121);
  expect(ids()[0]).toBe("thread-000");
  expect(view().failure()).toBeUndefined();
});

it("an older page that fails says so, and loading again tries it once more", async () => {
  const openings = Array.from({ length: 120 }, (_, index) => opening(index));
  const { fetch: answer, requests } = host(openings, []);
  let failOlder = true;
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = new URL(new Request(input, init).url);
    if (failOlder && url.searchParams.has("before")) {
      requests.push(url);
      return Promise.resolve(new Response("Host unavailable", { status: 503 }));
    }
    return answer(input, init);
  });
  const view = mount(fetch, () => useGroupStream("one", "group"));
  await waitFor(() => expect(view().value()).toHaveLength(50));
  view().loadEarlier();
  await waitFor(() => expect(view().earlierFailed()).toBe(true));
  // What was shown stays shown.
  expect(view().value()).toHaveLength(50);
  expect(view().loadingEarlier()).toBe(false);
  const asked = requests.length;
  failOlder = false;
  view().loadEarlier();
  await waitFor(() => expect(view().value()).toHaveLength(100));
  expect(requests.length).toBeGreaterThan(asked);
  expect(view().earlierFailed()).toBe(false);
});

it("a timeline opens at its newest activity, pages back once, and a change reads only what followed", async () => {
  const timeline = Array.from({ length: 70 }, (_, index) => item(index + 1));
  const { fetch, requests } = host([], timeline);
  const view = mount(fetch, () => useThreadTimeline("one", "thread"));
  const sequences = () =>
    view()
      .value()
      ?.map((entry: ThreadTimeline.Item) => entry.activity.sequence) ?? [];
  await waitFor(() => expect(sequences()).toHaveLength(50));
  expect([sequences()[0], sequences().at(-1)]).toEqual([21, 70]);
  // The first read and its catch-up are the only reads so far.
  expect(requests.map((url) => url.search)).toEqual(["?limit=50&from=newest"]);
  requests.length = 0;
  timeline.push(item(71), item(72));
  view().retry();
  await waitFor(() => expect(sequences().at(-1)).toBe(72));
  expect(requests.map((url) => url.searchParams.get("afterSequence"))).toEqual(["70"]);
  requests.length = 0;
  view().loadEarlier();
  await waitFor(() => expect(view().complete()).toBe(true));
  expect(sequences()).toEqual(Array.from({ length: 72 }, (_, index) => index + 1));
  expect(
    requests.map((url) => [
      url.searchParams.get("beforeSequence"),
      url.searchParams.get("afterSequence"),
    ]),
  ).toEqual([
    ["21", null],
    [null, "72"],
  ]);
});

/** A notification for Alice recorded at the given minute, from the given thread position. */
const notification = (index: number, state: { _tag: string } = { _tag: "Pending" }) => {
  const id = `notification-${String(index).padStart(3, "0")}`;
  return {
    notification: {
      id,
      workspaceId: "one",
      source: { logId: "journal", entryId: `entry-${index}` },
      participationId: "participation",
      thread: { threadId: "thread", groupId: "group", sequence: index + 1 },
      recipient: { _tag: "Human", id: "alice", memberId: "alice-member" },
      recordedAt: minute(index),
      state,
    },
    source: item(index + 1),
  };
};
/** Serves the inbox newest first, pending only when asked, and marks notifications seen. */
function inboxHost(inbox: Array<ReturnType<typeof notification>>) {
  const requests: Array<URL> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(url);
    const markedSeen = /\/notifications\/([^/]+)\/seen$/.exec(url.pathname);
    if (request.method === "POST" && markedSeen) {
      const entry = inbox.find(
        (value) => value.notification.id === decodeURIComponent(markedSeen[1] ?? ""),
      );
      if (!entry) return Promise.resolve(new Response(null, { status: 404 }));
      entry.notification.state = { _tag: "Seen", seenAt: minute(59) } as { _tag: string };
      return Promise.resolve(json(entry.notification));
    }
    const limit = Number(url.searchParams.get("limit"));
    const before = url.searchParams.get("before");
    const cursor = before === null ? undefined : (JSON.parse(before) as { id: string });
    const shown = inbox
      .filter(
        (value) =>
          url.searchParams.get("pendingOnly") !== "true" ||
          value.notification.state._tag === "Pending",
      )
      .filter((value) => cursor === undefined || value.notification.id < cursor.id)
      .toSorted((a, b) => (a.notification.id < b.notification.id ? 1 : -1));
    return Promise.resolve(json(shown.slice(0, limit)));
  });
  return { fetch, requests };
}

it("an inbox opens at its newest notifications, pages back, and a refresh keeps what is shown", async () => {
  const inbox = Array.from({ length: 60 }, (_, index) => notification(index));
  const { fetch, requests } = inboxHost(inbox);
  const view = mount(fetch, () => useInbox("one", "all"));
  const ids = () =>
    view()
      .value()
      ?.map((entry: NotificationInbox.Item) => entry.notification.id) ?? [];
  await waitFor(() => expect(ids()).toHaveLength(25));
  // Newest first, with each notification's source.
  expect([ids()[0], ids().at(-1)]).toEqual(["notification-059", "notification-035"]);
  expect(view().value()?.[0]?.source).toMatchObject({ message: { id: "message-60" } });
  view().loadEarlier();
  await waitFor(() => expect(ids()).toHaveLength(50));
  expect(ids().at(-1)).toBe("notification-010");
  // A new notification arrives at the top; nothing shown drops off the bottom.
  inbox.push(notification(60));
  requests.length = 0;
  view().retry();
  await waitFor(() => expect(ids()[0]).toBe("notification-060"));
  expect((ids().at(-1) ?? "") <= "notification-010").toBe(true);
  expect(requests.every((url) => url.pathname === "/workspaces/one/notifications/inbox")).toBe(
    true,
  );
  expect(requests.every((url) => !url.searchParams.has("pendingOnly"))).toBe(true);
  view().loadEarlier();
  await waitFor(() => expect(view().complete()).toBe(true));
  expect(ids()).toHaveLength(61);
});

it("marks everything seen through the newest shown, leaving the refresh to its signal", async () => {
  const inbox = [notification(0), notification(1), notification(2)];
  const posts: Array<unknown> = [];
  const { fetch: serve, requests } = inboxHost(inbox);
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (
      request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/notifications/seen")
    ) {
      const body = (await request.json()) as { through: { id: string } };
      posts.push(body);
      for (const entry of inbox)
        if (entry.notification.id <= body.through.id)
          entry.notification.state = { _tag: "Seen" } as { _tag: string };
      return json({ marked: 3 });
    }
    return serve(input, init);
  });
  let seen!: SeenAllController;
  const view = mount(fetch, () => {
    seen = useMarkAllSeen("one");
    return useInbox("one", "pending");
  });
  await waitFor(() => expect(view().value()).toHaveLength(3));
  const newest = view().value()![0]!.notification;
  const reads = requests.length;
  seen.markAllSeen(newest);
  await waitFor(() =>
    expect(posts).toEqual([{ through: { recordedAt: minute(2), id: "notification-002" } }]),
  );
  await waitFor(() => expect(seen.pending()).toBe(false));
  // The reader's sessions refresh the inbox when its signal arrives through the change feed.
  expect(requests.length).toBe(reads);
  view().retry();
  await waitFor(() => expect(view().value()).toEqual([]));
  expect(seen.error()).toBeUndefined();
});

it("a pending inbox asks for pending notifications, and no longer lists one the reader saw", async () => {
  const inbox = [notification(0), notification(1, { _tag: "Seen" }), notification(2)];
  const { fetch, requests } = inboxHost(inbox);
  let seen!: SeenController;
  const view = mount(fetch, () => {
    seen = useMarkSeen("one", "notification-002");
    return useInbox("one", "pending");
  });
  const ids = () =>
    view()
      .value()
      ?.map((entry: NotificationInbox.Item) => entry.notification.id) ?? [];
  await waitFor(() => expect(ids()).toEqual(["notification-002", "notification-000"]));
  expect(requests[0]?.searchParams.get("pendingOnly")).toBe("true");
  seen.markSeen();
  await waitFor(() => expect(seen.seen()).toBe(true));
  // Its signal refreshes the inbox through the change feed, which then no longer lists it.
  view().retry();
  await waitFor(() => expect(ids()).toEqual(["notification-000"]));
  expect(seen.error()).toBeUndefined();
});

it("the inbox's pending count is the inbox's own, from groups left too", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    return Promise.resolve(json(path.endsWith("/notifications/count") ? { pending: 5 } : []));
  });
  let pending!: () => number | undefined;
  function Consumer() {
    pending = useInboxPending("one");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  expect(pending()).toBeUndefined();
  await waitFor(() => expect(pending()).toBe(5));
});

it("creates a group with the reader in it, retrying with the same key, and reads permissions", async () => {
  const posts: Array<{ key: string | null; body: unknown }> = [];
  let failNext = true;
  const created = {
    id: "g2",
    workspaceId: "one",
    kind: "Team",
    visibility: "Private",
    name: "Receipts",
    createdBy: "alice-one",
    createdAt: minute(0),
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({
        memberships: [
          {
            workspace: {
              id: "one",
              name: "Studio",
              createdBy: "alice",
              ownerMemberId: "alice-one",
            },
            member: {
              id: "alice-one",
              workspaceId: "one",
              identity: { _tag: "Human", id: "alice" },
              status: "active",
            },
            people: 2,
          },
        ],
        invitations: [],
      });
    if (path.endsWith("/permissions")) return json(["group.create", "invitation.manage"]);
    if (request.method !== "POST") return json([]);
    posts.push({ key: request.headers.get("idempotency-key"), body: await request.json() });
    if (failNext) {
      failNext = false;
      return new Response("Host unavailable", { status: 503 });
    }
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  const opened: Array<string> = [];
  let group!: CreateGroupController;
  let creator!: () => boolean | undefined;
  function Consumer() {
    group = useCreateGroup("one", (groupId) => opened.push(groupId));
    creator = useWorkspacePermission("one", "group.create");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect(creator()).toBe(true));
  expect(group.ready()).toBe(false);
  group.setName("  ");
  expect(group.ready()).toBe(false);
  group.setName("  Receipts ");
  group.setMembers(["bob-one"]);
  await waitFor(() => expect(group.ready()).toBe(true));
  group.create();
  await waitFor(() => expect(group.error()).toBe("failed"));
  // The same group again keeps its key, so one created unseen is not created twice.
  group.create();
  await waitFor(() => expect(opened).toEqual(["g2"]));
  expect(posts).toHaveLength(2);
  expect(posts[0]?.key).toBe(posts[1]?.key);
  expect(posts[1]?.body).toEqual({
    name: "Receipts",
    memberIds: ["alice-one", "bob-one"],
    visibility: "Private",
  });
  // A public group is another group, with its own key.
  group.setName("Lobby");
  group.setVisibility("Public");
  group.create();
  await waitFor(() => expect(posts).toHaveLength(3));
  expect(posts[2]?.body).toEqual({
    name: "Lobby",
    memberIds: ["alice-one", "bob-one"],
    visibility: "Public",
  });
  expect(posts[2]?.key).not.toBe(posts[1]?.key);
  await waitFor(() => expect(opened).toEqual(["g2", "g2"]));
  group.reset();
  expect([group.name(), group.members(), group.visibility(), group.error()]).toEqual([
    "",
    [],
    "Private",
    undefined,
  ]);
});

it("lists public groups and joins one, refreshing the list; a group gone says so", async () => {
  let joined = false;
  const team = (id: string, name: string) => ({
    id,
    workspaceId: "one",
    kind: "Team",
    visibility: "Public",
    name,
    createdBy: "alice-one",
    createdAt: minute(0),
  });
  const joins: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/workspaces/one/groups/public")
      return json([
        { group: team("g1", "Lobby"), members: joined ? 3 : 2, joined },
        { group: team("g2", "Gone"), members: 1, joined: false },
      ]);
    if (path === "/workspaces/one/groups/g1/join") {
      joins.push(path);
      joined = true;
      return json({
        id: "a-1",
        workspaceId: "one",
        groupId: "g1",
        memberId: "alice-one",
        admittedAt: minute(1),
        status: "active",
      });
    }
    if (path === "/workspaces/one/groups/g2/join")
      return new Response(
        JSON.stringify({ _tag: "GroupMembershipService.GroupNotFound", groupId: "g2" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    return json([]);
  });
  const opened: Array<string> = [];
  let groups!: ReturnType<typeof usePublicGroups>;
  let join!: JoinGroupController;
  function Consumer() {
    groups = usePublicGroups("one");
    join = useJoinGroup("one", (groupId) => opened.push(groupId));
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  await waitFor(() =>
    expect(groups.value()?.map((item) => [item.group.name, item.members, item.joined])).toEqual([
      ["Lobby", 2, false],
      ["Gone", 1, false],
    ]),
  );
  join.join("g1");
  expect(join.joining()).toBe("g1");
  // One join at a time.
  join.join("g2");
  await waitFor(() => expect(opened).toEqual(["g1"]));
  expect(joins).toHaveLength(1);
  expect(join.joining()).toBeUndefined();
  // Joining refreshes the list, which now shows the reader among its members.
  await waitFor(() => expect(groups.value()?.[0]).toMatchObject({ members: 3, joined: true }));
  join.join("g2");
  await waitFor(() => expect(join.error()).toEqual({ groupId: "g2", failure: "gone" }));
  expect(opened).toEqual(["g1"]);
});

it("adds, removes, and leaves a group's members, refreshing its roster each time", async () => {
  const admission = (id: string, memberId: string, status = "active") => ({
    id,
    workspaceId: "one",
    groupId: "g1",
    memberId,
    admittedAt: minute(0),
    status,
  });
  let roster = [admission("a1", "alice-one"), admission("a2", "bob-one")];
  const changes: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({
        memberships: [
          {
            workspace: {
              id: "one",
              name: "Studio",
              createdBy: "alice",
              ownerMemberId: "alice-one",
            },
            member: {
              id: "alice-one",
              workspaceId: "one",
              identity: { _tag: "Human", id: "alice" },
              status: "active",
            },
            people: 3,
          },
        ],
        invitations: [],
      });
    if (path === "/workspaces/one/groups")
      return json([
        {
          group: {
            id: "g1",
            workspaceId: "one",
            kind: "Team",
            visibility: "Private",
            name: "Design",
            createdBy: "alice-one",
            createdAt: minute(0),
          },
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following: false,
          pending: 0,
          manageable: true,
          membersRemovable: true,
          renamable: true,
        },
      ]);
    if (path === "/workspaces/one/groups/g1/members" && request.method === "GET")
      return json(roster);
    if (path === "/workspaces/one/groups/g1/members" && request.method === "POST") {
      const { memberId } = (await request.json()) as { memberId: string };
      changes.push(`add ${memberId}`);
      // Someone else added Kit meanwhile: that still counts as added.
      if (memberId === "kit-one")
        return new Response(
          JSON.stringify({
            _tag: "GroupMembershipService.AlreadyMember",
            groupId: "g1",
            memberId,
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      const added = admission(`a-${memberId}`, memberId);
      roster = [...roster, added];
      return new Response(JSON.stringify(added), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    const departure = /^\/workspaces\/one\/groups\/g1\/members\/([^/]+)(\/leave)?$/.exec(path);
    if (departure) {
      const [, id = "", leave] = departure;
      changes.push(`${leave ? "leave" : "remove"} ${id}`);
      const ended = roster.find((entry) => entry.id === id)!;
      roster = roster.filter((entry) => entry.id !== id);
      return json({ ...ended, status: "removed" });
    }
    return json([]);
  });
  const events: Array<string> = [];
  let members!: GroupMembersController;
  function Consumer() {
    members = useGroupMembers("one", "g1", {
      added: () => events.push("added"),
      left: () => events.push("left"),
    });
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect(members.own()?.id).toBe("a1"));
  expect([members.manageable(), members.membersRemovable(), members.leavable()]).toEqual([
    true,
    true,
    true,
  ]);
  members.add(["cho-one", "kit-one"]);
  expect(members.changing()).toBe("add");
  await waitFor(() => expect(events).toEqual(["added"]));
  await waitFor(() => expect(members.roster()).toHaveLength(3));
  expect(members.error()).toBeUndefined();
  members.remove("a2");
  await waitFor(() =>
    expect(members.roster()?.map((entry) => entry.id)).toEqual(["a1", "a-cho-one"]),
  );
  members.leave();
  await waitFor(() => expect(events).toEqual(["added", "left"]));
  expect(changes).toEqual(["add cho-one", "add kit-one", "remove a2", "leave a1"]);
  expect(members.changing()).toBeUndefined();
});

it("a new thread in a group posts its first message there with a key, then clears", async () => {
  const posts: Array<{ path: string; key: string | null; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    posts.push({
      path: new URL(request.url).pathname,
      key: request.headers.get("idempotency-key"),
      body: await request.json(),
    });
    return new Response(
      JSON.stringify({
        thread: {
          id: "t9",
          workspaceId: "one",
          groupId: "g1",
          createdBy: author,
          createdAt: minute(1),
        },
        message: message("m9", "t9", minute(1)),
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
  let composer!: ComposerController;
  function Consumer() {
    composer = useNewThread("one", "g1");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  composer.setDraft("Kickoff notes");
  composer.send();
  await waitFor(() => expect(composer.draft()).toBe(""));
  expect(posts).toEqual([
    {
      path: "/workspaces/one/groups/g1/threads",
      key: expect.any(String),
      body: { text: "Kickoff notes", mentions: [] },
    },
  ]);
});

it("a first direct message starts the conversation and hands over its group", async () => {
  const posts: Array<{ path: string; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    const path = new URL(request.url).pathname;
    posts.push({ path, body: await request.json() });
    return new Response(
      JSON.stringify({
        thread: {
          id: "t9",
          workspaceId: "one",
          groupId: "g9",
          createdBy: author,
          createdAt: minute(1),
        },
        message: message("m9", "t9", minute(1)),
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
  const started: Array<string> = [];
  let composer!: ComposerController;
  function Consumer() {
    composer = useDirectMessage("one", ["bob-one"], (groupId) => started.push(groupId));
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  composer.setDraft("Are you free?");
  composer.send();
  await waitFor(() => expect(started).toEqual(["g9"]));
  expect(posts).toEqual([
    {
      path: "/workspaces/one/threads",
      body: { memberIds: ["bob-one"], text: "Are you free?", mentions: [] },
    },
  ]);
  expect(composer.draft()).toBe("");
});

it("renames a group it may rename, from the name it started from, saving only a change", async () => {
  let name = "Design";
  const renames: Array<unknown> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const group = {
      id: "g1",
      workspaceId: "one",
      kind: "Team",
      visibility: "Private",
      name,
      createdBy: "alice-one",
      createdAt: minute(0),
    };
    if (path === "/workspaces/one/groups/g1/rename") {
      const body = (await request.json()) as { name: string; expectedName: string };
      renames.push(body);
      // As the host does, a rename from a name the group no longer has is refused.
      if (body.name !== name && body.expectedName !== name)
        return new Response(JSON.stringify({ _tag: "GroupService.Changed", groupId: "g1" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      name = body.name;
      return json({ ...group, name });
    }
    if (path === "/workspaces/one/groups")
      return json([
        {
          group,
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following: false,
          pending: 0,
          manageable: true,
          membersRemovable: true,
          renamable: true,
        },
      ]);
    return json([]);
  });
  const saved: Array<string> = [];
  let rename!: RenameGroupController;
  function Consumer() {
    rename = useRenameGroup("one", "g1", () => saved.push("saved"));
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  await waitFor(() => expect(rename.renamable()).toBe(true));
  rename.reset();
  expect(rename.name()).toBe("Design");
  // The same name, or none, is nothing to save.
  expect(rename.ready()).toBe(false);
  rename.setName("   ");
  expect(rename.ready()).toBe(false);
  rename.setName("  Product design ");
  expect(rename.ready()).toBe(true);
  rename.save();
  await waitFor(() => expect(saved).toEqual(["saved"]));
  expect(renames).toEqual([{ name: "Product design", expectedName: "Design" }]);
  // Saving refreshes the groups, so the new name is the current one.
  await waitFor(() => expect(rename.current()).toBe("Product design"));
  // Someone renames it elsewhere while the reader drafts another name from the one they saw.
  rename.reset();
  name = "Plans";
  rename.setName("Roadmap");
  rename.save();
  await waitFor(() => expect(rename.error()).toBe("changed"));
  expect(renames.at(-1)).toEqual({ name: "Roadmap", expectedName: "Product design" });
  expect(saved).toEqual(["saved"]);
  // The refusal refreshes the groups, so the reader sees that name; saving again replaces it.
  await waitFor(() => expect(rename.current()).toBe("Plans"));
  expect(rename.name()).toBe("Roadmap");
  rename.save();
  await waitFor(() => expect(saved).toEqual(["saved", "saved"]));
  expect(renames.at(-1)).toEqual({ name: "Roadmap", expectedName: "Plans" });
});

it("a reply keeps its draft across remounts, retries with its key, and clears once posted", async () => {
  const posts: Array<{ key: string | null; body: unknown }> = [];
  let failNext = true;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    // Writing a reply tells the thread's readers; those signals are not posts.
    if (request.url.endsWith("/typing")) return new Response(null, { status: 204 });
    posts.push({ key: request.headers.get("idempotency-key"), body: await request.json() });
    if (failNext) {
      failNext = false;
      return new Response("Host unavailable", { status: 503 });
    }
    // The contract answers a publication with 201.
    return new Response(JSON.stringify(message("reply", "thread", minute(1))), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  const [shown, setShown] = createSignal(true);
  let composer!: ComposerController;
  function Consumer() {
    composer = useReply("one", "thread");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Show when={shown()}>
        <Consumer />
      </Show>
    </ClientProvider>
  ));
  expect(composer.ready()).toBe(false);
  composer.setDraft("   ");
  expect(composer.ready()).toBe(false);
  composer.setDraft("On it.");
  // The draft outlives the composer that wrote it.
  setShown(false);
  setShown(true);
  expect(composer.draft()).toBe("On it.");
  composer.send();
  await waitFor(() => expect(composer.error()).toBe("failed"));
  expect(composer.draft()).toBe("On it.");
  composer.send();
  await waitFor(() => expect(composer.draft()).toBe(""));
  expect(composer.error()).toBeUndefined();
  composer.setDraft("Second");
  composer.send();
  await waitFor(() => expect(posts).toHaveLength(3));
  expect(posts.map((post) => post.body)).toEqual([
    { text: "On it.", mentions: [] },
    { text: "On it.", mentions: [] },
    { text: "Second", mentions: [] },
  ]);
  // A retry of the same text reuses its key; a new message gets its own.
  expect(posts[0]!.key).toBe(posts[1]!.key);
  expect(posts[2]!.key).not.toBe(posts[0]!.key);
  expect(
    fetch.mock.calls
      .map(([input, init]) => new Request(input, init))
      .filter((request) => request.method === "POST" && !request.url.endsWith("/typing"))
      .map((request) => new URL(request.url).pathname),
  ).toEqual(Array.from({ length: 3 }, () => "/workspaces/one/threads/thread/messages"));
});

it("a send cut off by closing the thread is sent again with its key after reopening", async () => {
  const posts: Array<{ key: string | null; signal: AbortSignal }> = [];
  const held = Promise.withResolvers<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    if (request.url.endsWith("/typing")) return new Response(null, { status: 204 });
    posts.push({ key: request.headers.get("idempotency-key"), signal: request.signal });
    // The first may have reached the host before the reader closed the thread.
    if (posts.length === 1) return held.promise;
    return new Response(JSON.stringify(message("reply", "thread", minute(1))), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  const [shown, setShown] = createSignal(true);
  let composer!: ComposerController;
  function Consumer() {
    composer = useReply("one", "thread");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Show when={shown()}>
        <Consumer />
      </Show>
    </ClientProvider>
  ));
  composer.setDraft("On it.");
  composer.send();
  await waitFor(() => expect(posts).toHaveLength(1));
  // Closing the thread cuts the request off; its outcome is unknown.
  setShown(false);
  await waitFor(() => expect(posts[0]!.signal.aborted).toBe(true));
  setShown(true);
  expect(composer.draft()).toBe("On it.");
  composer.send();
  await waitFor(() => expect(composer.draft()).toBe(""));
  // The same key, so a host that already posted it answers with that message.
  expect(posts[1]!.key).toBe(posts[0]!.key);
});

it("a reply sends the members its text links to as its mentions", async () => {
  const bodies: Array<unknown> = [];
  let typed = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    if (request.url.endsWith("/typing")) {
      typed++;
      return new Response(null, { status: 204 });
    }
    bodies.push(await request.json());
    return new Response(JSON.stringify(message("reply", "thread", minute(1))), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });
  let composer!: ComposerController;
  function Consumer() {
    composer = useReply("one", "mentions");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  composer.setDraft("[@Ada](member:ada) and [@Jo](member:jo), look");
  expect(composer.mentions()).toEqual(["ada", "jo"]);
  // A name without its link addresses no one.
  composer.setDraft("[@Ada](member:ada), look, @Jo");
  expect(composer.mentions()).toEqual(["ada"]);
  composer.send();
  await waitFor(() =>
    expect(bodies).toEqual([{ text: "[@Ada](member:ada), look, @Jo", mentions: ["ada"] }]),
  );
  await waitFor(() => expect(composer.draft()).toBe(""));
  // Writing told the thread's readers once; the edits since were too soon to repeat it.
  expect(typed).toBe(1);
});

it("marks an open thread read once per newer position, only while the page shows", async () => {
  const marks: Array<{ path: string; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    marks.push({ path, body: request.method === "POST" ? await request.text() : null });
    return new Response(null, { status: 204 });
  });
  const hide = (hidden: boolean) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  hide(true);
  const [through, setThrough] = createSignal<number | undefined>(undefined);
  const [unreadSince, setUnreadSince] = createSignal<number | undefined>(undefined);
  function Consumer() {
    useMarkThreadRead("one", "thread", through);
    useMarkGroupRead("one", "group", unreadSince);
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <Consumer />
    </ClientProvider>
  ));
  setThrough(3);
  setUnreadSince(1000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  // Nothing counts as read while the page is hidden.
  expect(marks).toEqual([]);
  hide(false);
  await waitFor(() => expect(marks).toHaveLength(2));
  expect(marks).toContainEqual({
    path: "/workspaces/one/threads/thread/read",
    body: JSON.stringify({ throughSequence: 3 }),
  });
  expect(marks).toContainEqual({ path: "/workspaces/one/groups/group/read", body: "" });
  // The same position is not sent again; a newer one is.
  setThrough(3);
  setUnreadSince(undefined);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(marks).toHaveLength(2);
  setThrough(5);
  await waitFor(() => expect(marks).toHaveLength(3));
  expect(marks[2]).toEqual({
    path: "/workspaces/one/threads/thread/read",
    body: JSON.stringify({ throughSequence: 5 }),
  });
  hide(false);
});

it("follows and unfollows a thread and a group as the reader, showing each change at once", async () => {
  let participants: Array<unknown> = [];
  let following = false;
  const posts: Array<{ path: string; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({
        memberships: [
          {
            workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
            member: {
              id: "owner",
              workspaceId: "one",
              identity: { _tag: "Human", id: "alice" },
              status: "active",
            },
            people: 1,
          },
        ],
        invitations: [],
      });
    if (path.endsWith("/participants")) return json(participants);
    if (path.endsWith("/groups"))
      return json([
        {
          group: {
            id: "group",
            workspaceId: "one",
            kind: "Team",
            visibility: "Private",
            name: "Design",
            createdBy: "owner",
            createdAt: minute(0),
          },
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following,
          pending: 0,
          manageable: true,
          membersRemovable: true,
          renamable: true,
        },
      ]);
    const body = request.method === "POST" ? await request.text() : "";
    posts.push({ path, body: body ? JSON.parse(body) : undefined });
    if (path.endsWith("/threads/thread/follow")) {
      const summary = {
        id: "participation",
        workspaceId: "one",
        threadId: "thread",
        participant: { _tag: "Member", memberId: "owner" },
        joinedAt: minute(1),
        joinedAtSequence: 2,
      };
      participants = [summary];
      return json(summary);
    }
    if (path.endsWith("/threads/thread/unfollow")) participants = [];
    if (path.endsWith("/groups/group/follow")) following = true;
    if (path.endsWith("/groups/group/unfollow")) following = false;
    return new Response(null, { status: 204 });
  });
  let thread!: FollowController, group!: ReturnType<typeof useGroupFollow>;
  const changed: Array<[string, boolean]> = [];
  function Consumer() {
    thread = useThreadFollow("one", "group", "thread", {
      changed: (following) => changed.push(["thread", following]),
    });
    group = useGroupFollow("one", "group", {
      changed: (following) => changed.push(["group", following]),
    });
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect([thread.following(), group.following()]).toEqual([false, false]));
  expect(group.followable()).toBe(true);
  thread.toggle();
  await waitFor(() => expect(thread.following()).toBe(true));
  await waitFor(() => expect(thread.pending()).toBe(false));
  thread.toggle();
  await waitFor(() => expect(thread.following()).toBe(false));
  group.toggle();
  await waitFor(() => expect(group.following()).toBe(true));
  await waitFor(() => expect(group.pending()).toBe(false));
  group.toggle();
  await waitFor(() => expect(group.following()).toBe(false));
  await waitFor(() => expect(posts).toHaveLength(4));
  // Unfollowing names the participation the reader holds; groups are followed for the reader.
  expect(posts).toEqual([
    { path: "/workspaces/one/threads/thread/follow", body: undefined },
    {
      path: "/workspaces/one/threads/thread/unfollow",
      body: { participationId: "participation" },
    },
    { path: "/workspaces/one/groups/group/follow", body: { memberId: "owner" } },
    { path: "/workspaces/one/groups/group/unfollow", body: { memberId: "owner" } },
  ]);
  expect(changed).toEqual([
    ["thread", true],
    ["thread", false],
    ["group", true],
    ["group", false],
  ]);
});

it("a follow the read does not show settles on what the read says, and one that fails says so", async () => {
  // Such as someone else stopping it for the reader just after: the read has the last word.
  let fail = false;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && fail) return new Response(null, { status: 503 });
    if (path === "/me/workspaces")
      return json({
        memberships: [
          {
            workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
            member: {
              id: "owner",
              workspaceId: "one",
              identity: { _tag: "Human", id: "alice" },
              status: "active",
            },
            people: 1,
          },
        ],
        invitations: [],
      });
    if (path.endsWith("/groups"))
      return json([
        {
          group: {
            id: "group",
            workspaceId: "one",
            kind: "Team",
            visibility: "Private",
            name: "Design",
            createdBy: "owner",
            createdAt: minute(0),
          },
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following: false,
          pending: 0,
          manageable: true,
          membersRemovable: true,
          renamable: true,
        },
      ]);
    return new Response(null, { status: 204 });
  });
  let group!: ReturnType<typeof useGroupFollow>;
  const heard: Array<[string, boolean]> = [];
  function Consumer() {
    group = useGroupFollow("one", "group", {
      changed: (following) => heard.push(["changed", following]),
      failed: (following) => heard.push(["failed", following]),
    });
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect(group.following()).toBe(false));
  group.toggle();
  expect([group.following(), group.pending()]).toEqual([true, true]);
  await waitFor(() => expect(group.pending()).toBe(false));
  expect(group.following()).toBe(false);
  expect(group.error()).toBeUndefined();
  expect(heard).toEqual([]);
  fail = true;
  group.toggle();
  expect(group.following()).toBe(true);
  await waitFor(() => expect(group.pending()).toBe(false));
  expect(group.following()).toBe(false);
  expect(group.error()).toBeDefined();
  expect(heard).toEqual([["failed", true]]);
});

it("offers no following in a direct conversation, where everyone takes part in everything", async () => {
  const requests: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST") requests.push(path);
    if (path === "/me/workspaces")
      return json({
        memberships: [
          {
            workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
            member: {
              id: "owner",
              workspaceId: "one",
              identity: { _tag: "Human", id: "alice" },
              status: "active",
            },
            people: 2,
          },
        ],
        invitations: [],
      });
    if (path.endsWith("/participants"))
      return json([
        {
          id: "participation",
          workspaceId: "one",
          threadId: "thread",
          participant: { _tag: "Member", memberId: "owner" },
          joinedAt: minute(1),
          joinedAtSequence: 1,
        },
      ]);
    if (path.endsWith("/groups"))
      return json([
        {
          group: {
            id: "dm",
            workspaceId: "one",
            kind: "Direct",
            memberIds: ["ada", "owner"],
            createdBy: "owner",
            createdAt: minute(0),
          },
          latestActivityAt: null,
          readAt: null,
          newActivity: false,
          following: false,
          pending: 0,
          manageable: false,
          membersRemovable: false,
          renamable: false,
        },
      ]);
    return new Response(null, { status: 204 });
  });
  let thread!: FollowController;
  function Consumer() {
    thread = useThreadFollow("one", "dm", "thread");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect(thread.following()).toBe(true));
  expect(thread.followable()).toBe(false);
  thread.toggle();
  expect(thread.pending()).toBe(false);
  expect(requests).toEqual([]);
});
