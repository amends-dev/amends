import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { affectedKeys } from "../src/live/api.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useConnections,
  type ConnectionsDone,
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
const anthropic = {
  id: "anthropic",
  name: "Anthropic",
  description: "Claude models through the Anthropic API.",
  capabilities: { modelInference: { interface: "anthropic-messages" } },
  settings: [{ key: "baseUrl", label: "API URL", kind: "url", required: false }],
  authentication: [{ _tag: "ApiKey", label: "API key" }],
};
const compatible = {
  id: "openai-compatible",
  name: "OpenAI-compatible",
  description: "OpenAI, OpenRouter, or a compatible local server.",
  capabilities: { modelInference: { interface: "openai-chat-completions" } },
  settings: [{ key: "baseUrl", label: "API URL", kind: "url", required: true }],
  authentication: [{ _tag: "ApiKey", label: "API key" }, { _tag: "None" }],
};
interface Stored {
  id: string;
  name: string;
  implementationId: string;
  settings: Record<string, string>;
  keyed: boolean | undefined;
}
const viewOf = (connection: Stored) => {
  const declaration = [anthropic, compatible].find(
    (each) => each.id === connection.implementationId,
  );
  const missing =
    declaration?.settings.flatMap((setting) =>
      setting.required && !connection.settings[setting.key] ? [setting.key] : [],
    ) ?? [];
  const credential = connection.keyed === false;
  return {
    id: connection.id,
    name: connection.name,
    implementationId: connection.implementationId,
    settings: connection.settings,
    authentication:
      connection.keyed === undefined
        ? { _tag: "None" }
        : { _tag: "ApiKey", configured: connection.keyed },
    createdBy: "owner",
    createdAt: "2026-09-28T12:00:00.000Z",
    installed: declaration !== undefined,
    capabilities: declaration?.capabilities ?? {},
    manageable: true,
    readiness: declaration
      ? {
          modelInference:
            missing.length === 0 && !credential
              ? { _tag: "Ready" }
              : { _tag: "Incomplete", settings: missing, credential },
        }
      : {},
  };
};

function fixture() {
  const server = {
    connections: [
      { id: "team", name: "Team", implementationId: "anthropic", settings: {}, keyed: true },
      {
        id: "local",
        name: "Local",
        implementationId: "openai-compatible",
        settings: { baseUrl: "http://127.0.0.1:11434/v1" },
        keyed: false,
      },
      { id: "old", name: "Old", implementationId: "vertex", settings: {}, keyed: true },
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
    if (path === "/workspaces/one/permissions") return json(["connection.create"]);
    if (path === "/workspaces/one/connections/implementations")
      return json([anthropic, compatible]);
    if (path === "/workspaces/one/connections" && request.method === "GET")
      return json(server.connections.map(viewOf));
    if (!path.startsWith("/workspaces/one/connections")) return json({}, 404);
    const body = request.method === "DELETE" ? undefined : await request.json();
    writes.push({
      method: request.method,
      path,
      key: request.headers.get("idempotency-key"),
      body,
    });
    const answer = server.answers.shift();
    if (answer) return answer;
    const id = path.split("/")[4];
    const stored = server.connections.find((connection) => connection.id === id);
    if (path === "/workspaces/one/connections") {
      const input = body as {
        name: string;
        implementationId: string;
        settings: Record<string, string>;
        authentication: string;
      };
      const created: Stored = {
        id: "created",
        name: input.name,
        implementationId: input.implementationId,
        settings: input.settings,
        keyed: input.authentication === "ApiKey" ? false : undefined,
      };
      server.connections.push(created);
      return json(viewOf(created), 201);
    }
    if (!stored) return json({ _tag: "ConnectionService.NotFound", connectionId: id }, 404);
    if (path.endsWith("/rename")) stored.name = (body as { name: string }).name;
    if (path.endsWith("/settings"))
      stored.settings = (body as { settings: Record<string, string> }).settings;
    if (path.endsWith("/credential")) stored.keyed = request.method === "PUT";
    if (request.method === "DELETE" && !path.endsWith("/credential")) {
      server.connections = server.connections.filter((connection) => connection !== stored);
      return new Response(null, { status: 204 });
    }
    return json(viewOf(stored));
  });
  const done: ConnectionsDone[] = [];
  let view!: ReturnType<typeof useConnections>;
  function Consumer() {
    view = useConnections("one", { done: (entry) => done.push(entry) });
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

it("shapes connections with their providers, setup, and what they still need", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.connections()).toHaveLength(3));
  expect(f.view.status()).toBeUndefined();
  expect(f.view.providers().map((provider) => [provider.id, provider.methods])).toEqual([
    ["anthropic", ["api-key"]],
    ["openai-compatible", ["api-key", "none"]],
  ]);
  const [team, local, old] = f.view.connections();
  expect(team).toMatchObject({
    name: "Team",
    provider: { name: "Anthropic", capability: "model-access" },
    endpoint: undefined,
    setup: "configured",
    method: "api-key",
    keySaved: true,
    manageable: true,
  });
  expect(local).toMatchObject({
    setup: "needs-setup",
    endpoint: "http://127.0.0.1:11434/v1",
    missing: { settings: [], key: true },
    settings: [{ key: "baseUrl", label: "API URL", value: "http://127.0.0.1:11434/v1" }],
  });
  // A provider this host no longer installs keeps its connection, which cannot be used.
  expect(old).toMatchObject({ provider: undefined, setup: "unavailable", keySaved: true });
  await waitFor(() => expect(f.view.canCreate()).toBe(true));
  await waitFor(() => expect(f.view.connection("team")?.createdBy).toBe("Alice"));
});

it("creates a connection, retrying a lost response with the same key, then saves its key", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.providers()).toHaveLength(2));
  f.view.create.begin("openai-compatible");
  expect(f.view.create.name()).toBe("OpenAI-compatible");
  expect(f.view.create.ready()).toBe(false);
  f.view.create.setName(" Router ");
  f.view.create.setValue("baseUrl", "openrouter.ai");
  expect(f.view.create.issue("baseUrl")).toBe("url");
  f.view.create.setValue("baseUrl", "https://openrouter.ai/api/v1");
  expect(f.view.create.ready()).toBe(true);
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "create", error: "failed" }));
  expect(f.view.stale()).toBe(false);
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.done[0]).toEqual({
    action: "create",
    subject: "Router",
    created: "created",
    method: "api-key",
  });
  expect(f.writes.map((write) => write.key)).toEqual([f.writes[0]?.key, f.writes[0]?.key]);
  expect(f.writes[1]?.body).toEqual({
    name: "Router",
    implementationId: "openai-compatible",
    settings: { baseUrl: "https://openrouter.ai/api/v1" },
    authentication: "ApiKey",
  });
  expect(f.view.connection("created")?.setup).toBe("needs-setup");
  // The key goes in on its own and never comes back.
  f.view.key.setSecret("sk-router");
  f.view.key.save("created");
  await waitFor(() => expect(f.done).toHaveLength(2));
  expect(f.done[1]).toMatchObject({ action: "set-key", subject: "Router" });
  expect(f.writes[2]).toMatchObject({
    method: "PUT",
    path: "/workspaces/one/connections/created/credential",
    body: { secret: "sk-router" },
  });
  expect(f.view.key.secret()).toBe("");
  expect(f.view.connection("created")).toMatchObject({ setup: "configured", keySaved: true });
});

it("tells a host without credential storage apart from other failures, keeping the key typed", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connection("local")).toBeDefined());
  f.view.key.setSecret("sk-local");
  f.server.answers.push(
    json({ _tag: "ConnectionService.CredentialsUnavailable", reason: "No credential key" }, 503),
  );
  f.view.key.save("local");
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "set-key", error: "storage-unavailable" }),
  );
  expect(f.view.stale()).toBe(false);
  expect(f.view.key.secret()).toBe("sk-local");
  // Closing the dialog discards what was typed.
  f.view.dismiss();
  expect(f.view.key.secret()).toBe("");
  expect(f.view.failure()).toBeUndefined();
});

it("keeps a rename draft through a conflict and saves it against the name reviewed", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connection("team")).toBeDefined());
  f.view.rename.setName("team", "Studio models");
  expect(f.view.rename.changed("team")).toBe(true);
  // Someone renamed it meanwhile.
  f.server.connections[0]!.name = "Team models";
  f.server.answers.push(json({ _tag: "ConnectionService.Changed", connectionId: "team" }, 409));
  f.view.rename.save("team");
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "rename", error: "changed" }));
  expect(f.view.stale()).toBe(true);
  expect(f.writes[0]?.body).toEqual({ name: "Studio models", expectedName: "Team" });
  f.view.rename.save("team");
  expect(f.writes).toHaveLength(1);
  f.view.refresh();
  await waitFor(() => expect(f.view.stale()).toBe(false));
  expect(f.view.rename.name("team")).toBe("Studio models");
  f.view.rename.save("team");
  await waitFor(() => expect(f.done).toEqual([{ action: "rename", subject: "Studio models" }]));
  expect(f.writes[1]?.body).toEqual({ name: "Studio models", expectedName: "Team models" });
  expect(f.view.connection("team")?.name).toBe("Studio models");
});

it("removes a connection, and refreshes connections on their facts and on access changes", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connections()).toHaveLength(3));
  f.view.remove("old");
  await waitFor(() => expect(f.done).toEqual([{ action: "remove", subject: "Old" }]));
  expect(f.view.connections().map((connection) => connection.id)).toEqual(["team", "local"]);
  for (const name of [
    "connection.created",
    "connection.renamed",
    "connection.configured",
    "connection.credential-set",
    "connection.credential-cleared",
    "connection.removed",
    "workspace.assignment.revoked",
  ])
    expect(affectedKeys("one", [{ name }], true)).toContain("workspace/one/connections");
});
