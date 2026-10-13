import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { Schema } from "effect";
import { createSignal } from "solid-js";
import { SignIn } from "../src/api/contracts.ts";
import { ClientProvider, useSession, type SessionScope } from "../src/provider.tsx";
import { createBrowserSessionStore, type SessionStore } from "../src/session/store.ts";
import { resolveApiBaseUrl } from "../src/configuration.ts";
import { paths, returnPath } from "../src/routing/paths.ts";

const session = (token: string) =>
  Schema.decodeSync(SignIn.Session)({
    token,
    account: { id: token, email: `${token}@example.com` },
  });
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
  expect(returnPath(paths.groups("a"))).toBe("/workspaces/a/groups");
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
      <button onClick={() => current.signIn(session("alice"))}>
        {current.session?.account.id ?? "anonymous"}
      </button>
    );
  }
  render(() => (
    <ClientProvider apiBaseUrl="https://host.test" sessionStore={store}>
      <Consumer />
    </ClientProvider>
  ));
  fireEvent.click(screen.getByRole("button", { name: "anonymous" }));
  expect(screen.getByRole("button", { name: "alice" })).toBeInTheDocument();
});
it("remounts credential owners and ignores completions from obsolete or disposed scopes", () => {
  const fixture = memoryStore();
  const scopes: Array<SessionScope> = [];
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
    <ClientProvider apiBaseUrl="https://host.test" sessionStore={fixture.store}>
      <Consumer />
    </ClientProvider>
  ));
  const guest = scopes[0];
  if (!guest) throw new Error("Missing initial session scope");
  fireEvent.input(screen.getByRole("textbox"), { target: { value: "private draft" } });
  guest.signIn(session("alice"));
  expect(screen.getByRole("textbox")).toHaveValue("");
  guest.signIn(session("stale"));
  expect(fixture.store.read()?.token).toBe("alice");
  const current = scopes[1];
  if (!current) throw new Error("Missing new session scope");
  view.unmount();
  current.signIn(session("disposed"));
  expect(fixture.store.read()?.token).toBe("alice");
});

it("keeps only known nested workspace destinations in sign-in return paths", () => {
  expect(returnPath("/workspaces/one/tasks?filter=mine#work")).toBe(
    "/workspaces/one/tasks?filter=mine#work",
  );
  expect(returnPath("/workspaces/one/inbox")).toBe("/workspaces/one/inbox");
  expect(returnPath("/workspaces/one/inbox/groups/g/threads/t")).toBe(
    paths.inboxThread("one", "g", "t"),
  );
  expect(returnPath("/workspaces/one/inbox/groups/g")).toBe(paths.workspaces);
  expect(returnPath(paths.directDraft("one", ["a", "b c"]))).toBe(
    "/workspaces/one/direct?to=a,b%20c",
  );
  expect(returnPath(paths.agent("one", "a1"))).toBe("/workspaces/one/agents/a1");
  expect(returnPath(paths.connection("one", "c1"))).toBe("/workspaces/one/connections/c1");
  expect(returnPath("/workspaces/one/agents/a1/unknown")).toBe(paths.workspaces);
  expect(returnPath("/workspaces/one/unknown")).toBe(paths.workspaces);
  expect(returnPath("/workspaces/one/tasks/../../../sign-in")).toBe(paths.workspaces);
  expect(paths.workspacePage("a/b", "triage")).toBe("/workspaces/a%2Fb/triage");
});
