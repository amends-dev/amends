import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { createSignal } from "solid-js";
import { FetchHttpClient } from "effect/unstable/http";
import { affectedKeys } from "../src/api/changes.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useAgents,
  type AgentsDone,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
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
    { role: role("builtin:administrator", "Administrator"), assignable: true },
    { role: role("builtin:owner", "Owner"), assignable: false },
  ],
};
const anthropic = {
  id: "anthropic",
  name: "Anthropic",
  description: "Claude models through the Anthropic API.",
  capabilities: {
    modelInference: {
      interface: "anthropic-messages",
      models: [
        { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
        { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      ],
    },
  },
  settings: [],
  authentication: [{ _tag: "ApiKey", label: "API key" }],
};
const connection = (id: string, name: string, keyed: boolean) => ({
  id,
  name,
  implementationId: "anthropic",
  settings: {},
  authentication: { _tag: "ApiKey", configured: keyed },
  createdBy: "owner",
  createdAt: "2026-09-28T12:00:00.000Z",
  installed: true,
  capabilities: anthropic.capabilities,
  manageable: true,
  readiness: {
    modelInference: keyed
      ? { _tag: "Ready" }
      : { _tag: "Incomplete", settings: [], credential: true },
  },
});
const environments = {
  implementations: {
    harnesses: [
      {
        id: "amends",
        name: "Amends",
        description: "Amends's own agent loop.",
        placement: ["in-process"],
        models: { _tag: "LanguageModel" },
      },
    ],
    sandboxes: [],
  },
  list: [
    {
      id: "in-process",
      name: "In-process",
      harnessId: "amends",
      sandbox: null,
      createdBy: null,
      createdAt: "2026-09-28T12:00:00.000Z",
      manageable: true,
      readiness: { _tag: "Ready" },
    },
  ],
};
interface Stored {
  id: string;
  name: string;
  instructions: string;
  model: { connectionId: string; model: string; reasoning: string | null };
  environmentId: string;
  issues?: Array<{ _tag: string }>;
}
const viewOf = (agent: Stored) => ({
  id: agent.id,
  memberId: `member-${agent.id}`,
  name: agent.name,
  instructions: agent.instructions,
  model: agent.model,
  environmentId: agent.environmentId,
  createdBy: "owner",
  createdAt: "2026-09-28T12:00:00.000Z",
  role: { id: "builtin:member", name: "Member" },
  configurable: true,
  removable: true,
  usable: true,
  readiness:
    agent.issues && agent.issues.length > 0
      ? { _tag: "Incomplete", issues: agent.issues }
      : { _tag: "Ready" },
});

function fixture() {
  const server = {
    agents: [
      {
        id: "atlas",
        name: "Atlas",
        instructions: "Review changes.",
        model: { connectionId: "team", model: "claude-sonnet-5", reasoning: null },
        environmentId: "in-process",
      },
      {
        id: "helper",
        name: "Review helper",
        instructions: "Help.",
        model: { connectionId: "backup", model: "claude-sonnet-5", reasoning: null },
        environmentId: "in-process",
        issues: [{ _tag: "ConnectionNotReady" }],
      },
    ] as Stored[],
    /** Answers to the next writes, in order; then success. */
    answers: [] as Response[],
    choices: [] as string[],
  };
  const writes: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 1 }], invitations: [] });
    if (path === "/workspaces/one/members") return json([owner]);
    if (path === "/workspaces/one/permissions") return json(["agent.create"]);
    if (path === "/workspaces/one/settings") return json(settings);
    if (path === "/workspaces/one/connections")
      return json([
        connection("team", "Anthropic · Team", true),
        connection("backup", "Anthropic · Backup", false),
      ]);
    if (path === "/workspaces/one/connections/implementations") return json([anthropic]);
    if (path === "/workspaces/one/environments/implementations")
      return json(environments.implementations);
    if (path === "/workspaces/one/environments") return json(environments.list);
    if (path === "/workspaces/one/agents/environment-choices") {
      const connectionId = url.searchParams.get("connectionId");
      server.choices.push(`${connectionId}/${url.searchParams.get("model")}`);
      return json([
        {
          environmentId: "in-process",
          compatibility:
            connectionId === "team"
              ? { _tag: "Compatible" }
              : { _tag: "Incompatible", reasons: [{ _tag: "ConnectionNotReady" }] },
        },
      ]);
    }
    if (path === "/workspaces/one/agents" && request.method === "GET")
      return json(server.agents.map(viewOf));
    if (!path.startsWith("/workspaces/one/agents")) return json({}, 404);
    const body = request.method === "DELETE" ? undefined : await request.json();
    writes.push({
      method: request.method,
      path,
      key: request.headers.get("idempotency-key"),
      body,
    });
    const answer = server.answers.shift();
    if (answer) return answer;
    if (path === "/workspaces/one/agents") {
      const input = body as Stored;
      const created: Stored = { ...input, id: "created" };
      server.agents.push(created);
      return json(viewOf(created), 201);
    }
    const id = path.split("/")[4];
    const stored = server.agents.find((agent) => agent.id === id);
    if (!stored) return json({ _tag: "AgentService.NotFound", agentId: id }, 404);
    if (path.endsWith("/rename")) stored.name = (body as { name: string }).name;
    if (path.endsWith("/configuration")) Object.assign(stored, body as object);
    if (request.method === "DELETE") {
      server.agents = server.agents.filter((agent) => agent !== stored);
      return new Response(null, { status: 204 });
    }
    return json(viewOf(stored));
  });
  const done: AgentsDone[] = [];
  let view!: ReturnType<typeof useAgents>;
  const [selected, setSelected] = createSignal<string>();
  function Consumer() {
    view = useAgents("one", { selected, done: (entry) => done.push(entry) });
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
    done,
    setSelected,
  };
}

it("shapes agents with their model access, environment, role, and readiness", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.agents()).toHaveLength(2));
  await waitFor(() => expect(f.view.agent("atlas")?.connection.name).toBe("Anthropic · Team"));
  await waitFor(() =>
    expect(f.view.agent("atlas")?.environment.runtime).toBe("Amends · No sandbox"),
  );
  expect(f.view.agent("atlas")).toMatchObject({
    name: "Atlas",
    role: "Member",
    model: "claude-sonnet-5",
    reasoning: undefined,
    environment: { id: "in-process", name: "In-process" },
    issues: [],
    configurable: true,
    removable: true,
  });
  expect(f.view.agent("helper")?.issues).toEqual(["connection-not-ready"]);
  // Model connections with their provider's suggestions, the ready one first.
  expect(f.view.connections().map(({ name, ready }) => [name, ready])).toEqual([
    ["Anthropic · Team", true],
    ["Anthropic · Backup", false],
  ]);
  expect(f.view.connections()[0]?.models.map(({ id }) => id)).toEqual([
    "claude-opus-5-5",
    "claude-sonnet-5",
  ]);
  // The owner may give Member or Administrator; nobody gives Owner.
  await waitFor(() =>
    expect(f.view.roles().map(({ name }) => name)).toEqual(["Member", "Administrator"]),
  );
  await waitFor(() => expect(f.view.canCreate()).toBe(true));
  await waitFor(() => expect(f.view.agent("atlas")?.createdBy).toBe("Alice"));
});

it("adds an agent as Member with fitting choices, retrying a lost response with the same key", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connections()).toHaveLength(2));
  await waitFor(() => expect(f.view.roles()).toHaveLength(2));
  f.view.create.begin();
  const configuration = f.view.create.configuration;
  // The first ready connection, its first suggestion, and the first environment.
  expect(configuration.draft()).toMatchObject({
    connectionId: "team",
    model: "claude-opus-5-5",
    environmentId: "in-process",
  });
  expect(f.view.create.roleId()).toBe("builtin:member");
  await waitFor(() => expect(configuration.environment()?.fit).toEqual({ kind: "works" }));
  // A connection still needing its key can be chosen; the environment then needs setup.
  configuration.setConnection("backup");
  await waitFor(() =>
    expect(configuration.environment()?.fit).toEqual({
      kind: "needs-setup",
      issues: [],
      connection: true,
    }),
  );
  configuration.setConnection("team");
  configuration.setModel(" claude-sonnet-5 ");
  configuration.setInstructions(" Review each change. ");
  expect(f.view.create.ready()).toBe(false);
  f.view.create.setName(" Scout ");
  await waitFor(() => expect(f.view.create.ready()).toBe(true));
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "create", error: "failed", problems: [] }),
  );
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.done[0]).toEqual({ action: "create", subject: "Scout", created: "created" });
  expect(f.writes.map(({ key }) => key)).toEqual([f.writes[0]?.key, f.writes[0]?.key]);
  expect(f.writes[1]?.body).toEqual({
    name: "Scout",
    roleId: "builtin:member",
    instructions: "Review each change.",
    model: { connectionId: "team", model: "claude-sonnet-5", reasoning: null },
    environmentId: "in-process",
  });
  expect(f.view.create.active()).toBe(false);
});

it("keeps configuration edits when the host refuses the connection, naming the problem", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.agent("atlas")).toBeDefined());
  f.setSelected("atlas");
  const editor = f.view.configure.configuration("atlas");
  expect(editor.draft()).toMatchObject({ connectionId: "team", model: "claude-sonnet-5" });
  expect(f.view.configure.changed("atlas")).toBe(false);
  editor.setInstructions("Review, then summarize.");
  await waitFor(() => expect(f.view.configure.changed("atlas")).toBe(true));
  f.server.answers.push(
    json({ _tag: "AgentService.ConnectionUnavailable", connectionId: "team" }, 422),
  );
  f.view.configure.save("atlas");
  await waitFor(() =>
    expect(f.view.failure()).toEqual({
      action: "configure",
      error: "invalid",
      problems: [{ kind: "connection-unavailable" }],
    }),
  );
  expect(f.view.stale()).toBe(false);
  expect(f.view.configure.configuration("atlas").draft().instructions).toBe(
    "Review, then summarize.",
  );
  // Administrator refused to a non-owner is worded at the role field and keeps the draft current.
  f.view.create.begin();
  f.view.create.setName("Lead");
  f.view.create.setRole("builtin:administrator");
  await waitFor(() => expect(f.view.create.ready()).toBe(true));
  f.server.answers.push(json({ _tag: "Delegation.Denied", reason: "administrator-role" }, 403));
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({
      action: "create",
      error: "invalid",
      problems: [{ kind: "role-denied" }],
    }),
  );
  expect(f.view.stale()).toBe(false);
  f.view.create.cancel();
  f.view.configure.save("atlas");
  await waitFor(() => expect(f.done).toEqual([{ action: "configure", subject: "Atlas" }]));
  expect(f.writes.at(-1)?.body).toEqual({
    instructions: "Review, then summarize.",
    model: { connectionId: "team", model: "claude-sonnet-5", reasoning: null },
    environmentId: "in-process",
  });
  expect(f.view.agent("atlas")?.instructions).toBe("Review, then summarize.");
});

it("keeps a rename draft through a conflict, and refreshes on agent, member, and setup facts", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.agent("atlas")).toBeDefined());
  f.view.rename.setName("atlas", "Critic");
  f.server.agents[0]!.name = "Atlas two";
  f.server.answers.push(json({ _tag: "AgentService.Changed", agentId: "atlas" }, 409));
  f.view.rename.save("atlas");
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "rename", error: "changed", problems: [] }),
  );
  expect(f.view.stale()).toBe(true);
  f.view.refresh();
  await waitFor(() => expect(f.view.stale()).toBe(false));
  f.view.rename.save("atlas");
  await waitFor(() => expect(f.done).toEqual([{ action: "rename", subject: "Critic" }]));
  expect(f.writes[1]?.body).toEqual({ name: "Critic", expectedName: "Atlas two" });
  for (const name of [
    "agent.created",
    "agent.configured",
    "workspace.member.renamed",
    "workspace.member.removed",
    "connection.credential-set",
    "environment.configured",
    "workspace.assignment.created",
  ])
    expect(affectedKeys("one", [{ name }], true)).toContain("workspace/one/agents");
});
