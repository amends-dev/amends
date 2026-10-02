import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { createSignal } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useInboxView,
  ChangeFeedProvider,
  type InboxFilter,
  type SessionStore,
} from "../src/index.ts";
import { eventStream } from "./event-stream.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };
const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 12, minute)).toISOString();

const members = [
  { id: "owner", workspaceId: "one", identity: { _tag: "Human", id: "alice" }, status: "active" },
  {
    id: "ada",
    workspaceId: "one",
    identity: { _tag: "Human", id: "ada@example.test" },
    name: "Ada",
    status: "active",
  },
];
const listing = {
  memberships: [
    {
      workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
      member: members[0],
      people: 2,
    },
  ],
  invitations: [],
};
const groups = [
  {
    group: {
      id: "g1",
      workspaceId: "one",
      kind: "Team",
      visibility: "Private",
      name: "Design",
      createdBy: "owner",
      createdAt: at(0),
    },
    latestActivityAt: null,
    readAt: null,
    newActivity: false,
    following: true,
    pending: 1,
    manageable: true,
    membersRemovable: true,
    renamable: true,
  },
];
const message = (id: string, text: string, mentions: string[]) => ({
  id,
  workspaceId: "one",
  threadId: "t1",
  author: { _tag: "Member", memberId: "ada" },
  text,
  mentions,
  publishedAt: at(1),
  turnId: null,
});
const notification = (
  id: string,
  sequence: number,
  minute: number,
  text: string,
  mentions: string[] = [],
) => ({
  notification: {
    id,
    workspaceId: "one",
    source: { logId: "journal", entryId: `e${sequence}` },
    participationId: "p1",
    thread: { threadId: "t1", groupId: "g1", sequence },
    recipient: { _tag: "Human", id: "alice", memberId: "owner" },
    recordedAt: at(minute),
    state: { _tag: "Pending" } as Record<string, unknown>,
  },
  source: {
    activity: {
      id: `activity-${sequence}`,
      workspaceId: "one",
      threadId: "t1",
      sequence,
      occurredAt: at(minute),
      kind: "message.published",
      subject: `message:m${sequence}`,
      occurrence: `message:m${sequence}`,
      newActivity: true,
      details: { messageId: `m${sequence}` },
    },
    message: message(`m${sequence}`, text, mentions),
  },
});

function fixture(options: { readonly fail?: boolean } = {}) {
  const inbox = [
    notification("n3", 3, 3, "Can [@alice](member:owner) approve it?", ["owner"]),
    notification("n2", 2, 2, "Here is the draft."),
    notification("n1", 1, 1, "Starting the review."),
  ];
  const markedSeen: string[] = [];
  const through: unknown[] = [];
  const streams: Array<ReturnType<typeof eventStream>> = [];
  /** The server tells the reader's sessions what they saw, as it does after marking it. */
  const announceSeen = (notificationIds: ReadonlyArray<string>) =>
    streams.at(-1)?.send({
      _tag: "Signal",
      workspaceId: "one",
      signal: { _tag: "NotificationsSeen", workspaceId: "one", memberId: "owner", notificationIds },
    });
  const settle = (id: string) => {
    const entry = inbox.find((item) => item.notification.id === id);
    if (entry) entry.notification.state = { _tag: "Seen", seenAt: at(9) };
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/workspaces/one/changes") {
      const created = eventStream(request);
      streams.push(created);
      created.send({ _tag: "Ready", workspaceId: "one", cursor: null, reset: false });
      return created.response;
    }
    if (path === "/me/workspaces") return json(listing);
    if (path === "/workspaces/one/members") return json(members);
    if (path === "/workspaces/one/groups") return json(groups);
    if (path === "/workspaces/one/notifications/inbox") {
      const pendingOnly = url.searchParams.get("pendingOnly") === "true";
      return json(
        inbox.filter((item) => !pendingOnly || item.notification.state._tag === "Pending"),
      );
    }
    if (path === "/workspaces/one/notifications/count")
      return json({
        pending: inbox.filter((item) => item.notification.state._tag === "Pending").length,
      });
    if (request.method === "POST" && options.fail) return json({}, 503);
    const markSeen = /\/notifications\/([^/]+)\/seen$/.exec(path);
    if (request.method === "POST" && markSeen) {
      markedSeen.push(markSeen[1]!);
      settle(markSeen[1]!);
      announceSeen([markSeen[1]!]);
      return json(inbox.find((item) => item.notification.id === markSeen[1])!.notification);
    }
    if (request.method === "POST" && path === "/workspaces/one/notifications/seen") {
      through.push(await request.json());
      for (const item of inbox) settle(item.notification.id);
      announceSeen(inbox.map((item) => item.notification.id));
      return json({ marked: 3 });
    }
    return json({}, 404);
  });
  const [filter, setFilter] = createSignal<InboxFilter>("all");
  const [retain, setRetain] = createSignal<string>();
  const failed: string[] = [];
  let view!: ReturnType<typeof useInboxView>;
  function Consumer() {
    view = useInboxView("one", filter, retain, { failed: (change) => failed.push(change) });
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
        <ChangeFeedProvider workspaceId="one">
          <Consumer />
        </ChangeFeedProvider>
      </DirectoryProvider>
    </ClientProvider>
  ));
  return {
    get view() {
      return view;
    },
    setFilter,
    setRetain,
    markedSeen,
    through,
    failed,
  };
}

it("says why each notification came, from where, and what was said", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.entries()).toHaveLength(3));
  await waitFor(() =>
    expect(f.view.entries()[0]?.place).toEqual({ name: "Design", direct: false }),
  );
  expect(f.view.entries().map((entry) => entry.reason)).toEqual(["mention", "reply", "thread"]);
  expect(f.view.entries()[0]).toMatchObject({
    id: "n3",
    unread: true,
    author: { name: "Ada" },
    text: "Can [@alice](member:owner) approve it?",
    mentions: [{ id: "owner", name: "alice" }],
    thread: { groupId: "g1", threadId: "t1", sequence: 3 },
  });
  await waitFor(() => expect(f.view.unread()).toBe(3));
});

it("marks a notification seen as it opens, and keeps it in Unread while it stays open", async () => {
  const f = fixture();
  f.setFilter("pending");
  await waitFor(() => expect(f.view.entries()).toHaveLength(3));
  f.setRetain("n2");
  f.view.open("n2");
  // Seen at once, before the inbox refreshes.
  expect(f.view.entries().find((entry) => entry.id === "n2")?.unread).toBe(false);
  await waitFor(() => expect(f.markedSeen).toEqual(["n2"]));
  await waitFor(() => expect(f.view.unread()).toBe(2));
  // The refreshed Unread no longer holds it, but the open one stays in place.
  expect(f.view.entries().map((entry) => entry.id)).toEqual(["n3", "n2", "n1"]);
  // Opening another drops it.
  f.setRetain("n1");
  expect(f.view.entries().map((entry) => entry.id)).toEqual(["n3", "n1"]);
  // Opening one already seen asks nothing more.
  f.view.open("n2");
  expect(f.markedSeen).toEqual(["n2"]);
});

it("marks everything seen through the newest notification listed", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.entries()).toHaveLength(3));
  f.view.markAllSeen();
  await waitFor(() => expect(f.through).toHaveLength(1));
  expect(f.through[0]).toMatchObject({ through: { id: "n3" } });
  await waitFor(() => expect(f.view.entries().every((entry) => !entry.unread)).toBe(true));
  await waitFor(() => expect(f.view.unread()).toBe(0));
});

it("shows a notification unread again when marking it seen fails, and says so", async () => {
  const f = fixture({ fail: true });
  await waitFor(() => expect(f.view.entries()).toHaveLength(3));
  f.view.open("n2");
  expect(f.view.entries()[1]?.unread).toBe(false);
  await waitFor(() => expect(f.failed).toEqual(["seen"]));
  expect(f.view.entries()[1]?.unread).toBe(true);
  expect(f.view.seenError()).toBeDefined();
  f.view.markAllSeen();
  await waitFor(() => expect(f.failed).toEqual(["seen", "all-seen"]));
  expect(f.view.entries().every((entry) => entry.unread)).toBe(true);
});
