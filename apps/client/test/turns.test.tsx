import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { affectedKeys, signalKeys } from "../src/api/changes.ts";
import { drafted, settled, writing, type Drafts } from "../src/api/drafts.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useThreadTurns,
  type SessionStore,
  type ThreadTurnsView,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };

const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
const member = (id: string, name: string, identity: { _tag: string; id: string }) => ({
  id,
  workspaceId: "one",
  identity,
  name,
  status: "active",
});
const owner = member("owner", "Alice", { _tag: "Human", id: "alice" });
const members = [
  owner,
  member("member-scout", "Scout", { _tag: "Agent", id: "scout" }),
  member("member-atlas", "Atlas", { _tag: "Agent", id: "atlas" }),
];

interface Stored {
  id: string;
  memberId: string;
  status: string;
  failure?: string;
  cancelReason?: string;
  messageId?: string;
  createdAt: string;
  stoppable: boolean;
  retryable: boolean;
}
const viewOf = (turn: Stored) => ({
  id: turn.id,
  workspaceId: "one",
  groupId: "general",
  threadId: "thread",
  agentId: turn.memberId.replace("member-", ""),
  memberId: turn.memberId,
  participationId: `participation-${turn.memberId}`,
  status: turn.status,
  inputAfterSequence: 0,
  acceptedThroughSequence: 3,
  incorporatedThroughSequence: 0,
  selection: null,
  messageId: turn.messageId ?? null,
  failure: turn.failure ?? null,
  cancelReason: turn.cancelReason ?? null,
  createdAt: turn.createdAt,
  startedAt: null,
  finishedAt: null,
  stoppable: turn.stoppable,
  retryable: turn.retryable,
});

function fixture() {
  const server = {
    // Newest first, as the host lists them.
    turns: [
      {
        id: "scout-2",
        memberId: "member-scout",
        status: "running",
        createdAt: "2026-09-28T12:05:00.000Z",
        stoppable: true,
        retryable: false,
      },
      {
        id: "atlas-1",
        memberId: "member-atlas",
        status: "failed",
        failure: "Anthropic needs its API key.",
        createdAt: "2026-09-28T12:02:00.000Z",
        stoppable: false,
        retryable: true,
      },
      {
        id: "scout-1",
        memberId: "member-scout",
        status: "completed",
        messageId: "reply",
        createdAt: "2026-09-28T12:00:00.000Z",
        stoppable: false,
        retryable: false,
      },
    ] as Stored[],
    /** Answers to the next writes, in order; then success. */
    answers: [] as Response[],
  };
  const writes: Array<{ path: string; key: string | null }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 3 }], invitations: [] });
    if (path === "/workspaces/one/members") return json(members);
    if (path === "/workspaces/one/threads/thread/turns") return json(server.turns.map(viewOf));
    if (request.method !== "POST") return json({}, 404);
    writes.push({ path, key: request.headers.get("idempotency-key") });
    const answer = server.answers.shift();
    if (answer) return answer;
    const id = path.split("/")[4];
    const stored = server.turns.find((turn) => turn.id === id);
    if (!stored) return json({ _tag: "TurnApplication.NotFound", turnId: id }, 404);
    if (path.endsWith("/cancel")) {
      Object.assign(stored, { status: "cancelling", cancelReason: "requested", stoppable: false });
      return json(viewOf(stored));
    }
    stored.retryable = false;
    const retried: Stored = {
      id: `${stored.id}-retry`,
      memberId: stored.memberId,
      status: "queued",
      createdAt: "2026-09-28T12:06:00.000Z",
      stoppable: true,
      retryable: false,
    };
    server.turns.unshift(retried);
    return json(viewOf(retried), 201);
  });
  let view!: ThreadTurnsView;
  function Consumer() {
    view = useThreadTurns("one", "thread");
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
  return {
    get view() {
      return view;
    },
    server,
    writes,
  };
}

it("shows each agent's latest turn on a thread, by name, and which are at work", async () => {
  const f = fixture();
  expect(f.view.loading()).toBe(true);
  await waitFor(() => expect(f.view.latest()).toHaveLength(2));
  await waitFor(() => expect(f.view.latest()[0]?.agent.name).toBe("Scout"));
  expect(f.view.latest()).toMatchObject([
    { id: "scout-2", state: "working", stoppable: true, retryable: false, throughSequence: 3 },
    {
      id: "atlas-1",
      agent: { memberId: "member-atlas", name: "Atlas" },
      state: "failed",
      failure: "Anthropic needs its API key.",
      stoppable: false,
      retryable: true,
    },
  ]);
  expect(f.view.latest()[1]?.createdAt).toEqual(new Date("2026-09-28T12:02:00.000Z"));
  expect(f.view.active().map((turn) => turn.id)).toEqual(["scout-2"]);
  expect(f.view.failure()).toBeUndefined();
});

it("stops a turn, and retries one with a key it keeps until the retry goes through", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.latest()).toHaveLength(2));

  expect(f.view.stop("scout-2")).toBe(true);
  expect(f.view.acting()).toEqual({ kind: "stop", turnId: "scout-2" });
  await waitFor(() => expect(f.view.latest()[0]).toMatchObject({ state: "stopping" }));
  await waitFor(() => expect(f.view.acting()).toBeUndefined());
  expect(f.view.latest()[0]).toMatchObject({ stoppedBy: "request", stoppable: false });

  // A retry lost in transit asks again with the same key.
  f.server.answers.push(new Response("unavailable", { status: 502 }));
  expect(f.view.retry("atlas-1")).toBe(true);
  await waitFor(() =>
    expect(f.view.problem()).toEqual({ turnId: "atlas-1", problem: "retry-failed" }),
  );
  expect(f.view.retry("atlas-1")).toBe(true);
  await waitFor(() => expect(f.view.acting()).toBeUndefined());
  const retries = f.writes.filter((write) => write.path.endsWith("/retry"));
  expect(retries).toHaveLength(2);
  expect(retries[0]?.key).not.toBeNull();
  expect(retries[1]?.key).toBe(retries[0]?.key);
  expect(f.view.problem()).toBeUndefined();
  await waitFor(() =>
    expect(f.view.latest().find((turn) => turn.agent.name === "Atlas")).toMatchObject({
      id: "atlas-1-retry",
      state: "queued",
    }),
  );
});

it("names why a stop or retry was refused", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.latest()).toHaveLength(2));
  f.server.answers.push(
    json({ _tag: "TurnApplication.NotRetryable", turnId: "atlas-1", reason: "superseded" }, 409),
  );
  f.view.retry("atlas-1");
  await waitFor(() =>
    expect(f.view.problem()).toEqual({ turnId: "atlas-1", problem: "superseded" }),
  );
  f.server.answers.push(
    json({ _tag: "TurnApplication.NotActive", turnId: "scout-2", status: "completed" }, 409),
  );
  f.view.stop("scout-2");
  await waitFor(() => expect(f.view.problem()).toEqual({ turnId: "scout-2", problem: "finished" }));
  f.view.dismiss();
  expect(f.view.problem()).toBeUndefined();
});

it("refreshes a thread's turns as its turn facts arrive", () => {
  for (const name of [
    "turn.created",
    "turn.retried",
    "turn.started",
    "turn.completed",
    "turn.failed",
    "turn.cancelled",
  ])
    expect(
      affectedKeys("one", [{ name, payload: { threadId: "thread", turnId: "turn-1" } }]).toSorted(),
    ).toEqual([
      "workspace/one/active-turns",
      "workspace/one/turn-logs:turn-1",
      "workspace/one/turns:thread",
    ]);
  // An agent that stops taking part can no longer retry its turns there.
  expect(
    affectedKeys("one", [{ name: "thread.participation.ended", payload: { threadId: "thread" } }]),
  ).toContain("workspace/one/turns:thread");
});

it("a turn's log refreshes as it grows", () => {
  expect(signalKeys("one", { _tag: "TurnLogged", turnId: "turn-1" } as never)).toEqual([
    "workspace/one/turn-logs:turn-1",
  ]);
});

it("drafts continue their part in order, marking a gap rather than showing text out of place", () => {
  const draft = (offset: number, text: string, part = 0) => ({
    turnId: "turn-1",
    responseId: "r1",
    part,
    offset,
    text,
  });
  let drafts: Drafts = new Map();
  drafts = drafted(drafts, draft(0, "Deploy "));
  drafts = drafted(drafts, draft(7, "the API"));
  // A repeat of text already held adds nothing; one overlapping adds only what is new.
  drafts = drafted(drafts, draft(0, "Deploy "));
  drafts = drafted(drafts, draft(11, "API first"));
  expect(writing(drafts, "turn-1", new Set())).toEqual({
    text: "Deploy the API first",
    broken: false,
  });
  // Text past a gap is not shown; the completed response replaces the draft.
  drafts = drafted(drafts, draft(40, "later"));
  expect(writing(drafts, "turn-1", new Set())).toEqual({
    text: "Deploy the API first",
    broken: true,
  });
  // A response the log holds is no longer drafted; nor is anything of a turn that ended.
  expect(writing(drafts, "turn-1", new Set(["r1"]))).toBeUndefined();
  expect(writing(settled(drafts, "turn-1"), "turn-1", new Set())).toBeUndefined();
  // Parts of the response being written join in order.
  const two = drafted(drafted(new Map(), draft(0, "b", 1)), draft(0, "a", 0));
  expect(writing(two, "turn-1", new Set())?.text).toBe("ab");
});
