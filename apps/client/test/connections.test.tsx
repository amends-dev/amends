import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { Connection } from "../src/connections/api.ts";
import { FetchHttpClient } from "effect/http";
import {
  fieldIssue,
  fieldsOf,
  settingsComplete,
  settingsOf,
  textsOf,
} from "../src/connections/settings.ts";
import { affectedKeys } from "../src/live/api.ts";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useConnectionList,
  useConnections,
  type ConnectionsDone,
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
/** Integrations as the host sends them, each with its settings form. */
const search = {
  id: "search",
  name: "Search server",
  docs: "https://search.example.com/docs",
  auth: ["apiKey", "none"],
  provides: ["tools"],
  requiresSandbox: false,
  settings: {
    type: "object",
    properties: {
      url: { type: "string", title: "Server URL", description: "Where it answers.", minLength: 1 },
      retries: { type: "integer", title: "Retries", minimum: 0, maximum: 5 },
      verbose: { type: "boolean", title: "Verbose" },
      region: {
        type: "string",
        title: "Region",
        oneOf: [
          { const: "us", title: "United States" },
          { const: "eu", title: "Europe" },
        ],
      },
    },
    required: ["url"],
  },
};
const amends = {
  id: "amends",
  name: "amends",
  auth: ["none"],
  provides: ["harnesses"],
  requiresSandbox: false,
  settings: { type: "object", properties: {} },
};
interface Stored {
  id: string;
  name: string;
  integration: string;
  settings: Record<string, string | number | boolean>;
  auth: "apiKey" | "none";
}
const viewOf = (connection: Stored) => ({
  ...connection,
  readiness:
    connection.integration === "vertex"
      ? { _tag: "Uninstalled" }
      : connection.settings["region"] === "mars"
        ? { _tag: "Invalid", description: "Search server takes no region mars." }
        : { _tag: "Ready" },
  manageable: true,
  createdBy: "owner",
  createdAt: "2026-10-06T12:00:00.000Z",
});

function fixture() {
  const server = {
    connections: [
      {
        id: "docs",
        name: "Docs search",
        integration: "search",
        settings: { url: "https://docs.example.com/mcp", retries: 2, verbose: false },
        auth: "apiKey",
      },
      { id: "agent", name: "Agent", integration: "amends", settings: {}, auth: "none" },
      {
        id: "old",
        name: "Old models",
        integration: "vertex",
        settings: { project: "acme" },
        auth: "apiKey",
      },
    ] as Stored[],
    /** Answers to the next writes and checks, in order; then success. */
    answers: [] as Response[],
  };
  const writes: Array<{ method: string; path: string; key: string | null; body: unknown }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const base = "/workspaces/one/connections";
    if (path === "/me/workspaces")
      return json({ memberships: [{ workspace, member: owner, people: 1 }], invitations: [] });
    if (path === "/workspaces/one/members") return json([owner]);
    if (path === "/workspaces/one/permissions") return json(["connection.create"]);
    if (path === `${base}/integrations`) return json([search, amends]);
    if (path === base && request.method === "GET") return json(server.connections.map(viewOf));
    if (!path.startsWith(base)) return json({}, 404);
    const body =
      request.method === "DELETE" || path.endsWith("/check") ? undefined : await request.json();
    writes.push({
      method: request.method,
      path,
      key: request.headers.get("idempotency-key"),
      body,
    });
    const answer = server.answers.shift();
    if (answer) return answer;
    if (path === base) {
      const input = body as Omit<Stored, "id">;
      const created: Stored = {
        id: "created",
        name: input.name,
        integration: input.integration,
        settings: input.settings,
        auth: input.auth,
      };
      server.connections.push(created);
      return json(viewOf(created), 201);
    }
    const id = path.split("/")[4];
    const stored = server.connections.find((connection) => connection.id === id);
    if (!stored) return json({ _tag: "CoreError.NotFound", resource: "Connection", id }, 404);
    if (path.endsWith("/check")) return json({ status: "healthy" });
    if (path.endsWith("/rename")) stored.name = (body as { name: string }).name;
    if (path.endsWith("/settings"))
      stored.settings = (body as { settings: Stored["settings"] }).settings;
    if (request.method === "DELETE") {
      server.connections = server.connections.filter((connection) => connection !== stored);
      return new Response(null, { status: 204 });
    }
    return json(viewOf(stored));
  });
  const done: ConnectionsDone[] = [];
  let view!: ReturnType<typeof useConnections>;
  let list!: ReturnType<typeof useConnectionList>;
  function Consumer() {
    view = useConnections("one", { done: (entry) => done.push(entry) });
    list = useConnectionList("one");
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

describe("settings forms", () => {
  const form = Schema.decodeSync(Connection.IntegrationView.fields.settings)({
    type: "object",
    properties: {
      url: { type: "string", title: "Server URL", format: "uri", maxLength: 64 },
      plan: { type: "string", enum: ["free", "team"], enumNames: ["Free", "Team"] },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] } },
      temperature: { type: "number", minimum: 0, maximum: 2 },
      stream: { type: "boolean", description: "Stream responses." },
    },
    required: ["url", "stream"],
  });
  const fields = fieldsOf(form);

  it("asks for each setting in the form's order, leaving out lists settings never hold", () => {
    expect(fields).toEqual([
      {
        key: "url",
        label: "Server URL",
        required: true,
        kind: "text",
        format: "uri",
        maxLength: 64,
      },
      {
        key: "plan",
        label: "plan",
        required: false,
        kind: "choice",
        options: [
          { value: "free", label: "Free" },
          { value: "team", label: "Team" },
        ],
      },
      {
        key: "temperature",
        label: "temperature",
        required: false,
        kind: "number",
        integer: false,
        minimum: 0,
        maximum: 2,
      },
      {
        key: "stream",
        label: "stream",
        description: "Stream responses.",
        required: true,
        kind: "boolean",
      },
    ]);
  });

  it("says what each field refuses, and when the form is complete", () => {
    const [url, plan, temperature] = fields;
    expect(fieldIssue(url!, "")).toBeUndefined();
    expect(fieldIssue(url!, "not a url")).toBe("format");
    expect(fieldIssue(url!, `https://example.com/${"a".repeat(64)}`)).toBe("length");
    expect(fieldIssue(plan!, "enterprise")).toBe("format");
    expect(fieldIssue(temperature!, "warm")).toBe("format");
    expect(fieldIssue(temperature!, "3")).toBe("range");
    expect(fieldIssue(temperature!, "0.7")).toBeUndefined();
    expect(settingsComplete(fields, { url: "https://example.com" })).toBe(false);
    expect(settingsComplete(fields, { url: "https://example.com", stream: "true" })).toBe(true);
  });

  it("turns the fields' text into settings and back, leaving out empty ones", () => {
    const settings = settingsOf(fields, {
      url: " https://example.com ",
      plan: "",
      temperature: "0.5",
      stream: "false",
      unknown: "dropped",
    });
    expect(settings).toEqual({ url: "https://example.com", temperature: 0.5, stream: false });
    expect(textsOf(settings)).toEqual({
      url: "https://example.com",
      temperature: "0.5",
      stream: "false",
    });
  });
});

it("refreshes connections on their facts and on access changes, but not on a key replaced", () => {
  const keys = (name: string) => affectedKeys("one", [{ name }]);
  expect(keys("connection.created")).toContain("workspace/one/connections");
  expect(keys("connection.removed")).toContain("workspace/one/connections");
  expect(keys("workspace.assignment.created")).toContain("workspace/one/connections");
  expect(keys("connection.key-replaced")).not.toContain("workspace/one/connections");
});

it("shapes connections with their integrations' fields, readiness, and who created them", async () => {
  const f = fixture();
  expect(f.view.status()).toBe("loading");
  await waitFor(() => expect(f.view.connections()).toHaveLength(3));
  expect(f.view.status()).toBeUndefined();
  expect(
    f.view.integrations().map((integration) => integration.fields.map((field) => field.key)),
  ).toEqual([["url", "retries", "verbose", "region"], []]);
  expect(f.view.connection("docs")).toMatchObject({
    integration: {
      name: "Search server",
      docs: "https://search.example.com/docs",
      provides: ["tools"],
    },
    settings: { url: "https://docs.example.com/mcp", retries: "2", verbose: "false" },
    auth: "apiKey",
    readiness: { state: "ready" },
  });
  // An integration this host no longer installs keeps its connection, which only lists what it saved.
  expect(f.view.connection("old")).toMatchObject({
    integration: undefined,
    fields: [],
    settings: { project: "acme" },
    readiness: { state: "uninstalled" },
  });
  await waitFor(() => expect(f.view.connection("docs")?.createdBy).toBe("Alice"));
  await waitFor(() => expect(f.list.canCreate()).toBe(true));
  expect(f.list.connections().map((entry) => [entry.name, entry.provides])).toEqual([
    ["Docs search", ["tools"]],
    ["Agent", ["harnesses"]],
    ["Old models", []],
  ]);
});

it("creates a connection with its key in one request, retrying with the same request key, then checks it", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.integrations()).toHaveLength(2));
  f.view.create.begin("search");
  expect(f.view.create.name()).toBe("Search server");
  expect(f.view.create.auth()).toBe("apiKey");
  f.view.create.setName(" Web search ");
  f.view.create.setValue("url", "https://web.example.com/mcp");
  f.view.create.setValue("retries", "9");
  expect(f.view.create.issue("retries")).toBe("range");
  f.view.create.setValue("retries", "3");
  f.view.create.setValue("verbose", "true");
  expect(f.view.create.ready()).toBe(false);
  f.view.create.setApiKey(" sk-web ");
  expect(f.view.create.ready()).toBe(true);
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "create", error: "failed" }));
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.done[0]).toEqual({ action: "create", subject: "Web search", created: "created" });
  expect(f.writes.slice(0, 2).map((write) => write.key)).toEqual([
    f.writes[0]?.key,
    f.writes[0]?.key,
  ]);
  expect(f.writes[1]?.body).toEqual({
    integration: "search",
    name: "Web search",
    settings: { url: "https://web.example.com/mcp", retries: 3, verbose: true },
    auth: "apiKey",
    apiKey: "sk-web",
  });
  expect(f.view.create.integration()).toBeUndefined();
  expect(f.view.create.apiKey()).toBe("");
  // Creating it checks it.
  await waitFor(() => expect(f.view.check.health("created")).toEqual({ status: "healthy" }));
  expect(f.writes[2]).toMatchObject({
    method: "POST",
    path: "/workspaces/one/connections/created/check",
  });
});

it("starts a new request when the key changes after a failed attempt", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.integrations()).toHaveLength(2));
  f.view.create.begin("search");
  f.view.create.setValue("url", "https://web.example.com/mcp");
  f.view.create.setApiKey("sk-one");
  f.server.answers.push(new Response("Host unavailable", { status: 503 }));
  f.view.create.save();
  await waitFor(() => expect(f.view.failure()?.error).toBe("failed"));
  f.view.create.setApiKey("sk-two");
  f.view.create.save();
  await waitFor(() => expect(f.done).toHaveLength(1));
  expect(f.writes[1]?.key).not.toBe(f.writes[0]?.key);
});

it("says what the integration refused, and tells a host without key storage apart", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.integrations()).toHaveLength(2));
  f.view.create.begin("search");
  f.view.create.setValue("url", "https://web.example.com/mcp");
  f.view.create.setApiKey("sk-web");
  f.server.answers.push(
    json(
      {
        _tag: "ConnectionService.InvalidConnection",
        description: "Search server takes no retries.",
      },
      422,
    ),
  );
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({
      action: "create",
      error: "refused",
      description: "Search server takes no retries.",
    }),
  );
  f.server.answers.push(
    json({ _tag: "ConnectionService.CredentialsUnavailable", reason: "No credential key" }, 503),
  );
  f.view.create.save();
  await waitFor(() =>
    expect(f.view.failure()).toEqual({ action: "create", error: "storage-unavailable" }),
  );
  expect(f.view.stale()).toBe(false);
  expect(f.view.create.apiKey()).toBe("sk-web");
  f.view.create.cancel();
  expect(f.view.create.apiKey()).toBe("");
});

it("saves settings as their fields give them, and replaces a key", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connection("docs")).toBeDefined());
  expect(f.view.configure.value("docs", "retries")).toBe("2");
  f.view.configure.setValue("docs", "retries", "2");
  expect(f.view.configure.changed("docs")).toBe(false);
  f.view.configure.setValue("docs", "retries", "4");
  f.view.configure.setValue("docs", "region", "eu");
  expect(f.view.configure.changed("docs")).toBe(true);
  f.view.configure.save("docs");
  await waitFor(() => expect(f.done).toEqual([{ action: "configure", subject: "Docs search" }]));
  expect(f.writes[0]?.body).toEqual({
    settings: { url: "https://docs.example.com/mcp", retries: 4, verbose: false, region: "eu" },
  });
  expect(f.view.connection("docs")?.settings["region"]).toBe("eu");
  f.view.key.setApiKey("sk-new");
  f.view.key.save("docs");
  await waitFor(() => expect(f.done).toHaveLength(2));
  expect(f.writes[1]).toMatchObject({
    method: "PUT",
    path: "/workspaces/one/connections/docs/key",
    body: { apiKey: "sk-new" },
  });
  expect(f.view.key.apiKey()).toBe("");
});

it("keeps why a check could not run with the connection it checked", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connection("docs")).toBeDefined());
  f.server.answers.push(
    json({ _tag: "ConnectionService.InvalidConnection", description: "No URL." }, 422),
  );
  f.view.check.run("docs");
  expect(f.view.pending()).toBe("check");
  expect(f.view.check.running("docs")).toBe(true);
  await waitFor(() =>
    expect(f.view.check.failure("docs")).toEqual({
      action: "check",
      error: "refused",
      description: "No URL.",
    }),
  );
  expect(f.view.check.failure("agent")).toBeUndefined();
  expect(f.view.pending()).toBeUndefined();
  f.view.check.run("docs");
  await waitFor(() => expect(f.view.check.health("docs")).toEqual({ status: "healthy" }));
  expect(f.view.check.failure("docs")).toBeUndefined();
});

it("keeps a rename draft through a conflict and saves it against the name reviewed", async () => {
  const f = fixture();
  await waitFor(() => expect(f.view.connection("docs")).toBeDefined());
  f.view.rename.setName("docs", "Team search");
  f.server.connections[0]!.name = "Docs";
  f.server.answers.push(json({ _tag: "ConnectionService.Changed", connectionId: "docs" }, 409));
  f.view.rename.save("docs");
  await waitFor(() => expect(f.view.failure()).toEqual({ action: "rename", error: "changed" }));
  expect(f.view.stale()).toBe(true);
  f.view.refresh();
  await waitFor(() => expect(f.view.stale()).toBe(false));
  expect(f.view.rename.name("docs")).toBe("Team search");
  f.view.rename.save("docs");
  await waitFor(() => expect(f.done).toEqual([{ action: "rename", subject: "Team search" }]));
  expect(f.writes[1]?.body).toEqual({ name: "Team search", expectedName: "Docs" });
});
