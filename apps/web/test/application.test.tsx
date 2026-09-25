import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter } from "@solidjs/router";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Application } from "../src/application.tsx";
import { ApplicationRoutes } from "../src/routes.tsx";
import { Session, type SessionStore } from "@amends/client";

const session = (token: string) => Schema.decodeSync(Session)({ token, identity: token });
function memoryStore(initial?: Session) {
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
    change: (next?: Session) => {
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
    <Application apiBaseUrl="https://host.test" sessionStore={store} transport={transport}>
      <MemoryRouter history={history}>
        <ApplicationRoutes />
      </MemoryRouter>
    </Application>
  ));
  return history;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("redirects guests without making authenticated requests and retains the intended route", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const history = mount("/workspaces/one?tab=members", memoryStore().store, fetch);
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
  expect(screen.getByRole("main")).toHaveFocus();
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
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
  await screen.findByRole("heading", { name: "Where are you working?" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(fixture.store.read()).toBeUndefined();
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces");
});
it("clears rejected credentials while preserving the intended route", async () => {
  const fixture = memoryStore(session("expired"));
  const history = mount("/workspaces/one", fixture.store, () =>
    Promise.resolve(response({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401)),
  );
  await screen.findByRole("heading", { name: "Sign in to amends" });
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
  await screen.findByRole("heading", { name: "Where are you working?" });
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
  await screen.findByRole("heading", { name: "Sign in to amends" });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  pending.resolve(response(directory));
  expect(screen.queryByRole("heading", { name: "Where are you working?" })).not.toBeInTheDocument();
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

async function submitEmail() {
  fireEvent.input(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "jo@mercier.co" },
  });
  fireEvent.submit(screen.getByRole("form"));
  return screen.findByRole("textbox", { name: "Six-digit code" });
}
it("signs in through the composed page and validates before resuming the intended route", async () => {
  const checked = deferred<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(response({ token: "jo@mercier.co", identity: "jo@mercier.co" }))
    .mockImplementation(() => checked.promise);
  const fixture = memoryStore();
  const history = mount("/workspaces/one?tab=members", fixture.store, fetch);
  const code = await submitEmail();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(code).toHaveFocus();
  expect(code).toHaveAccessibleDescription(
    "Find your code in the terminal running the local host.",
  );
  fireEvent.input(code, { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Checking session" });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(history.get()).toContain("/sign-in?returnTo=");
  expect(fixture.store.read()?.token).toBe("jo@mercier.co");
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("authorization")).toBe(
    "Bearer jo@mercier.co",
  );
  checked.resolve(
    response({ memberships: [membership("one", "First workspace")], invitations: [] }),
  );
  await screen.findByRole("heading", { name: "First workspace" });
  expect(history.get()).toBe("/workspaces/one?tab=members");
});
it("ignores an external return destination after signing in", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(response({ token: "jo@mercier.co", identity: "jo@mercier.co" }))
    .mockResolvedValue(response(directory));
  const history = mount(
    "/sign-in?returnTo=https%3A%2F%2Fother.invalid",
    memoryStore().store,
    fetch,
  );
  fireEvent.input(await submitEmail(), { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Where are you working?" });
  expect(history.get()).toBe("/workspaces");
});
it("disposes sign-in when navigation leaves the page, even if verification resolves later", async () => {
  const pending = deferred<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockImplementationOnce(() => pending.promise);
  const fixture = memoryStore();
  const history = mount("/sign-in", fixture.store, fetch);
  fireEvent.input(await submitEmail(), { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  const signal = fetch.mock.calls[1]?.[1]?.signal;
  history.set({ value: "/missing", scroll: false });
  await screen.findByRole("heading", { name: "Page not found" });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  pending.resolve(response({ token: "jo@mercier.co", identity: "jo@mercier.co" }));
  await pending.promise;
  expect(fixture.store.read()).toBeUndefined();
  expect(history.get()).toBe("/missing");
});

it("lists only active workspaces and links creation to the app-owned page", async () => {
  const history = mount("/workspaces", memoryStore(session("alice")).store, () =>
    Promise.resolve(
      response({
        memberships: [membership("one", "Studio"), membership("old", "Former studio", "removed")],
        invitations: [],
      }),
    ),
  );
  const link = await screen.findByRole("link", { name: "Studio 1 member · Owner" });
  expect(link).toHaveAttribute("href", "/workspaces/one");
  expect(screen.queryByRole("link", { name: /Former studio/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: /New workspace/ }));
  await screen.findByRole("heading", { name: "Name your workspace" });
  expect(history.get()).toBe("/workspaces/new");
});
it("retains a created workspace through directory failure and navigates after refresh recovery", async () => {
  const created = membership("one", "Studio");
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response(directory))
    .mockResolvedValueOnce(response(created.workspace, 201))
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response({ memberships: [created], invitations: [] }));
  const history = mount("/workspaces/new", memoryStore(session("alice")).store, fetch);
  const input = await screen.findByRole("textbox", { name: "Workspace name" });
  fireEvent.input(input, { target: { value: "Studio" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText(/Your workspace was created, but/);
  expect(history.get()).toBe("/workspaces/new");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Studio" });
  expect(history.get()).toBe("/workspaces/one");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("keeps the sidebar and account trigger mounted across workspace pages and switches", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(
      response({
        memberships: [membership("one", "Studio"), membership("two", "Other studio")],
        invitations: [],
      }),
    ),
  );
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, fetch);
  await screen.findByRole("heading", { name: "Home" });
  const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
  const trigger = screen.getByRole("button", { name: "Your account: alice" });
  fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
  fireEvent.click(screen.getByRole("link", { name: "Tasks" }));
  await screen.findByRole("heading", { name: "Tasks" });
  expect(history.get()).toBe("/workspaces/one/tasks");
  expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toBe(sidebar);
  expect(screen.getByRole("button", { name: "Your account: alice" })).toBe(trigger);
  expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  history.set({ value: "/workspaces/two/settings", scroll: false });
  await screen.findByRole("heading", { name: "Settings" });
  expect(sidebar).toHaveTextContent("Other studio");
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/workspaces/two");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves a nested destination through sign-in and denies unavailable workspace children", async () => {
  const fixture = memoryStore();
  const history = mount("/workspaces/one/tasks?filter=mine", fixture.store, () =>
    Promise.resolve(response(directory)),
  );
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces%2Fone%2Ftasks%3Ffilter%3Dmine");
  fixture.change(session("alice"));
  await screen.findByRole("heading", { name: "Workspace unavailable" });
  expect(
    screen.queryByRole("complementary", { name: "Workspace sidebar" }),
  ).not.toBeInTheDocument();
  expect(history.get()).toBe("/workspaces/one/tasks?filter=mine");
});
