import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter } from "@solidjs/router";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal } from "solid-js";
import { Application } from "../src/application.tsx";
import { SignIn } from "../src/api/contracts.ts";
import { SessionProvider, useSession, type SessionScope } from "../src/session/provider.tsx";
import { createBrowserSessionStore, type SessionStore } from "../src/session/store.ts";
import { resolveApiBaseUrl } from "../src/configuration.ts";
import { paths, returnPath } from "../src/routing/paths.ts";

const session = (token: string) => Schema.decodeSync(SignIn.Session)({ token, identity: token });
function memoryStore(initial?: SignIn.Session) {
  let value = initial;
  const listeners = new Set<() => void>();
  const store: SessionStore = {
    read: () => value,
    write: (next) => {
      value = next;
    },
    subscribe: (changed) => {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
  };
  return {
    store,
    change: (next?: SignIn.Session) => {
      value = next;
      listeners.forEach((changed) => changed());
    },
  };
}
const deferred = <A,>() => Promise.withResolvers<A>();
const directory = { memberships: [], invitations: [] };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function mount(path: string, store: SessionStore, fetch: typeof globalThis.fetch) {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );
  render(() => (
    <Application
      router={(props) => <MemoryRouter {...props} history={history} />}
      apiBaseUrl="https://host.test"
      sessionStore={store}
      transport={transport}
    />
  ));
  return history;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("resolves endpoint configuration and rejects credentials and non-HTTP URLs", () => {
  expect(resolveApiBaseUrl("/api/", "https://web.test/path")).toBe("https://web.test/api");
  expect(resolveApiBaseUrl("http://127.0.0.1:8787/", "tauri://localhost")).toBe(
    "http://127.0.0.1:8787",
  );
  for (const value of [
    "",
    "javascript:alert(1)",
    "https://user:secret@host.test",
    "https://host.test?token=a",
    "https://host.test#fragment",
  ])
    expect(() => resolveApiBaseUrl(value, "https://web.test")).toThrow();
});
it("resumes only protected internal routes", () => {
  expect(returnPath("/workspaces/a?tab=members")).toBe("/workspaces/a?tab=members");
  for (const value of [
    undefined,
    "https://other.test",
    "//other.test",
    "/\\other.test",
    "/sign-in",
    "/workspaces/../sign-in",
    "/workspaces/a\n",
  ])
    expect(returnPath(value)).toBe(paths.workspaces);
  expect(paths.workspace("a/b")).toBe("/workspaces/a%2Fb");
});
it("isolates persisted credentials by endpoint and discards malformed sessions", () => {
  const first = createBrowserSessionStore("https://one.test");
  const second = createBrowserSessionStore("https://two.test");
  first.write(session("alice"));
  expect(first.read()).toEqual(session("alice"));
  expect(second.read()).toBeUndefined();
  localStorage.setItem("amends.session.v1:https://one.test", '{"token":"","identity":"alice"}');
  expect(first.read()).toBeUndefined();
  expect(localStorage.getItem("amends.session.v1:https://one.test")).toBeNull();
});
it("synchronizes matching local-storage changes and removes the listener on disposal", () => {
  const store = createBrowserSessionStore("https://one.test");
  const changed = vi.fn();
  const unsubscribe = store.subscribe(changed);
  const send = (key: string | null, storageArea: Storage) =>
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea }));
  send("amends.session.v1:https://two.test", localStorage);
  send("amends.session.v1:https://one.test", sessionStorage);
  expect(changed).not.toHaveBeenCalled();
  send("amends.session.v1:https://one.test", localStorage);
  send(null, localStorage);
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
  send(null, localStorage);
  expect(changed).toHaveBeenCalledTimes(2);
});
it("continues in memory when browser storage is blocked", () => {
  const store = createBrowserSessionStore("https://host.test");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(store.read()).toBeUndefined();
  function Consumer() {
    const current = useSession();
    return (
      <button onClick={() => current.replace(session("alice"))}>
        {current.session?.humanId ?? "anonymous"}
      </button>
    );
  }
  render(() => (
    <SessionProvider store={store}>
      <Consumer />
    </SessionProvider>
  ));
  fireEvent.click(screen.getByRole("button", { name: "anonymous" }));
  expect(screen.getByRole("button", { name: "alice" })).toBeInTheDocument();
});
it("remounts credential owners and ignores completions from obsolete or disposed scopes", () => {
  const fixture = memoryStore();
  const scopes: SessionScope[] = [];
  function Consumer() {
    const current = useSession();
    scopes.push(current);
    const [draft, setDraft] = createSignal("");
    return (
      <input
        aria-label="Draft"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
    );
  }
  const view = render(() => (
    <SessionProvider store={fixture.store}>
      <Consumer />
    </SessionProvider>
  ));
  const guest = scopes[0];
  if (!guest) throw new Error("Missing initial session scope");
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "private draft" } });
  guest.replace(session("alice"));
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(guest.isCurrent()).toBe(false);
  guest.replace(session("stale"));
  expect(fixture.store.read()?.token).toBe("alice");
  const current = scopes[1];
  if (!current) throw new Error("Missing new session scope");
  view.unmount();
  current.replace(session("disposed"));
  expect(fixture.store.read()?.token).toBe("alice");
});
it("redirects guests without making authenticated requests and retains the intended route", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const history = mount("/workspaces/one?tab=members", memoryStore().store, fetch);
  await screen.findByRole("heading", { name: "Sign in" });
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
  expect(fetch).not.toHaveBeenCalled();
});
it("validates a restored credential before mounting protected content and supports sign-out", async () => {
  const pending = deferred<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>(() => pending.promise);
  const fixture = memoryStore(session("alice"));
  const history = mount("/workspaces", fixture.store, fetch);
  expect(screen.getByRole("heading", { name: "Checking session" })).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const call = fetch.mock.calls[0];
  if (!call) throw new Error("Missing request");
  const [url, options] = call;
  expect(url instanceof Request ? url.url : url.toString()).toBe("https://host.test/me/workspaces");
  expect(new Headers(options?.headers).get("authorization")).toBe("Bearer alice");
  pending.resolve(response(directory));
  await screen.findByRole("heading", { name: "Workspaces" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(fixture.store.read()).toBeUndefined();
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces");
});
it("clears rejected credentials while preserving the intended route", async () => {
  const fixture = memoryStore(session("expired"));
  const history = mount("/workspaces/one", fixture.store, () =>
    Promise.resolve(response({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401)),
  );
  await screen.findByRole("heading", { name: "Sign in" });
  expect(fixture.store.read()).toBeUndefined();
  expect(history.get()).toContain("returnTo=%2Fworkspaces%2Fone");
});
it("preserves credentials on a temporary host failure and retries explicitly", async () => {
  const fixture = memoryStore(session("alice"));
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response(directory));
  mount("/workspaces", fixture.store, fetch);
  await screen.findByRole("heading", { name: "Unable to connect" });
  expect(fixture.store.read()?.token).toBe("alice");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Workspaces" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("denies unknown workspaces without treating membership loss as logout", async () => {
  const fixture = memoryStore(session("alice"));
  mount("/workspaces/missing", fixture.store, () => Promise.resolve(response(directory)));
  await screen.findByRole("heading", { name: "Workspace unavailable" });
  expect(fixture.store.read()?.token).toBe("alice");
});
it("aborts old requests on cross-window logout and never renders their late data", async () => {
  const fixture = memoryStore(session("alice"));
  const pending = deferred<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>(() => pending.promise);
  mount("/workspaces", fixture.store, fetch);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const signal = fetch.mock.calls[0]?.[1]?.signal;
  fixture.change();
  await screen.findByRole("heading", { name: "Sign in" });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  pending.resolve(response(directory));
  expect(screen.queryByRole("heading", { name: "Workspaces" })).not.toBeInTheDocument();
});
it("renders the not-found route without starting a session request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  mount("/missing", memoryStore().store, fetch);
  await screen.findByRole("heading", { name: "Page not found" });
  expect(fetch).not.toHaveBeenCalled();
});

const membership = (id: string, name: string, status = "active") => ({
  workspace: { id, name, createdBy: "alice", ownerMemberId: `owner-${id}` },
  member: { id: `owner-${id}`, workspaceId: id, identity: { _tag: "Human", id: "alice" }, status },
  people: 1,
});
it("resolves active workspace scope from the directory and updates it during navigation", async () => {
  const listing = {
    memberships: [
      membership("one", "First workspace"),
      membership("two", "Second workspace"),
      membership("removed", "Removed workspace", "removed"),
    ],
    invitations: [],
  };
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, () =>
    Promise.resolve(response(listing)),
  );
  await screen.findByRole("heading", { name: "First workspace" });
  history.set({ value: "/workspaces/two", scroll: false });
  await screen.findByRole("heading", { name: "Second workspace" });
  expect(screen.queryByRole("heading", { name: "First workspace" })).not.toBeInTheDocument();
  history.set({ value: "/workspaces/removed", scroll: false });
  await screen.findByRole("heading", { name: "Workspace unavailable" });
});
it("revalidates and replaces cached directory data when credentials change", async () => {
  const fixture = memoryStore(session("alice"));
  const pending = deferred<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      response({ memberships: [membership("one", "Alice workspace")], invitations: [] }),
    )
    .mockImplementationOnce(() => pending.promise);
  mount("/workspaces/one", fixture.store, fetch);
  await screen.findByRole("heading", { name: "Alice workspace" });
  fixture.change(session("bob"));
  expect(screen.queryByRole("heading", { name: "Alice workspace" })).not.toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer bob");
  pending.resolve(response(directory));
  await screen.findByRole("heading", { name: "Workspace unavailable" });
});
it("resumes a safe return path only after a stored session validates", async () => {
  const history = mount(
    "/sign-in?returnTo=%2Fworkspaces%2Fone",
    memoryStore(session("alice")).store,
    () =>
      Promise.resolve(
        response({ memberships: [membership("one", "First workspace")], invitations: [] }),
      ),
  );
  await screen.findByRole("heading", { name: "First workspace" });
  expect(history.get()).toBe("/workspaces/one");
});
