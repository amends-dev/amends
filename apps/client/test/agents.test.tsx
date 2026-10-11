import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { affectedKeys } from "../src/live/api.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useAgentList,
  useAgents,
  type AgentsDone,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({
  token: "alice",
  account: { id: "alice", email: "alice@example.com" },
});
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };

const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
const owner = {
  id: "owner",
  workspaceId: "one",
  identity: { _tag: "Human", id: "alice" },
  name: "Alice",
  status: "active",
};
const role = (id: string, name: string) => ({
  id,
  workspaceId: "one",
  name,
  permissions: ["member.read"],
});
const settings = {
  workspace,
  canRename: true,
  canReadInvitations: true,
  canInvite: true,
  roles: [
    { role: role("builtin:member", "Member"), assignable: true },
    { role: role("builtin:administrator", "Administrator"), assignable: false },
    { role: role("builtin:owner", "Owner"), assignable: false },
  ],
};
const integration = (
  id: string,
  name: string,
  provides: string,
  requiresSandbox = false,
): Record<string, unknown> => ({
  id,
  name,
  auth: ["none"],
  provides: [provides],
  requiresSandbox,
  settings: { type: "object", properties: {} },
});
const integrations = [
  integration("amends", "amends", "harnesses"),
  integration("opencode-agent", "opencode", "harnesses", true),
  integration("openrouter", "OpenRouter", "models"),
  integration("local", "This machine", "sandboxes"),
];
const connection = (id: string, name: string, integrationId: string, ready = true) => ({
  id,
  name,
  integration: integrationId,
  settings: {},
  auth: "none",
  readiness: ready ? { _tag: "Ready" } : { _tag: "Uninstalled" },
  manageable: true,
  createdBy: "owner",
  createdAt: "2026-10-06T12:00:00.000Z",
});
const connections = [
  connection("amends", "Amends harness", "amends"),
  connection("opencode", "opencode", "opencode-agent"),
  connection("openrouter", "OpenRouter", "openrouter"),
  connection("machine", "This machine", "local"),
  connection("vertex", "Vertex", "vertex", false),
];
const opus = {
  id: "claude-opus-5-5",
  name: "Claude Opus 5.5",
  protocol: "openai-chat",
  url: "https://openrouter.ai/api/v1",
  released: "2026-09",
  limits: { context: 1_000_000, output: 64_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] },
};

const group = (id: string, name: string) => ({
  group: {
    id,
    workspaceId: "one",
    kind: "Team",
    visibility: "Public",
    name,
    createdBy: "owner",
    createdAt: "2026-10-06T12:00:00.000Z",
  },
  latestActivityAt: null,
  readAt: null,
  newActivity: false,
  following: false,
  pending: 0,
  manageable: true,
  membersRemovable: true,
  renamable: true,
});
const groups = [group("design", "design"), group("general", "general")];
/** Reviewer's turns in progress: one working in #general, and one queued in #design. */
const activeTurn = (id: string, groupId: string, status: string) => ({
  id,
  workspaceId: "one",
  groupId,
  threadId: `thread-${groupId}`,
  agentId: "reviewer",
  memberId: "member-reviewer",
  participationId: `p-${groupId}`,
  retry: null,
  status,
  acceptedThroughSequence: 1,
  selection: null,
  messageIds: [],
  failure: null,
  cancelReason: null,
  createdAt: "2026-10-06T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  stoppable: true,
  retryable: false,
});
const activeTurns = [
  activeTurn("queued-turn", "design", "queued"),
  activeTurn("working-turn", "general", "running"),
];

interface Stored {
  id: string;
  memberId: string;
  name: string;
  instructions: string;
  harness: { _tag: "Auto" } | { _tag: "Connection"; connectionId: string };
  model: { connectionId: string; id: string; effort?: string };
  sandbox: { connectionId: string } | null;
  issues: ReadonlyArray<Record<string, unknown>>;
}
const viewOf = (agent: Stored) => ({
  id: agent.id,
  memberId: agent.memberId,
  name: agent.name,
  instructions: agent.instructions,
  harness: agent.harness,
  model: agent.model,
  sandbox: agent.sandbox,
  readiness:
    agent.issues.length === 0 ? { _tag: "Ready" } : { _tag: "Incomplete", issues: agent.issues },
  configurable: true,
  usable: true,
  createdBy: "owner",
  createdAt: "2026-10-06T12:00:00.000Z",
});

function fixture() {
  const server = {
    agents: [
      {
        id: "reviewer",
        memberId: "member-reviewer",
        name: "Reviewer",
        instructions: "Review each change.",
        harness: { _tag: "Connection", connectionId: "opencode" },
        model: { connectionId: "openrouter", id: "claude-opus-5-5", effort: "high" },
        sandbox: { connectionId: "machine" },
        issues: [],
      },
      {
        id: "archivist",
        memberId: "member-archivist",
        name: "Archivist",
        instructions: "Summarize closed threads.",
        harness: { _tag: "Auto" },
        model: { connectionId: "vertex", id: "gemini-3-pro" },
        sandbox: { connectionId: "gone" },
        issues: [
          { _tag: "Uninstalled", part: "model" },
          { _tag: "Removed", part: "sandbox" },
        ],
      },
    ] as Stored[],
    /** Answers to the next writes, in order; then success. */
    answers: [] as Response[],
  };
  const writes: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const base = "/workspaces/one/agents";
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 1 }], invitations: [] });
    if (path === "/workspaces/one/members") return json([owner]);
    if (path === "/workspaces/one/permissions") return json(["agent.create"]);
    if (path === "/workspaces/one/settings") return json(settings);
    if (path === "/workspaces/one/groups") return json(groups);
    if (path === "/workspaces/one/active-turns") return json(activeTurns);
    if (path === "/workspaces/one/connections/integrations") return json(integrations);
    if (path === "/workspaces/one/connections") return json(connections);
    if (path === "/workspaces/one/connections/openrouter/models")
      return json({ listed: [opus], unlisted: false });
    if (path.endsWith("/models")) return json({ listed: [], unlisted: true });
    if (path === base && request.method === "GET")
      return json(
        server.agents.map(viewOf).toSorted((left, right) => left.name.localeCompare(right.name)),
      );
    const body = request.method === "DELETE" ? undefined : await request.json();
    writes.push({
      method: request.method,
      path,
      key: request.headers.get("idempotency-key"),
      body,
    });
    const answer = server.answers.shift();
    if (answer) return answer;
    if (path.startsWith("/workspaces/one/members/") && request.method === "DELETE") {
      const memberId = path.split("/")[4];
      const removed = server.agents.find((agent) => agent.memberId === memberId);
      server.agents = server.agents.filter((agent) => agent !== removed);
      return json({
        id: memberId,
        workspaceId: "one",
        identity: { _tag: "Agent", id: removed?.id },
        name: removed?.name,
        status: "removed",
      });
    }
    if (path === base) {
      const input = body as Omit<Stored, "id" | "memberId" | "issues">;
      const created: Stored = {
        id: "created",
        memberId: "member-created",
        name: input.name,
        instructions: input.instructions,
        harness: input.harness,
        model: input.model,
        sandbox: input.sandbox,
        issues: [],
      };
      server.agents.push(created);
      return json(viewOf(created), 201);
    }
    const id = path.split("/")[4];
    const stored = server.agents.find((agent) => agent.id === id);
    if (!stored) return json({ _tag: "AgentService.NotFound", agentId: id }, 404);
    if (path.endsWith("/rename")) stored.name = (body as { name: string }).name;
    if (path.endsWith("/configuration")) Object.assign(stored, body);
    return json(viewOf(stored));
  });
  const done: AgentsDone[] = [];
  let view!: ReturnType<typeof useAgents>;
  let list!: ReturnType<typeof useAgentList>;
  function Consumer() {
    view = useAgents("one", { done: (entry) => done.push(entry) });
    list = useAgentList("one");
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
    get list() {
      return list;
    },
    server,
    writes,
    done,
  };
}

it("refreshes agents on their facts, their memberships, their connections, and access", () => {
  const keys = (name: string) => affectedKeys("one", [{ name }]);
  for (const name of [
    "agent.created",
    "agent.configured",
    "workspace.member.renamed",
    "workspace.member.removed",
    "connection.removed",
    "workspace.assignment.created",
  ])
    expect(keys(name)).toContain("workspace/one/agents");
  expect(keys("connection.key-replaced")).not.toContain("workspace/one/agents");
});

it("shapes agents with the connections they name, their model's name, and why they can't run", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.agents()).toHaveLength(2));
  expect(f.view.status()).toBeUndefined();
  await waitFor(() => expect(f.view.agent("reviewer")?.model.name).toBe("Claude Opus 5.5"));
  expect(f.view.agent("reviewer")).toMatchObject({
    memberId: "member-reviewer",
    harness: { kind: "connection", id: "opencode", name: "opencode" },
    model: { connection: { id: "openrouter", name: "OpenRouter" }, effort: "high" },
    sandbox: { id: "machine", name: "This machine" },
    issues: [],
    configurable: true,
  });
  expect(f.view.agent("archivist")).toMatchObject({
    harness: { kind: "auto" },
    model: { connection: { id: "vertex", name: "Vertex" }, id: "gemini-3-pro" },
    sandbox: { id: "gone" },
    issues: [
      { kind: "uninstalled", part: "model" },
      { kind: "removed", part: "sandbox" },
    ],
  });
  expect(f.view.agent("archivist")?.model.name).toBeUndefined();
  await waitFor(() => expect(f.view.agent("reviewer")?.createdBy).toBe("Alice"));
  await waitFor(() => expect(f.list.canCreate()).toBe(true));
  expect(f.list.agents().map((entry) => [entry.name, entry.issues.length])).toEqual([
    ["Archivist", 2],
    ["Reviewer", 0],
  ]);
  // No agent starts as the owner; the reader gives Administrator only when they may.
  await waitFor(() => expect(f.view.roles()).toHaveLength(2));
  expect(f.view.roles()).toEqual([
    { id: "builtin:member", name: "Member", assignable: true },
    { id: "builtin:administrator", name: "Administrator", assignable: false },
  ]);
});

it("says where each agent is at work, its most pressing turn first, and lists its turns", async () => {
  const f = fixture();
  await waitFor(() =>
    expect(f.view.agent("reviewer")?.activity).toEqual({
      state: "working",
      places: ["#design", "#general"],
    }),
  );
  expect(f.view.agent("archivist")?.activity).toBeUndefined();
  expect(f.list.agents().map((entry) => [entry.name, entry.activity?.state])).toEqual([
    ["Archivist", undefined],
    ["Reviewer", "working"],
  ]);
  expect(f.view.turnsOf("member-reviewer")).toEqual([
    {
      id: "queued-turn",
      state: "queued",
      place: "#design",
      groupId: "design",
      threadId: "thread-design",
    },
    {
      id: "working-turn",
      state: "working",
      place: "#general",
      groupId: "general",
      threadId: "thread-general",
    },
  ]);
});

it("offers what each connection gives, keeping one an agent names when it can't be chosen", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.agent("archivist")).toBeDefined());
  const reviewer = f.view.setup.fields("reviewer");
  expect(reviewer.harnesses).toEqual([
    { id: "amends", name: "Amends harness", integrationName: "amends", requiresSandbox: false },
    { id: "opencode", name: "opencode", integrationName: "opencode", requiresSandbox: true },
  ]);
  expect(reviewer.modelConnections.map((option) => option.id)).toEqual(["openrouter"]);
  expect(reviewer.sandboxes.map((option) => option.id)).toEqual(["machine"]);
  await waitFor(() =>
    expect(f.view.setup.fields("reviewer").models).toEqual({
      status: "loaded",
      listed: [{ id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: ["low", "high"] }],
      unlisted: false,
    }),
  );
  const archivist = f.view.setup.fields("archivist");
  expect(archivist.harness).toBe("auto");
  expect(archivist.modelConnections).toContainEqual({
    id: "vertex",
    name: "Vertex",
    integrationName: "vertex",
    unavailable: "Its integration isn’t installed on this host.",
  });
  expect(archivist.sandboxes).toContainEqual({
    id: "gone",
    name: "Removed connection",
    integrationName: "",
    unavailable: "This connection was removed.",
  });
  // An unavailable connection's models are never read.
  expect(archivist.models).toBeUndefined();
});

it("creates an agent as a member, retrying with the same request key", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.roles()).toHaveLength(2));
  f.view.create.begin();
  expect(f.view.create.roleId()).toBe("builtin:member");
  // Administrator isn't the reader's to give, so the draft keeps Member.
  f.view.create.setRole("builtin:administrator");
  expect(f.view.create.roleId()).toBe("builtin:member");
  f.view.create.setName(" Scout ");
  const fields = () => f.view.create.fields();
  fields().onInstructionsChange("  Find what changed.\n");
  expect(f.view.create.ready()).toBe(false);
  fields().onModelConnectionChange("openrouter");
  fields().onModelChange(" claude-opus-5-5 ");
  fields().onEffortChange("low");
  expect(f.view.create.ready()).toBe(true);
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "create", error: "failed" }));
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.done[0]).toEqual({ action: "create", subject: "Scout", created: "created" });
  expect(f.writes.slice(0, 2).map((write) => write.key)).toEqual([
    f.writes[0]?.key,
    f.writes[0]?.key,
  ]);
  expect(f.writes[1]?.body).toEqual({
    name: "Scout",
    roleId: "builtin:member",
    instructions: "Find what changed.",
    harness: { _tag: "Auto" },
    model: { connectionId: "openrouter", id: "claude-opus-5-5", effort: "low" },
    sandbox: null,
  });
  expect(f.view.create.name()).toBe("");
  expect(f.view.agent("created")).toBeDefined();
});

it("says which connection the host refused and why a setup couldn't run, keeping the draft", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.roles()).toHaveLength(2));
  f.view.create.begin();
  f.view.create.setName("Scout");
  f.view.create.fields().onModelConnectionChange("openrouter");
  f.view.create.fields().onModelChange("claude-opus-5-5");
  f.server.answers.push(
    json(
      { _tag: "AgentService.ConnectionUnavailable", part: "model", connectionId: "openrouter" },
      422,
    ),
  );
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "create", error: "unavailable", part: "model" }),
  );
  f.server.answers.push(
    json({ _tag: "AgentService.Incomplete", issues: [{ _tag: "SandboxRequired" }] }, 422),
  );
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({
      action: "create",
      error: "incomplete",
      issues: [{ kind: "sandbox-required" }],
    }),
  );
  f.server.answers.push(json({ _tag: "Delegation.Denied", reason: "administrator-role" }, 403));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "create", error: "role-denied" }));
  expect(f.view.stale()).toBe(false);
  expect(f.view.create.name()).toBe("Scout");
});

it("stops showing what the host refused as the fields that may resolve it change", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.roles()).toHaveLength(2));
  f.view.create.begin();
  f.view.create.setName("Scout");
  f.view.create.fields().onModelConnectionChange("openrouter");
  f.view.create.fields().onModelChange("sonnet");
  const refused = [
    { _tag: "SandboxRequired" },
    { _tag: "Invalid", part: "model", description: "OpenRouter offers no model sonnet." },
  ];
  f.server.answers.push(json({ _tag: "AgentService.Incomplete", issues: refused }, 422));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()?.issues).toHaveLength(2));

  // Instructions resolve nothing; a sandbox resolves its issue alone.
  f.view.create.fields().onInstructionsChange("Scout ahead.");
  expect(f.view.failure()?.issues).toHaveLength(2);
  f.view.create.fields().onSandboxChange("machine");
  expect(f.view.failure()).toEqual({
    action: "create",
    error: "incomplete",
    issues: [{ kind: "invalid", part: "model", description: "OpenRouter offers no model sonnet." }],
  });
  f.view.create.fields().onModelChange("claude-opus-5-5");
  expect(f.view.failure()).toBeUndefined();

  // A connection the host refused stops showing once another is chosen, until the next save.
  f.server.answers.push(
    json(
      { _tag: "AgentService.ConnectionUnavailable", part: "model", connectionId: "openrouter" },
      422,
    ),
  );
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()?.error).toBe("unavailable"));
  f.view.create.fields().onSandboxChange(undefined);
  expect(f.view.failure()?.part).toBe("model");
  f.view.create.fields().onModelConnectionChange("vertex");
  expect(f.view.failure()).toBeUndefined();
});

it("saves a setup as a whole once it differs, and discards edits", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.agent("reviewer")).toBeDefined());
  const fields = () => f.view.setup.fields("reviewer");
  fields().onEffortChange("high");
  expect(f.view.setup.changed("reviewer")).toBe(false);
  fields().onHarnessChange("amends");
  fields().onSandboxChange(undefined);
  fields().onEffortChange(undefined);
  expect(f.view.setup.changed("reviewer")).toBe(true);
  f.view.setup.discard("reviewer");
  expect(fields().harness).toBe("opencode");
  fields().onHarnessChange("amends");
  fields().onSandboxChange(undefined);
  fields().onEffortChange(undefined);
  f.view.setup.save("reviewer");
  await waitFor(() => expect(f.done).toEqual([{ action: "configure", subject: "Reviewer" }]));
  expect(f.writes[0]).toMatchObject({
    method: "PUT",
    path: "/workspaces/one/agents/reviewer/configuration",
    body: {
      instructions: "Review each change.",
      harness: { _tag: "Connection", connectionId: "amends" },
      model: { connectionId: "openrouter", id: "claude-opus-5-5" },
      sandbox: null,
    },
  });
  expect(f.view.agent("reviewer")?.sandbox).toBeUndefined();
  expect(f.view.setup.changed("reviewer")).toBe(false);
});

it("keeps a rename draft through a conflict, and removes an agent by its membership", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.agent("reviewer")).toBeDefined());
  f.view.rename.setName("reviewer", "Critic");
  f.server.agents[0]!.name = "Reviewer two";
  f.server.answers.push(json({ _tag: "AgentService.Changed", agentId: "reviewer" }, 409));
  f.view.rename.save("reviewer");
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "rename", error: "changed" }));
  expect(f.view.stale()).toBe(true);
  f.view.refresh();
  await waitFor(() => expect(f.view.stale()).toBe(false));
  expect(f.view.rename.name("reviewer")).toBe("Critic");
  f.view.rename.save("reviewer");
  await waitFor(() => expect(f.done).toEqual([{ action: "rename", subject: "Critic" }]));
  expect(f.writes[1]?.body).toEqual({ name: "Critic", expectedName: "Reviewer two" });

  f.view.remove("reviewer");
  await waitFor(() => expect(f.done).toHaveLength(2));
  expect(f.done[1]).toEqual({ action: "remove", subject: "Critic" });
  expect(f.writes[2]).toMatchObject({
    method: "DELETE",
    path: "/workspaces/one/members/member-reviewer",
  });
  expect(f.view.agent("reviewer")).toBeUndefined();
});
