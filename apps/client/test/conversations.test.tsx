import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  Session,
  useGroupStream,
  useReply,
  useThreadTimeline,
  type ComposerController,
  type PagedView,
  type SessionStore,
  type Thread,
  type ThreadTimeline,
} from "../src/index.ts";
import { affectedKeys, signalKeys } from "../src/api/changes.ts";
import { mentionsIn } from "../src/conversations/compose.ts";

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
  expect(keys([{ name: "group.membership.removed", payload: { groupId: "group" } }])).toEqual([
    "workspace/one/groups",
    "workspace/one/rosters:group",
    "workspace/one/streams:group",
  ]);
  // A payload without the expected field refreshes the whole collection rather than none.
  expect(keys([{ name: "thread.activity.recorded", payload: {} }])).toEqual([
    "workspace/one/groups",
    "workspace/one/streams",
    "workspace/one/timelines",
  ]);
  expect(keys([{ name: "workspace.assignment.revoked" }])).toContain("workspace/one/streams");
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
    "workspace/one/groups",
    "workspace/one/members",
    "workspace/one/ownership",
    "workspace/one/rosters",
    "workspace/one/settings",
    "workspace/one/streams",
    "workspace/one/timelines:thread",
  ]);
  expect(signalKeys("one", { _tag: "ThreadRead" })).toEqual([
    "workspace/one/groups",
    "workspace/one/streams",
  ]);
  expect(signalKeys("one", { _tag: "GroupCaughtUp" })).toEqual(["workspace/one/groups"]);
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

it("a reply keeps its draft across remounts, retries with its key, and clears once posted", async () => {
  const posts: Array<{ key: string | null; body: unknown }> = [];
  let failNext = true;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    posts.push({ key: request.headers.get("idempotency-key"), body: await request.json() });
    if (failNext) {
      failNext = false;
      return new Response("Host unavailable", { status: 503 });
    }
    // The contract answers a publication with 201.
    return new Response(
      JSON.stringify({
        message: message("reply", "thread", minute(1)),
        activity: item(2).activity,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
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
    new URL(
      fetch.mock.calls.find(
        ([input, init]) => new Request(input, init).method === "POST",
      )![0] as string,
    ).pathname,
  ).toBe("/workspaces/one/threads/thread/messages");
});

it("a draft mentions the members whose @name its text still holds", () => {
  const mentioned = [
    { memberId: "ada", name: "ada@mercier.co" },
    { memberId: "jo", name: "Jo Mercer" },
    { memberId: "rae", name: "Rae" },
  ];
  expect(mentionsIn("@ada@mercier.co and @Jo Mercer, please", mentioned)).toEqual(["ada", "jo"]);
  // Removed from the text, or only part of a longer word, a name mentions no one.
  expect(mentionsIn("Ask @Raelynn", mentioned)).toEqual([]);
  expect(mentionsIn("email@Rae", mentioned)).toEqual([]);
  expect(mentionsIn("@Rae? @Rae.", mentioned)).toEqual(["rae"]);
});

it("a reply sends the mentions its text still holds", async () => {
  const bodies: Array<unknown> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== "POST") return json([]);
    bodies.push(await request.json());
    return new Response(
      JSON.stringify({
        message: message("reply", "thread", minute(1)),
        activity: item(2).activity,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
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
  composer.mention("ada", "Ada");
  composer.mention("jo", "Jo");
  composer.setDraft("@Ada and @Jo, look");
  expect(composer.mentions()).toEqual(["ada", "jo"]);
  composer.setDraft("@Ada, look");
  expect(composer.mentions()).toEqual(["ada"]);
  composer.send();
  await waitFor(() => expect(bodies).toEqual([{ text: "@Ada, look", mentions: ["ada"] }]));
  // A posted draft forgets its mentions.
  await waitFor(() => expect(composer.draft()).toBe(""));
  composer.setDraft("@Ada again");
  expect(composer.mentions()).toEqual([]);
});
