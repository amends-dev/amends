import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { affectedKeys } from "../src/live/api.ts";
import { drafted, writing, type Drafts } from "../src/turns/drafts.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useThreadConversation,
  useThreadTurnControls,
  useTurnLog,
  ChangeFeedProvider,
  type SessionStore,
  type ThreadEntry,
  type TurnControls,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({
  token: "alice",
  account: { id: "alice", email: "alice@example.com" },
});
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };
const at = (minute: number) => new Date(Date.UTC(2026, 8, 28, 12, minute)).toISOString();

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
  member("member-echo", "Echo", { _tag: "Agent", id: "echo" }),
];
/** The agents as the reader sees them: Alice may direct Scout and Atlas, not Echo. */
const agents = ["scout", "atlas", "echo"].map((id) => ({
  id,
  memberId: `member-${id}`,
  name: id,
  instructions: "",
  harness: { _tag: "Auto" },
  model: { connectionId: "team", id: "model" },
  sandbox: null,
  readiness: { _tag: "Ready" },
  configurable: false,
  usable: id !== "echo",
  createdBy: "owner",
  createdAt: at(0),
}));

const activity = (sequence: number, kind: string, subject: string, details: unknown) => ({
  id: `activity-${sequence}`,
  workspaceId: "one",
  threadId: "thread",
  sequence,
  occurredAt: at(sequence),
  kind,
  version: 1,
  subject,
  occurrence: subject,
  newActivity: kind === "message.published",
  details,
});
const message = (id: string, by: string, text: string, turnId: string | null = null) => ({
  id,
  workspaceId: "one",
  threadId: "thread",
  author: { _tag: "Member", memberId: by },
  via: turnId === null ? null : { _tag: "Turn", turnId },
  publishedAt: at(1),
  content: { _tag: "Text", text, mentions: [], revision: 1, editedAt: null },
});
type Item = { readonly activity: { readonly sequence: number } };
/** The thread's activity so far, oldest first; each write adds what the host would. */
function thread() {
  const items: Array<Item> = [];
  const next = () => items.length + 1;
  const say = (id: string, by: string, text: string, turnId?: string) =>
    items.push({
      activity: activity(next(), "message.published", `message:${id}`, { messageId: id }),
      message: message(id, by, text, turnId),
    } as Item);
  const turn = (kind: string, details: { readonly turnId: string } & Record<string, unknown>) =>
    items.push({
      activity: activity(next(), `turn.${kind}`, `turn:${details.turnId}`, details),
    } as Item);
  const created = (turnId: string, memberId: string, retryOf: string | null = null) =>
    turn("created", { turnId, memberId, retryOf });
  const ended = (
    turnId: string,
    outcome: string,
    more: { messageIds?: string[]; reason?: string; cancelReason?: string } = {},
  ) =>
    turn("ended", {
      turnId,
      outcome,
      messageIds: more.messageIds ?? [],
      reason: more.reason ?? null,
      cancelReason: more.cancelReason ?? null,
    });
  const left = (memberId: string) =>
    items.push({
      activity: activity(next(), "participation.ended", `thread-participation:${memberId}`, {
        participationId: `p-${memberId}`,
        reason: "group-removed",
      }),
      participant: {
        id: `p-${memberId}`,
        workspaceId: "one",
        threadId: "thread",
        participant: { _tag: "Member", memberId },
        joinedAt: at(1),
        joinedAtSequence: 1,
      },
    } as Item);
  return { items, say, turn, created, ended, left };
}

/**
 * A thread where Scout replied and is working on a follow-up, Atlas failed, and Echo, whom the
 * reader may not direct, waits.
 */
function fixture(options: { readonly atlasLeft?: boolean } = {}) {
  const server = thread();
  server.say("m1", "owner", "Scout and Atlas, check the terms.");
  server.created("scout-1", "member-scout");
  server.created("atlas-1", "member-atlas");
  server.turn("started", { turnId: "scout-1" });
  server.turn("started", { turnId: "atlas-1" });
  server.say("reply", "member-scout", "The terms look fine.", "scout-1");
  server.ended("scout-1", "completed", { messageIds: ["reply"] });
  server.ended("atlas-1", "failed", { reason: "Anthropic needs its API key." });
  if (options.atlasLeft) server.left("member-atlas");
  server.say("m2", "owner", "Scout, and the renewal date?");
  server.created("scout-2", "member-scout");
  server.turn("started", { turnId: "scout-2" });
  server.created("echo-1", "member-echo");
  /** Answers to the next writes, in order; then success. */
  const answers: Array<Response> = [];
  const writes: Array<{ path: string; key: string | null }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 4 }], invitations: [] });
    if (path === "/workspaces/one/members") return json(members);
    if (path === "/workspaces/one/agents") return json(agents);
    if (path === "/workspaces/one/threads/thread/timeline") {
      const after = Number(url.searchParams.get("afterSequence") ?? 0);
      return json(server.items.filter((item) => item.activity.sequence > after));
    }
    if (request.method !== "POST" || !path.startsWith("/workspaces/one/turns/"))
      return json({}, 404);
    writes.push({ path, key: request.headers.get("idempotency-key") });
    const answer = answers.shift();
    if (answer) return answer;
    const id = path.split("/")[4]!;
    const view = (turnId: string, status: string) => ({
      id: turnId,
      workspaceId: "one",
      groupId: "general",
      threadId: "thread",
      agentId: "atlas",
      memberId: "member-atlas",
      participationId: "p-member-atlas",
      retry: null,
      status,
      acceptedThroughSequence: 1,
      selection: null,
      messageIds: [],
      failure: null,
      cancelReason: null,
      createdAt: at(30),
      startedAt: null,
      finishedAt: null,
      stoppable: false,
      retryable: false,
    });
    if (path.endsWith("/cancel")) {
      server.turn("stopping", { turnId: id, cancelReason: "requested" });
      return json(view(id, "cancelling"));
    }
    server.created(`${id}-retry`, "member-atlas", id);
    return json(view(`${id}-retry`, "queued"), 201);
  });
  const views = {} as {
    thread: ReturnType<typeof useThreadConversation>;
    controls: TurnControls;
  };
  function Consumer() {
    views.thread = useThreadConversation("one", "thread");
    views.controls = useThreadTurnControls("one", "thread");
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
  const turns = () =>
    views.thread
      .entries()
      .filter((entry): entry is Extract<ThreadEntry, { kind: "turn" }> => entry.kind === "turn");
  const turn = (id: string) => turns().find((entry) => entry.id === id);
  return { views, turns, turn, answers, writes };
}

it("shows each agent's turn where it took on the work, until it replies", async () => {
  const f = fixture();
  await waitFor(() => expect(f.turn("atlas-1")?.agentId).toBe("atlas"));
  await waitFor(() => expect(f.turn("atlas-1")?.agent.name).toBe("Atlas"));
  // Scout's first turn replied, so its reply stands for it.
  expect(
    f.views.thread
      .entries()
      .map((entry) => (entry.kind === "turn" ? `turn ${entry.id}` : entry.id)),
  ).toEqual(["m1", "turn atlas-1", "reply", "m2", "turn scout-2", "turn echo-1"]);
  expect(f.turns()).toMatchObject([
    {
      id: "atlas-1",
      at: new Date(at(3)),
      agentId: "atlas",
      agent: { name: "Atlas" },
      state: "failed",
      failure: "Anthropic needs its API key.",
      stoppable: false,
      retryable: true,
    },
    { id: "scout-2", state: "working", stoppable: true, retryable: false },
    // The reader may not direct Echo.
    { id: "echo-1", state: "queued", stoppable: false, retryable: false },
  ]);
});

it("offers no retry for an agent that stopped taking part after its turn", async () => {
  const f = fixture({ atlasLeft: true });
  await waitFor(() => expect(f.turn("atlas-1")?.agentId).toBe("atlas"));
  expect(f.turn("atlas-1")).toMatchObject({ state: "failed", retryable: false });
});

it("stops a turn, and retries one again when the first answer is lost", async () => {
  const f = fixture();
  await waitFor(() => expect(f.turn("atlas-1")?.retryable).toBe(true));

  f.views.controls.stop("scout-2");
  expect(f.views.controls.acting()).toEqual({ kind: "stop", turnId: "scout-2" });
  await waitFor(() => expect(f.views.controls.acting()).toBeUndefined());
  // The command answers once the timeline shows the turn stopping.
  expect(f.turn("scout-2")).toMatchObject({
    state: "stopping",
    stoppedBy: "request",
    stoppable: false,
  });

  // A retry lost in transit asks again; a turn is retried once, so asking twice creates one turn.
  f.answers.push(new Response("unavailable", { status: 502 }));
  f.views.controls.retry("atlas-1");
  await waitFor(() =>
    expect(f.views.controls.problem()).toEqual({ turnId: "atlas-1", problem: "retry-failed" }),
  );
  f.views.controls.retry("atlas-1");
  await waitFor(() => expect(f.views.controls.acting()).toBeUndefined());
  const retries = f.writes.filter((write) => write.path.endsWith("/retry"));
  expect(retries).toHaveLength(2);
  expect(retries.map((write) => write.key)).toEqual([null, null]);
  expect(f.views.controls.problem()).toBeUndefined();
  // The failed attempt stays where it was, no longer retryable; the new one follows.
  expect(f.turn("atlas-1")).toMatchObject({ state: "failed", retryable: false });
  expect(f.turns().at(-1)).toMatchObject({ id: "atlas-1-retry", state: "queued", stoppable: true });
});

it("names why a stop or retry was refused", async () => {
  const f = fixture();
  await waitFor(() => expect(f.turn("atlas-1")?.retryable).toBe(true));
  f.answers.push(
    json({ _tag: "TurnService.NotRetryable", turnId: "atlas-1", reason: "superseded" }, 409),
  );
  f.views.controls.retry("atlas-1");
  await waitFor(() =>
    expect(f.views.controls.problem()).toEqual({ turnId: "atlas-1", problem: "superseded" }),
  );
  f.answers.push(
    json({ _tag: "TurnService.NotActive", turnId: "scout-2", status: "completed" }, 409),
  );
  f.views.controls.stop("scout-2");
  await waitFor(() =>
    expect(f.views.controls.problem()).toEqual({ turnId: "scout-2", problem: "finished" }),
  );
  f.views.controls.dismiss();
  expect(f.views.controls.problem()).toBeUndefined();
});

/** One server-sent event stream the test writes to and ends. */
function eventStream(request: Request) {
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
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    send: (message: unknown) => write("message", message),
    unavailable: () => {
      write("effect/http-api/stream/failure", [
        { _tag: "Fail", error: { _tag: "Turn.LogUnavailable" } },
      ]);
      controller.close();
    },
    close: () => controller.close(),
  };
}

const connection = (id: string, name: string, integration: string) => ({
  id,
  name,
  integration,
  settings: {},
  auth: "none",
  readiness: { _tag: "Ready" },
  manageable: false,
  createdBy: "owner",
  createdAt: at(0),
});
const connections = [
  connection("opencode", "opencode", "opencode"),
  connection("openrouter", "OpenRouter", "openrouter"),
];

/**
 * A turn's log followed over its stream, with the turn read beside it: one that failed as `failure`
 * says, and started on `selection`, with the workspace's connections read for their names.
 * `refuse` answers a subscription in place of opening its stream, by how many came before it.
 */
function followed(
  status: string,
  options: {
    readonly failure?: string;
    readonly selection?: unknown;
    readonly refuse?: (subscription: number) => Response | undefined;
  } = {},
) {
  const { failure = null, selection = null, refuse = () => undefined } = options;
  const turn = {
    id: "atlas-1",
    workspaceId: "one",
    groupId: "general",
    threadId: "thread",
    agentId: "atlas",
    memberId: "member-atlas",
    participationId: "p-member-atlas",
    retry: null,
    status,
    acceptedThroughSequence: 1,
    selection,
    messageIds: [],
    failure,
    cancelReason: null,
    createdAt: at(1),
    startedAt: at(2),
    finishedAt: status === "failed" ? at(6) : null,
    stoppable: false,
    retryable: status === "failed",
  };
  const streams: Array<ReturnType<typeof eventStream>> = [];
  let subscriptions = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 4 }], invitations: [] });
    if (path === "/workspaces/one/members") return json(members);
    if (path === "/workspaces/one/turns/atlas-1") return json(turn);
    if (path === "/workspaces/one/connections") return json(connections);
    // The workspace's change feed is live, so that nothing here depends on how long a test takes: a
    // feed that never connected would count as down once `liveGrace` passed.
    if (path === "/workspaces/one/changes") {
      const feed = eventStream(request);
      feed.send({ _tag: "Ready", workspaceId: "one", cursor: null, reset: false });
      return feed.response;
    }
    if (path === "/workspaces/one/turns/atlas-1/log/events") {
      const refused = refuse(subscriptions++);
      if (refused !== undefined) return refused;
      const created = eventStream(request);
      streams.push(created);
      return created.response;
    }
    return json({}, 404);
  });
  let view!: ReturnType<typeof useTurnLog>;
  function Consumer() {
    view = useTurnLog("one", "atlas-1");
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
    streams,
    connected: async (index: number) => {
      await waitFor(() => expect(streams.length).toBeGreaterThan(index), { timeout: 3000 });
      return streams[index]!;
    },
  };
}
const kinds = (view: ReturnType<typeof useTurnLog>) => view.activity().map((entry) => entry.kind);

it("follows a turn's log: its items as they change, the reply being written, until the turn ends", async () => {
  const f = followed("running");
  const stream = await f.connected(0);
  stream.send({ _tag: "Opened", items: [{ _tag: "InputTaken", at: at(3), messages: 1 }] });
  await waitFor(() => expect(kinds(f.view)).toEqual(["accepted", "started", "input"]));
  expect(f.view.updatedAt()).toBeInstanceOf(Date);

  // The response streams in as drafts until its block arrives in the log.
  stream.send({ _tag: "Drafted", responseId: "r1", part: 0, offset: 0, text: "Deploy the " });
  stream.send({ _tag: "Drafted", responseId: "r1", part: 0, offset: 11, text: "API first." });
  await waitFor(() =>
    expect(f.view.draft()).toEqual({ text: "Deploy the API first.", broken: false }),
  );
  stream.send({
    _tag: "Changed",
    changes: [
      {
        index: 1,
        item: {
          _tag: "Responded",
          at: at(4),
          responseId: "r1",
          text: "Deploy the API first.",
          parts: [0],
          reply: true,
        },
      },
    ],
  });
  await waitFor(() => expect(kinds(f.view)).toEqual(["accepted", "started", "input", "response"]));
  expect(f.view.draft()).toBeUndefined();

  // The turn ended: nothing more follows, and following stops rather than reconnecting.
  stream.send({ _tag: "Ended" });
  stream.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(f.streams).toHaveLength(1);
  expect(f.view.reconnecting()).toBe(false);
});

it("names the harness, model, and sandbox a turn started on by their connections", async () => {
  const f = followed("running", {
    selection: {
      harness: { connectionId: "opencode" },
      model: { connectionId: "openrouter", id: "claude-opus-5-5" },
      sandbox: { connectionId: "removed" },
    },
  });
  await waitFor(() =>
    expect(f.view.turn()?.setup).toEqual({
      harness: "opencode",
      model: "OpenRouter · claude-opus-5-5",
      sandbox: "Removed connection",
    }),
  );
});

it("follows a turn's log again after it drops, opening with the items as they stand", async () => {
  const f = followed("running");
  const first = await f.connected(0);
  first.send({ _tag: "Opened", items: [{ _tag: "InputTaken", at: at(3), messages: 1 }] });
  await waitFor(() => expect(kinds(f.view)).toEqual(["accepted", "started", "input"]));
  first.unavailable();
  const second = await f.connected(1);
  second.send({
    _tag: "Opened",
    items: [
      { _tag: "InputTaken", at: at(3), messages: 1 },
      { _tag: "InputTaken", at: at(4), messages: 2 },
    ],
  });
  await waitFor(() => expect(kinds(f.view)).toEqual(["accepted", "started", "input", "input"]));
});

const refusals = {
  gone: () => json({ _tag: "CoreError.NotFound", resource: "Turn", id: "atlas-1" }, 404),
  denied: () =>
    json(
      {
        _tag: "Authorization.Denied",
        memberId: "owner",
        requirement: {
          permission: { name: "thread.read", targetKind: "Thread" },
          target: { _tag: "Thread", workspaceId: "one", threadId: "thread" },
        },
      },
      403,
    ),
};
for (const [failure, refusal] of Object.entries(refusals))
  it(`shows nothing of a turn it may no longer follow, once refused as ${failure}`, async () => {
    const f = followed("running", {
      refuse: (subscription) => (subscription > 0 ? refusal() : undefined),
    });
    const stream = await f.connected(0);
    stream.send({ _tag: "Opened", items: [{ _tag: "InputTaken", at: at(3), messages: 1 }] });
    stream.send({ _tag: "Drafted", responseId: "r1", part: 0, offset: 0, text: "Deploy the " });
    await waitFor(() => expect(f.view.draft()).toEqual({ text: "Deploy the ", broken: false }));
    // Following ends, and subscribing again is refused: what it showed goes, with the turn.
    stream.unavailable();
    await waitFor(() => expect(f.view.failure()).toBe(failure), { timeout: 3000 });
    expect(f.view.turn()).toBeUndefined();
    expect(f.view.activity()).toEqual([]);
    expect(f.view.draft()).toBeUndefined();
    expect(f.view.loading()).toBe(false);
  });

it("tells a failed turn's end once, rather than as an interruption and again as its failure", async () => {
  const f = followed("failed", { failure: "Anthropic is limiting requests." });
  const stream = await f.connected(0);
  stream.send({
    _tag: "Opened",
    items: [
      { _tag: "InputTaken", at: at(3), messages: 1 },
      {
        _tag: "Interrupted",
        at: at(4),
        reason: "Anthropic is limiting requests.",
        retryable: true,
      },
      {
        _tag: "Interrupted",
        at: at(5),
        reason: "Anthropic is limiting requests.",
        retryable: true,
      },
    ],
  });
  stream.send({ _tag: "Ended" });
  stream.close();
  await waitFor(() => expect(f.view.activity().at(-1)?.kind).toBe("failed"));
  expect(kinds(f.view)).toEqual(["accepted", "started", "input", "interrupted", "failed"]);
  expect(f.view.activity()[3]).toMatchObject({
    reason: "Anthropic is limiting requests.",
    retrying: false,
  });
});

it("refreshes a turn's log and the active turns as its facts arrive", () => {
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
    ).toEqual(["workspace/one/active-turns", "workspace/one/turns:turn-1"]);
  // A thread's timeline follows the turn activity recorded there.
  expect(
    affectedKeys("one", [
      {
        name: "thread.activity.recorded",
        payload: { groupId: "general", activity: { threadId: "thread", kind: "turn.ended" } },
      },
    ]),
  ).toContain("workspace/one/timelines:thread");
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
  // A block the log holds is no longer drafted.
  expect(writing(drafts, "turn-1", new Set(["r1\u00000"]))).toBeUndefined();
  // Parts of the response being written join in order, leaving out blocks the log holds.
  const two = drafted(drafted(new Map(), draft(0, "b", 1)), draft(0, "a", 0));
  expect(writing(two, "turn-1", new Set())?.text).toBe("ab");
  expect(writing(two, "turn-1", new Set(["r1\u00000"]))?.text).toBe("b");
});
