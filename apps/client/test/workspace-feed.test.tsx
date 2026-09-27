import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useGroups,
  useMarkThreadRead,
  useSettings,
  useTyping,
  useWorkspaceFeed,
  WorkspaceFeedProvider,
  type SessionStore,
  type SettingsController,
  type WorkspaceFeedScope,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const at = "2026-09-25T12:00:00.000Z";
const workspace = (name: string) => ({
  id: "one",
  name,
  createdBy: "alice",
  ownerMemberId: "owner",
});
const owner = {
  id: "owner",
  workspaceId: "one",
  identity: { _tag: "Human", id: "alice" },
  status: "active",
};
const event = (name: string, payload: unknown) => ({
  id: `entry-${name}`,
  name,
  version: 1,
  recordedAt: at,
  provenance: {
    workspaceId: "one",
    performedBy: { _tag: "System", id: "test" },
    causedBy: null,
    correlationId: "correlation",
    occurredAt: at,
  },
  payload,
});
const ready = (cursor: string | null, reset: boolean) => ({
  _tag: "Ready",
  workspaceId: "one",
  cursor,
  reset,
});
const committed = (cursor: string, ...events: Array<ReturnType<typeof event>>) => ({
  _tag: "Committed",
  workspaceId: "one",
  cursor,
  commitId: `commit-${cursor}`,
  events,
  notifications: [],
});

/** One server-sent event stream the test writes to and ends. */
function stream(request: Request) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (value) => {
      controller = value;
    },
  });
  request.signal.addEventListener("abort", () => {
    try {
      controller.error(request.signal.reason);
    } catch {
      /* Already ended. */
    }
  });
  const write = (event: string, data: unknown) =>
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  return {
    request,
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    send: (message: unknown) => write("message", message),
    unavailable: () => {
      write("effect/httpapi/stream/failure", [
        { _tag: "Fail", error: { _tag: "ChangeFeed.Unavailable" } },
      ]);
      controller.close();
    },
    close: () => controller.close(),
  };
}

function fixture(
  options: {
    changes?: (request: Request) => Response | undefined;
    /** Answers the test's own requests before the fixture's. */
    respond?: (request: Request, path: string) => Promise<Response> | undefined;
    /** Mounts more of the client beside the feed. */
    mount?: () => void;
  } = {},
) {
  let name = "Studio";
  const streams: Array<ReturnType<typeof stream>> = [];
  const reads: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    if (path.endsWith("/changes")) {
      const replaced = options.changes?.(request);
      if (replaced) return Promise.resolve(replaced);
      const created = stream(request);
      streams.push(created);
      return Promise.resolve(created.response);
    }
    reads.push(path);
    const answered = options.respond?.(request, path);
    if (answered) return answered;
    if (path === "/me/workspaces")
      return Promise.resolve(
        json({
          memberships: [{ workspace: workspace(name), member: owner, people: 1 }],
          invitations: [],
        }),
      );
    if (path.endsWith("/settings"))
      return Promise.resolve(
        json({
          workspace: workspace(name),
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: [],
        }),
      );
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        json({
          workspace: workspace(name),
          owner,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: [],
        }),
      );
    return Promise.resolve(json({}, 404));
  });
  let session: Session | undefined = Schema.decodeSync(Session)({
    token: "alice",
    identity: "alice",
  });
  const listeners = new Set<() => void>();
  const store: SessionStore = {
    read: () => session,
    write: (value) => {
      session = value;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const [shown, setShown] = createSignal(true);
  let feed!: WorkspaceFeedScope,
    settings!: SettingsController,
    typing!: ReturnType<typeof useTyping>;
  function Consumer() {
    feed = useWorkspaceFeed();
    settings = useSettings("one", "workspace");
    typing = useTyping("one");
    options.mount?.();
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
        <Show when={shown()}>
          <WorkspaceFeedProvider workspaceId="one">
            <Consumer />
          </WorkspaceFeedProvider>
        </Show>
      </DirectoryProvider>
    </ClientProvider>
  ));
  const count = (suffix: string) => reads.filter((path) => path.endsWith(suffix)).length;
  return {
    streams,
    reads,
    count,
    store,
    rename: (next: string) => {
      name = next;
    },
    hide: () => setShown(false),
    replace: () => {
      session = Schema.decodeSync(Session)({ token: "bob", identity: "bob" });
      listeners.forEach((listener) => listener());
    },
    get feed() {
      return feed;
    },
    get settings() {
      return settings;
    },
    get typing() {
      return typing;
    },
    connected: async (index: number) => {
      await waitFor(() => expect(streams.length).toBeGreaterThan(index));
      return streams[index]!;
    },
  };
}

it("refreshes the reads each commit affects, and every read after a reset", async () => {
  const f = fixture();
  const first = await f.connected(0);
  expect(new URL(first.request.url).searchParams.has("after")).toBe(false);
  expect(first.request.headers.get("authorization")).toBe("Bearer alice");
  await waitFor(() => expect(f.settings.data()?.settings.workspace.name).toBe("Studio"));
  expect(f.feed.state()._tag).toBe("Connecting");
  const before = { settings: f.count("/settings"), directory: f.count("/me/workspaces") };
  // A subscription without a cursor resets: reads loaded before it may have missed commits.
  first.send(ready("2", true));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  await waitFor(() => expect(f.count("/settings")).toBe(before.settings + 1));
  expect(f.count("/me/workspaces")).toBe(before.directory + 1);
  // Invitations are not read here, so their commits refresh nothing.
  const quiet = f.reads.length;
  first.send(committed("3", event("workspace.invitation.issued", {})));
  first.send(committed("4", event("thread.message.published", {})));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.reads).toHaveLength(quiet);
  f.rename("Atelier");
  first.send(
    committed(
      "5",
      event("workspace.renamed", { workspaceId: "one", previousName: "Studio", name: "Atelier" }),
    ),
  );
  await waitFor(() => expect(f.settings.data()?.settings.workspace.name).toBe("Atelier"));
  expect(f.count("/ownership")).toBe(before.settings + 2);
  await waitFor(() => expect(f.count("/me/workspaces")).toBe(before.directory + 2));
  // Live refreshes never report the settings as pending or lock their commands.
  expect(f.settings.pending()).toBe(false);
  expect(f.settings.needsRefresh()).toBe(false);
});

it("resumes after the last commit when the stream drops, without refreshing on resume", async () => {
  const f = fixture();
  const first = await f.connected(0);
  first.send(ready("2", true));
  first.send(committed("3", event("workspace.invitation.issued", {})));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  first.unavailable();
  await waitFor(() => expect(f.feed.state()).toMatchObject({ _tag: "Reconnecting", attempt: 1 }));
  await waitFor(() => expect(f.count("/ownership")).toBe(2));
  const directory = f.count("/me/workspaces");
  // Coming back online skips the remaining delay, and refreshes the cross-workspace directory.
  window.dispatchEvent(new Event("online"));
  const second = await f.connected(1);
  expect(new URL(second.request.url).searchParams.get("after")).toBe("3");
  await waitFor(() => expect(f.count("/me/workspaces")).toBe(directory + 1));
  second.send(ready("3", false));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect([f.count("/settings"), f.count("/ownership")]).toEqual([2, 2]);
  // A stream that ends without a failure also reconnects from the same place.
  second.close();
  await waitFor(() => expect(f.feed.state()._tag).toBe("Reconnecting"));
  window.dispatchEvent(new Event("online"));
  expect(new URL((await f.connected(2)).request.url).searchParams.get("after")).toBe("3");
});

it("restarts a live stream when the browser comes back online", async () => {
  const f = fixture();
  const first = await f.connected(0);
  first.send(ready("7", true));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  window.dispatchEvent(new Event("online"));
  const second = await f.connected(1);
  await waitFor(() => expect(first.request.signal.aborted).toBe(true));
  expect(new URL(second.request.url).searchParams.get("after")).toBe("7");
});

it("ends and refreshes the directory when the member loses the workspace", async () => {
  let denied = false;
  const f = fixture({
    changes: () =>
      denied ? json({ _tag: "Gateway.NotMember", workspaceId: "one" }, 403) : undefined,
  });
  const first = await f.connected(0);
  first.send(ready("2", true));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  const directory = f.count("/me/workspaces");
  denied = true;
  first.send(
    committed("3", event("workspace.member.removed", { workspaceId: "one", memberId: "owner" })),
  );
  first.unavailable();
  await waitFor(() => expect(f.feed.state()).toMatchObject({ _tag: "Reconnecting" }));
  window.dispatchEvent(new Event("online"));
  await waitFor(() =>
    expect(f.feed.state()).toMatchObject({ _tag: "Ended", reason: "unavailable" }),
  );
  expect(f.count("/me/workspaces")).toBeGreaterThan(directory);
  window.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.streams).toHaveLength(1);
  expect(f.store.read()?.token).toBe("alice");
});

it("clears rejected credentials instead of reconnecting", async () => {
  const f = fixture({
    changes: () => json({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401),
  });
  await waitFor(() => expect(f.store.read()).toBeUndefined());
});

it.each(["hide", "replace"] as const)("closes the stream after %s", async (action) => {
  const f = fixture();
  const first = await f.connected(0);
  first.send(ready("2", true));
  await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
  f[action]();
  await waitFor(() => expect(first.request.signal.aborted).toBe(true));
  window.dispatchEvent(new Event("online"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const reconnected = f.streams.slice(1);
  if (action === "hide") expect(reconnected).toHaveLength(0);
  else
    expect(
      reconnected.every((next) => next.request.headers.get("authorization") === "Bearer bob"),
    ).toBe(true);
});

it("keeps backing off when a connection fails as soon as it opens", async () => {
  const f = fixture();
  for (const attempt of [1, 2, 3]) {
    const stream = await f.connected(attempt - 1);
    stream.send(ready("2", attempt === 1));
    await waitFor(() => expect(f.feed.state()._tag).toBe("Live"));
    stream.unavailable();
    await waitFor(() => expect(f.feed.state()).toMatchObject({ _tag: "Reconnecting", attempt }));
    window.dispatchEvent(new Event("online"));
  }
});

it("shows who is typing until their signal runs out or their message arrives, never the reader", async () => {
  const f = fixture();
  const stream = await f.connected(0);
  stream.send(ready("1", false));
  const typing = (memberId: string, ms: number) => ({
    _tag: "Signal",
    workspaceId: "one",
    signal: {
      _tag: "Typing",
      workspaceId: "one",
      groupId: "group",
      threadId: "thread",
      memberId,
      until: new Date(Date.now() + ms).toISOString(),
    },
  });
  stream.send(typing("ada", 60_000));
  // The reader's own typing, from another of their sessions, is not shown to them.
  stream.send(typing("owner", 60_000));
  await waitFor(() => expect(f.typing("thread")).toEqual(["ada"]));
  expect(f.typing("other")).toEqual([]);
  // Ada's message arriving ends her typing it.
  stream.send(
    committed(
      "2",
      event("thread.message.published", {
        threadId: "thread",
        author: { _tag: "Member", memberId: "ada" },
      }),
    ),
  );
  await waitFor(() => expect(f.typing("thread")).toEqual([]));
  // A signal lasts only until the moment it names.
  stream.send(typing("rae", 300));
  await waitFor(() => expect(f.typing("thread")).toEqual(["rae"]));
  await waitFor(() => expect(f.typing("thread")).toEqual([]), { timeout: 2000 });
});

it("a read mark refreshes the reads it changes once, not again when its own signal comes back", async () => {
  const marked = Promise.withResolvers<Response>();
  const [through, setThrough] = createSignal<number>();
  const f = fixture({
    respond: (request, path) => {
      if (path === "/workspaces/one/groups") return Promise.resolve(json([]));
      if (request.method === "POST" && path === "/workspaces/one/threads/thread/read")
        return marked.promise;
      return undefined;
    },
    mount: () => {
      useGroups("one");
      useMarkThreadRead("one", "thread", through);
    },
  });
  const stream = await f.connected(0);
  stream.send(ready("1", false));
  await waitFor(() => expect(f.count("/groups")).toBe(1));
  const read = (readThrough: number) => ({
    _tag: "Signal",
    workspaceId: "one",
    signal: {
      _tag: "ThreadRead",
      workspaceId: "one",
      memberId: "owner",
      threadId: "thread",
      readThrough,
    },
  });
  setThrough(3);
  await waitFor(() => expect(f.count("/threads/thread/read")).toBe(1));
  // The server's signal can arrive before its answer to the mark does.
  stream.send(read(3));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.count("/groups")).toBe(1);
  marked.resolve(new Response(null, { status: 204 }));
  await waitFor(() => expect(f.count("/groups")).toBe(2));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(f.count("/groups")).toBe(2);
  // Reading further on another device is news to this one.
  stream.send(read(5));
  await waitFor(() => expect(f.count("/groups")).toBe(3));
});
