import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { affectedKeys } from "../src/live/api.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useEnvironments,
  type EnvironmentsDone,
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
const implementations = {
  harnesses: [
    {
      id: "amends",
      name: "Amends",
      description: "Amends's own agent loop.",
      placement: ["in-process"],
      models: { _tag: "LanguageModel" },
    },
  ],
  sandboxes: [
    {
      id: "local",
      name: "Local directory",
      description: "Runs on this host without isolation.",
      capabilities: { stdin: true, snapshots: "filesystem", isolated: false },
      account: false,
    },
    {
      id: "daytona",
      name: "Daytona",
      description: "Isolated containers in your Daytona account.",
      capabilities: { stdin: true, snapshots: "filesystem", isolated: true },
      account: true,
      template: { label: "Snapshot" },
    },
  ],
};
const account = (id: string, name: string, keyed: boolean) => ({
  id,
  name,
  implementationId: "daytona",
  settings: {},
  authentication: { _tag: "ApiKey", configured: keyed },
  createdBy: "owner",
  createdAt: "2026-09-28T12:00:00.000Z",
  installed: true,
  capabilities: { sandbox: { provider: "daytona" } },
  manageable: true,
  readiness: {
    sandbox: keyed ? { _tag: "Ready" } : { _tag: "Incomplete", settings: [], credential: true },
  },
});
interface Stored {
  id: string;
  name: string;
  sandbox: null | {
    providerId: string;
    harness: string;
    connectionId: string | null;
    template: string | null;
    env: Record<string, string>;
    setup: string[];
    retention: string;
  };
  createdBy: string | null;
  issues?: string[];
}
const viewOf = (environment: Stored) => ({
  id: environment.id,
  name: environment.name,
  harnessId: "amends",
  sandbox: environment.sandbox,
  createdBy: environment.createdBy,
  createdAt: "2026-09-28T12:00:00.000Z",
  manageable: true,
  readiness:
    environment.issues && environment.issues.length > 0
      ? { _tag: "Incomplete", issues: environment.issues }
      : { _tag: "Ready" },
});

function fixture() {
  const server = {
    environments: [
      { id: "in-process", name: "In-process", sandbox: null, createdBy: null },
      {
        id: "review",
        name: "Review sandbox",
        sandbox: {
          providerId: "daytona",
          harness: "in-process",
          connectionId: "backup",
          template: null,
          env: { NODE_ENV: "development" },
          setup: ["mkdir -p .cache", "bun install"],
          retention: "stop",
        },
        createdBy: "owner",
        issues: ["connection-incomplete"],
      },
    ] as Stored[],
    /** Answers to the next writes, in order; then success. */
    answers: [] as Response[],
  };
  const writes: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 1 }], invitations: [] });
    if (path === "/workspaces/one/members") return json([owner]);
    if (path === "/workspaces/one/permissions") return json(["environment.create"]);
    if (path === "/workspaces/one/connections")
      return json([
        account("team", "Daytona · Team", true),
        account("backup", "Daytona · Backup", false),
      ]);
    if (path === "/workspaces/one/environments/implementations") return json(implementations);
    if (path === "/workspaces/one/environments" && request.method === "GET")
      return json(server.environments.map(viewOf));
    if (!path.startsWith("/workspaces/one/environments")) return json({}, 404);
    const body = request.method === "DELETE" ? undefined : await request.json();
    writes.push({
      method: request.method,
      path,
      key: request.headers.get("idempotency-key"),
      body,
    });
    const answer = server.answers.shift();
    if (answer) return answer;
    if (path === "/workspaces/one/environments") {
      const input = body as { name: string; sandbox: Stored["sandbox"] };
      const created: Stored = {
        id: "created",
        name: input.name,
        sandbox: input.sandbox,
        createdBy: "owner",
      };
      server.environments.push(created);
      return json(viewOf(created), 201);
    }
    const id = path.split("/")[4];
    const stored = server.environments.find((environment) => environment.id === id);
    if (!stored) return json({ _tag: "EnvironmentService.NotFound", environmentId: id }, 404);
    if (path.endsWith("/rename")) stored.name = (body as { name: string }).name;
    if (path.endsWith("/sandbox") && stored.sandbox)
      stored.sandbox = Object.assign({}, stored.sandbox, (body as { sandbox: object }).sandbox);
    if (request.method === "DELETE") {
      server.environments = server.environments.filter((environment) => environment !== stored);
      return new Response(null, { status: 204 });
    }
    return json(viewOf(stored));
  });
  const done: EnvironmentsDone[] = [];
  let view!: ReturnType<typeof useEnvironments>;
  function Consumer() {
    view = useEnvironments("one", { done: (entry) => done.push(entry) });
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
  };
}

it("shapes environments with their harness, sandbox, account, and readiness", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.environments()).toHaveLength(2));
  const [inProcess, review] = f.view.environments();
  expect(inProcess).toMatchObject({
    name: "In-process",
    harness: { name: "Amends", placements: ["in-process"] },
    sandbox: undefined,
    issues: [],
    createdBy: undefined,
  });
  await waitFor(() =>
    expect(f.view.environment("review")?.sandbox?.account?.name).toBe("Daytona · Backup"),
  );
  expect(review).toMatchObject({
    sandbox: {
      providerId: "daytona",
      provider: { name: "Daytona", account: true, template: { label: "Snapshot" } },
      placement: "in-process",
      variables: [{ key: "NODE_ENV", value: "development" }],
      commands: ["mkdir -p .cache", "bun install"],
      retention: "stop",
    },
    issues: ["connection-incomplete"],
  });
  // Daytona's accounts, the ready one first.
  expect(f.view.accounts("daytona").map(({ name, ready }) => [name, ready])).toEqual([
    ["Daytona · Team", true],
    ["Daytona · Backup", false],
  ]);
  await waitFor(() => expect(f.view.canCreate()).toBe(true));
  await waitFor(() => expect(f.view.environment("review")?.createdBy).toBe("Alice"));
});

it("adds a Daytona environment in two steps, retrying a lost response with the same key", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.providers()).toHaveLength(2));
  f.view.create.begin();
  expect(f.view.create.harnessId()).toBe("amends");
  expect(f.view.create.placements()).toEqual(["in-process"]);
  f.view.create.setName(" Release sandbox ");
  expect(f.view.create.basicsReady()).toBe(true);
  f.view.create.setProvider("daytona");
  f.view.create.next();
  expect(f.view.create.step()).toBe("sandbox");
  // Daytona runs under an account, so the draft waits for one.
  expect(f.view.create.ready()).toBe(false);
  const sandbox = f.view.create.sandbox;
  sandbox.setAccount("team");
  sandbox.setTemplate(" amends-dev-base ");
  sandbox.addVariable();
  const [row] = sandbox.draft().variables;
  sandbox.setVariable(row!.id, { key: "9LIVES", value: "x" });
  expect(sandbox.variableIssue(row!.id)).toBe("invalid");
  expect(f.view.create.ready()).toBe(false);
  sandbox.setVariable(row!.id, { key: "NODE_ENV", value: "production" });
  sandbox.addCommand();
  sandbox.addCommand();
  const [first, second] = sandbox.draft().commands;
  sandbox.setCommand(first!.id, "bun install");
  sandbox.setCommand(second!.id, "mkdir -p .cache");
  sandbox.moveCommand(second!.id, -1);
  sandbox.setRetention("destroy");
  expect(f.view.create.ready()).toBe(true);
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "create", error: "failed", problems: [] }),
  );
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.done[0]).toEqual({ action: "create", subject: "Release sandbox", created: "created" });
  expect(f.writes.map(({ key }) => key)).toEqual([f.writes[0]?.key, f.writes[0]?.key]);
  expect(f.writes[1]?.body).toEqual({
    name: "Release sandbox",
    harnessId: "amends",
    sandbox: {
      providerId: "daytona",
      harness: "in-process",
      connectionId: "team",
      template: "amends-dev-base",
      env: { NODE_ENV: "production" },
      setup: ["mkdir -p .cache", "bun install"],
      retention: "destroy",
    },
  });
  expect(f.view.create.active()).toBe(false);
});

it("keeps sandbox edits when the host refuses an account, naming the problem", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.environment("review")).toBeDefined());
  const editor = f.view.configure.sandbox("review");
  expect(editor.draft().commands.map(({ command }) => command)).toEqual([
    "mkdir -p .cache",
    "bun install",
  ]);
  expect(f.view.configure.changed("review")).toBe(false);
  editor.setAccount("team");
  f.view.configure.sandbox("review").setRetention("destroy");
  expect(f.view.configure.changed("review")).toBe(true);
  f.server.answers.push(
    json({ _tag: "EnvironmentService.InvalidSandbox", issues: ["connection-unavailable"] }, 422),
  );
  f.view.configure.save("review");
  await waitFor(() =>
    expect(f.view.failure()).toEqual({
      action: "configure",
      error: "invalid",
      problems: ["connection-unavailable"],
    }),
  );
  expect(f.view.stale()).toBe(false);
  expect(f.view.configure.sandbox("review").draft()).toMatchObject({
    accountId: "team",
    retention: "destroy",
  });
  f.view.configure.save("review");
  await waitFor(() => expect(f.done).toEqual([{ action: "configure", subject: "Review sandbox" }]));
  expect(f.writes[1]?.body).toEqual({
    sandbox: {
      connectionId: "team",
      template: null,
      env: { NODE_ENV: "development" },
      setup: ["mkdir -p .cache", "bun install"],
      retention: "destroy",
    },
  });
  expect(f.view.environment("review")?.sandbox?.retention).toBe("destroy");
});

it("keeps a rename draft through a conflict, and refreshes on environment and account facts", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.environment("review")).toBeDefined());
  f.view.rename.setName("review", "Review box");
  f.server.environments[1]!.name = "Reviews";
  f.server.answers.push(json({ _tag: "EnvironmentService.Changed", environmentId: "review" }, 409));
  f.view.rename.save("review");
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "rename", error: "changed", problems: [] }),
  );
  expect(f.view.stale()).toBe(true);
  f.view.refresh();
  await waitFor(() => expect(f.view.stale()).toBe(false));
  f.view.rename.save("review");
  await waitFor(() => expect(f.done).toEqual([{ action: "rename", subject: "Review box" }]));
  expect(f.writes[1]?.body).toEqual({ name: "Review box", expectedName: "Reviews" });
  for (const name of [
    "environment.created",
    "environment.renamed",
    "environment.configured",
    "environment.removed",
    "connection.credential-set",
    "workspace.assignment.created",
  ])
    expect(affectedKeys("one", [{ name }], true)).toContain("workspace/one/environments");
});
