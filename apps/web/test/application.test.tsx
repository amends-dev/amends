import { afterEach, expect, it, vi } from "@effect/vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter } from "@solidjs/router";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Application } from "../src/application.tsx";
import { ApplicationRoutes } from "../src/routes.tsx";
import { Session, type SessionStore } from "@amends-dev/client";
import { committed, notificationsSeen, withChangeFeed, type Sidebar } from "./change-feed.ts";

const session = (token: string) =>
  Schema.decodeSync(Session)({ token, account: { id: token, email: `${token}@example.com` } });
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
let feed: ReturnType<typeof withChangeFeed>;
/** Change-feed requests reach controllable streams; `fetch` sees every other request. */
function mount(
  path: string,
  store: SessionStore,
  fetch: typeof globalThis.fetch,
  open?: (request: Request) => Response | undefined,
  sidebar?: Sidebar,
) {
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });
  feed = withChangeFeed(fetch, open, sidebar);
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, feed.fetch)),
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
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
});
it("validates a restored credential before mounting protected content and supports sign-out", async () => {
  const pending = deferred<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>(() => pending.promise);
  const fixture = memoryStore(session("alice"));
  const history = mount("/workspaces", fixture.store, fetch);
  expect(screen.getByRole("heading", { name: "Checking your session" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Connecting to your workspace host…");
  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const call = fetch.mock.calls[0];
  if (!call) throw new Error("Missing request");
  const [url, options] = call;
  expect(url instanceof Request ? url.url : url.toString()).toBe("https://host.test/me/workspaces");
  expect(new Headers(options?.headers).get("authorization")).toBe("Bearer alice");
  pending.resolve(response(directory));
  await screen.findByRole("heading", { name: "Choose a workspace" });
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(fixture.store.read()).toBeUndefined();
  // Whoever signs in next starts afresh.
  expect(history.get()).toBe("/sign-in");
});
it("signing out in another window leaves no way back to this page for the next person", async () => {
  const fixture = memoryStore(session("alice"));
  const history = mount("/workspaces/one/triage", fixture.store, () =>
    Promise.resolve(
      response({ memberships: [membership("one", "Alice workspace")], invitations: [] }),
    ),
  );
  await screen.findByRole("heading", { name: "Triage" });
  fixture.change(undefined);
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(history.get()).toBe("/sign-in");
});
it("clears rejected credentials while preserving the intended route", async () => {
  const fixture = memoryStore(session("expired"));
  const history = mount("/workspaces/one", fixture.store, () =>
    Promise.resolve(
      response({ _tag: "Authentication.Unauthorized", message: "Unauthorized" }, 401),
    ),
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
  await screen.findByRole("heading", { name: "Can’t reach your workspace host" });
  expect(fixture.store.read()?.token).toBe("alice");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Choose a workspace" });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("denies unknown workspaces without treating membership loss as logout", async () => {
  const fixture = memoryStore(session("alice"));
  mount("/workspaces/missing", fixture.store, () => Promise.resolve(response(directory)));
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
  expect(fixture.store.read()?.token).toBe("alice");
  expect(
    screen.getByText(
      "This workspace doesn’t exist, or it hasn’t been shared with alice@example.com.",
    ),
  ).toBeInTheDocument();
  // The same account header as the picker, and a way back to it.
  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Your workspaces" }));
  await screen.findByRole("heading", { name: "Choose a workspace" });
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
  expect(screen.queryByRole("heading", { name: "Choose a workspace" })).not.toBeInTheDocument();
});
it("renders the not-found route without starting a session request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const history = mount("/missing", memoryStore().store, fetch);
  await screen.findByRole("heading", { name: "Nothing at this address" });
  expect(fetch).not.toHaveBeenCalled();
  // Guests get no account controls, and a way to sign in.
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(history.get()).toBe("/sign-in");
});
it("offers a signed-in reader their workspaces from an unknown address", async () => {
  const history = mount("/nowhere", memoryStore(session("alice")).store, () =>
    Promise.resolve(response(directory)),
  );
  await screen.findByRole("heading", { name: "Nothing at this address" });
  expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Your workspaces" }));
  await screen.findByRole("heading", { name: "Choose a workspace" });
  expect(history.get()).toBe("/workspaces");
});
it("keeps an unknown workspace page inside the workspace, with a way back home", async () => {
  const history = mount("/workspaces/one/nope", memoryStore(session("alice")).store, () =>
    Promise.resolve(response({ memberships: [membership("one", "Studio")], invitations: [] })),
  );
  await screen.findByRole("heading", { name: "Nothing on this page" });
  expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Go to Inbox" }));
  await screen.findByRole("heading", { name: "Inbox" });
  expect(history.get()).toBe("/workspaces/one/inbox");
});
it("replaces a crashed view with a reload, without account controls", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const reload = vi.fn();
  // The fallback only reloads, so the stand-in location needs nothing else.
  vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location);
  function Broken(): never {
    throw new Error("Unexpected view failure");
  }
  render(() => (
    <Application apiBaseUrl="https://host.test" sessionStore={memoryStore(session("alice")).store}>
      <Broken />
    </Application>
  ));
  await screen.findByRole("heading", { name: "Something went wrong" });
  expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(reload).toHaveBeenCalledTimes(1);
});

const membership = (id: string, name: string, status = "active") => ({
  workspace: { id, name, createdBy: "alice", ownerMemberId: `owner-${id}` },
  member: {
    id: `owner-${id}`,
    workspaceId: id,
    identity: { _tag: "Human", id: "alice" },
    name: "alice",
    status,
  },
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
  await screen.findByRole("heading", { name: "Inbox" });
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent(
    "First workspace",
  );
  history.set({ value: "/workspaces/two", scroll: false });
  await screen.findByText("Second workspace");
  expect(screen.queryByText("First workspace")).not.toBeInTheDocument();
  history.set({ value: "/workspaces/removed", scroll: false });
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
  expect(screen.getByText(/Your membership of Removed workspace has ended/)).toBeInTheDocument();
  expect(screen.getByText("Rejoining needs a fresh invitation.")).toBeInTheDocument();
});
it("revalidates and replaces cached directory data when credentials change", async () => {
  const fixture = memoryStore(session("alice"));
  const pending = deferred<Response>();
  const directoryReads = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      response({ memberships: [membership("one", "Alice workspace")], invitations: [] }),
    )
    .mockImplementationOnce(() => pending.promise);
  // The workspace's own reads, such as its agents and inbox, wait; only the directory answers.
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) =>
    new URL(new Request(input, init).url).pathname === "/me/workspaces"
      ? directoryReads(input, init)
      : new Promise<Response>(() => {}),
  );
  mount("/workspaces/one", fixture.store, fetch);
  // The sidebar's workspace switcher names it; the Inbox's header repeats it for phones.
  await within(await screen.findByRole("navigation", { name: "Workspace" })).findByText(
    "Alice workspace",
  );
  fixture.change(session("bob"));
  expect(screen.queryByText("Alice workspace")).not.toBeInTheDocument();
  await waitFor(() => expect(directoryReads).toHaveBeenCalledTimes(2));
  expect(new Headers(directoryReads.mock.calls[1]?.[1]?.headers).get("authorization")).toBe(
    "Bearer bob",
  );
  pending.resolve(response(directory));
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
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
  await screen.findByRole("heading", { name: "Inbox" });
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent(
    "First workspace",
  );
  expect(history.get()).toBe("/workspaces/one/inbox");
});

async function submitEmail() {
  fireEvent.input(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "jo@mercier.co" },
  });
  fireEvent.submit(screen.getByRole("form"));
  return screen.findByRole("textbox", { name: "Verification code" });
}
it("signs in through the composed page and validates before resuming the intended route", async () => {
  const checked = deferred<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(
      response({
        token: "jo@mercier.co",
        account: { id: "jo@mercier.co", email: "jo@mercier.co" },
      }),
    )
    .mockImplementation(() => checked.promise);
  const fixture = memoryStore();
  const history = mount("/workspaces/one/tasks?filter=mine", fixture.store, fetch);
  const code = await submitEmail();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(code).toHaveFocus();
  expect(code).toHaveAccessibleDescription(
    "Find your code in the terminal running the local host.",
  );
  fireEvent.input(code, { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Checking your session" });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(history.get()).toContain("/sign-in?returnTo=");
  expect(fixture.store.read()?.token).toBe("jo@mercier.co");
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("authorization")).toBe(
    "Bearer jo@mercier.co",
  );
  checked.resolve(
    response({ memberships: [membership("one", "First workspace")], invitations: [] }),
  );
  await screen.findByRole("heading", { name: "Tasks" });
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent(
    "First workspace",
  );
  expect(history.get()).toBe("/workspaces/one/tasks?filter=mine");
});
it("ignores an external return destination after signing in", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(
      response({
        token: "jo@mercier.co",
        account: { id: "jo@mercier.co", email: "jo@mercier.co" },
      }),
    )
    .mockResolvedValue(response(directory));
  const history = mount(
    "/sign-in?returnTo=https%3A%2F%2Fother.invalid",
    memoryStore().store,
    fetch,
  );
  fireEvent.input(await submitEmail(), { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Choose a workspace" });
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
  await screen.findByRole("heading", { name: "Nothing at this address" });
  await waitFor(() => expect(signal?.aborted).toBe(true));
  pending.resolve(
    response({ token: "jo@mercier.co", account: { id: "jo@mercier.co", email: "jo@mercier.co" } }),
  );
  await pending.promise;
  expect(fixture.store.read()).toBeUndefined();
  expect(history.get()).toBe("/missing");
});

it("lists only active workspaces and opens creation at its own address", async () => {
  const history = mount("/workspaces", memoryStore(session("alice")).store, () =>
    Promise.resolve(
      response({
        memberships: [membership("one", "Studio"), membership("old", "Former studio", "removed")],
        invitations: [],
      }),
    ),
  );
  const link = await screen.findByRole("link", { name: "Studio" });
  expect(link).toHaveAttribute("href", "/workspaces/one");
  expect(screen.getByText("1 member · Owner")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Former studio/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
  const dialog = await screen.findByRole("dialog", { name: "Create workspace" });
  expect(within(dialog).getByRole("textbox", { name: "Your name" })).toHaveValue("Alice");
  expect(history.get()).toBe("/workspaces/new");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(history.get()).toBe("/workspaces");
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
  const dialog = await screen.findByRole("dialog", { name: "Create workspace" });
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Workspace name" }), {
    target: { value: "Studio" },
  });
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Your name" }), {
    target: { value: "Alice" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create workspace" }));
  await within(dialog).findByText(/Your workspace was created, but/);
  expect(history.get()).toBe("/workspaces/new");
  fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Inbox" });
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent("Studio");
  expect(history.get()).toBe("/workspaces/one/inbox");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("keeps the sidebar and account trigger mounted across workspace pages, and rebuilds them for another workspace", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    const entry = membership("two", "Other studio");
    if (path.endsWith("/settings"))
      return Promise.resolve(
        response({
          workspace: entry.workspace,
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: [],
        }),
      );
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        response({
          workspace: entry.workspace,
          owner: entry.member,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: [],
        }),
      );
    return Promise.resolve(
      response({
        memberships: [membership("one", "Studio"), membership("two", "Other studio")],
        invitations: [],
      }),
    );
  });
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, fetch);
  await screen.findByRole("heading", { name: "Inbox" });
  const sidebar = screen.getByRole("navigation", { name: "Workspace" });
  const trigger = screen.getByRole("button", { name: "Account: alice" });
  fireEvent.click(screen.getByRole("link", { name: "Tasks" }));
  await screen.findByRole("heading", { name: "Tasks" });
  expect(history.get()).toBe("/workspaces/one/tasks");
  expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
  // Tasks is part of Home, the rail's destination.
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("navigation", { name: "Workspace" })).toBe(sidebar);
  expect(screen.getByRole("button", { name: "Account: alice" })).toBe(trigger);
  for (const page of ["Triage", "Connections"] as const) {
    fireEvent.click(screen.getByRole("link", { name: page }));
    await screen.findByRole("heading", { name: page });
  }
  expect(screen.getByRole("link", { name: "Connections" })).toHaveAttribute("aria-current", "true");
  history.set({ value: "/workspaces/two/settings", scroll: false });
  await screen.findByRole("heading", { name: "Workspace" });
  // Another workspace gets its own shell, reading its own groups and names.
  expect(screen.getByRole("navigation", { name: "Workspace" })).toHaveTextContent("Other studio");
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/workspaces/two");
  await screen.findByRole("textbox", { name: "Workspace name" });
  // The directory; each workspace's agents, whose status the layout shows; the first
  // workspace's Inbox, where it lands, read as unread and as all; its connections and the
  // integrations they name; then the second workspace's settings and ownership. The feed stays
  // separate.
  expect(fetch).toHaveBeenCalledTimes(9);
  expect(
    feed.streams.map(({ request }) => [
      new URL(request.url).pathname,
      request.headers.get("amends-workspace"),
    ]),
  ).toEqual([
    ["/changes", "one"],
    ["/changes", "two"],
  ]);
  await waitFor(() => expect(feed.streams[0]?.request.signal.aborted).toBe(true));
});
it("preserves a nested destination through sign-in and denies unavailable workspace children", async () => {
  const fixture = memoryStore();
  const history = mount("/workspaces/one/tasks?filter=mine", fixture.store, () =>
    Promise.resolve(response(directory)),
  );
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(history.get()).toBe("/sign-in?returnTo=%2Fworkspaces%2Fone%2Ftasks%3Ffilter%3Dmine");
  fixture.change(session("alice"));
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
  expect(screen.queryByRole("navigation", { name: "Workspace" })).not.toBeInTheDocument();
  expect(history.get()).toBe("/workspaces/one/tasks?filter=mine");
});

it("redirects the Settings entry to its workspace section and keeps the rail's selection on descendants", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
  const member = {
    id: "owner",
    workspaceId: "one",
    identity: { _tag: "Human", id: "alice" },
    name: "alice",
    status: "active",
  };
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    if (path.endsWith("/settings"))
      return Promise.resolve(
        response({
          workspace,
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: [],
        }),
      );
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        response({
          workspace,
          owner: member,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: [],
        }),
      );
    return Promise.resolve(
      response({ memberships: [{ workspace, member, people: 1 }], invitations: [] }),
    );
  });
  const history = mount("/workspaces/one/settings", memoryStore(session("alice")).store, fetch);
  await screen.findByRole("textbox", { name: "Workspace name" });
  expect(history.get()).toBe("/workspaces/one/settings/workspace");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "true");
  // Settings lists its sections in the sidebar.
  const tabs = () => within(screen.getByRole("navigation", { name: "Workspace" }));
  expect(tabs().getByRole("link", { name: "Workspace" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(tabs().getByRole("link", { name: /Members/ }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/settings/members"));
  expect(tabs().getByRole("link", { name: /Members/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "true");
});

it("invites someone and removes a member from the Members tab, confirming each with a toast", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
  const owner = {
    id: "owner",
    workspaceId: "one",
    identity: { _tag: "Human", id: "alice" },
    name: "Alice",
    status: "active",
  };
  const ada = {
    ...owner,
    id: "ada",
    identity: { _tag: "Human", id: "human-ada" },
    name: "Ada",
  };
  const roles = [
    {
      role: { id: "builtin:member", workspaceId: "one", name: "Member", permissions: [] },
      assignable: true,
    },
    {
      role: { id: "builtin:owner", workspaceId: "one", name: "Owner", permissions: [] },
      assignable: false,
    },
  ];
  const access = (memberId: string, roleId: string) => ({
    assignments: [
      {
        id: `a-${memberId}`,
        workspaceId: "one",
        memberId,
        source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId: "one" } },
        status: "active",
      },
    ],
    roles,
    canManage: true,
  });
  let adaStatus = "active";
  const invitations: Array<unknown> = [];
  const accounts = [
    { id: "alice", email: "alice@example.com" },
    { id: "human-ada", email: "ada@example.test" },
  ];
  const requests: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method !== "GET") requests.push(`${request.method} ${path}`);
    if (path === "/me/workspaces")
      return response({ memberships: [{ workspace, member: owner, people: 2 }], invitations: [] });
    if (path === "/settings")
      return response({
        workspace,
        canRename: true,
        canReadInvitations: true,
        canInvite: true,
        roles,
      });
    if (path === "/settings/ownership")
      return response({
        workspace,
        owner,
        ownerAssignmentId: "a-owner",
        canTransfer: true,
        candidates: [ada],
      });
    if (path === "/settings/members")
      return response([
        { member: owner, access: access("owner", "builtin:owner"), canRemove: false },
        {
          member: { ...ada, status: adaStatus },
          access: access("ada", "builtin:member"),
          canRemove: true,
        },
      ]);
    if (path === "/members") return response([owner, { ...ada, status: adaStatus }]);
    if (path === "/members/ada" && request.method === "DELETE") {
      adaStatus = "removed";
      return response({ ...ada, status: "removed" });
    }
    if (path === "/invitations" && request.method === "POST") {
      const body = (await request.json()) as Record<string, string>;
      const recipient = { id: "account-new", email: body.email ?? "" };
      accounts.push(recipient);
      const created = {
        details: {
          id: "invitation-one",
          workspaceId: "one",
          recipientId: recipient.id,
          roleId: body.roleId,
          inviterMemberId: "owner",
          issuedAt: new Date().toISOString(),
          expiresAt: body.expiresAt,
        },
        state: { _tag: "Pending" },
      };
      invitations.push(created);
      return response(created, 201);
    }
    if (path === "/invitations") return response(invitations);
    if (path === "/accounts") return response(accounts);
    return response([]);
  });
  const history = mount(
    "/workspaces/one/settings/members",
    memoryStore(session("alice")).store,
    fetch,
  );
  await screen.findByRole("navigation", { name: "Workspace" });
  const main = within(screen.getByRole("main"));
  const roster = await main.findByRole("list", { name: "Members" });
  expect(
    within(roster)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual([expect.stringContaining("Alice · You"), expect.stringContaining("Ada")]);
  // Invite: one sign-in email, with the first role the reader may give.
  fireEvent.click(main.getByRole("button", { name: "Invite people" }));
  const invite = await screen.findByRole("dialog", { name: "Invite member" });
  fireEvent.input(within(invite).getByLabelText("Sign-in email"), {
    target: { value: "new@example.test" },
  });
  expect(within(invite).getByRole("button", { name: /Workspace role/ })).toHaveTextContent(
    "Member",
  );
  fireEvent.click(within(invite).getByRole("button", { name: "Create invitation" }));
  await screen.findByText("Invitation created");
  const pending = await main.findByRole("list", { name: "Pending invitations" });
  await waitFor(() => expect(pending).toHaveTextContent("new@example.test"));
  expect(pending).toHaveTextContent("Member · Expires in 7 days");
  // Remove: open the member beside the roster, then confirm.
  fireEvent.click(within(roster).getByRole("link", { name: /Ada/ }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/settings/members?member=ada"));
  const details = await screen.findByLabelText("Member details", { selector: "aside" });
  expect(details).toHaveTextContent("ada@example.test");
  fireEvent.click(within(details).getByRole("button", { name: "Remove member" }));
  const confirm = await screen.findByRole("dialog", { name: "Remove member" });
  expect(confirm).toHaveTextContent("Remove Ada?");
  fireEvent.click(within(confirm).getByRole("button", { name: "Remove member" }));
  await screen.findByText("Ada was removed");
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/settings/members"));
  await waitFor(() =>
    expect(within(main.getByRole("list", { name: "Members" })).getAllByRole("link")).toHaveLength(
      1,
    ),
  );
  expect(requests).toEqual(["POST /invitations", "DELETE /members/ada"]);
});

function liveWorkspace(options: { name: () => string; status?: () => string }) {
  return vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    const entry = membership("one", options.name(), options.status?.() ?? "active");
    if (path.endsWith("/settings"))
      return Promise.resolve(
        response({
          workspace: entry.workspace,
          canRename: true,
          canReadInvitations: true,
          canInvite: true,
          roles: [],
        }),
      );
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        response({
          workspace: entry.workspace,
          owner: entry.member,
          ownerAssignmentId: "grant",
          canTransfer: true,
          candidates: [],
        }),
      );
    return Promise.resolve(response({ memberships: [entry], invitations: [] }));
  });
}
it("shows a rename committed elsewhere without a reload, keeping the draft being edited", async () => {
  let name = "Studio";
  mount(
    "/workspaces/one/settings/workspace",
    memoryStore(session("alice")).store,
    liveWorkspace({ name: () => name }),
  );
  const input = await screen.findByRole("textbox", { name: "Workspace name" });
  const sidebar = screen.getByRole("navigation", { name: "Workspace" });
  expect(input).toHaveValue("Studio");
  fireEvent.input(input, { target: { value: "My draft" } });
  name = "Atelier";
  feed.streams[0]?.send(
    committed("one", "2", [
      {
        name: "workspace.renamed",
        payload: { workspaceId: "one", previousName: "Studio", name: "Atelier" },
      },
    ]),
  );
  await waitFor(() => expect(sidebar).toHaveTextContent("Atelier"));
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toBe(input);
  expect(input).toHaveValue("My draft");
});
it("leaves a workspace once a commit removes the member, without signing out", async () => {
  let status = "active";
  const fixture = memoryStore(session("alice"));
  mount(
    "/workspaces/one",
    fixture.store,
    liveWorkspace({ name: () => "Studio", status: () => status }),
    () =>
      status === "removed"
        ? response(
            { _tag: "CoreError.Denied", reason: { _tag: "NotMember", workspaceId: "one" } },
            403,
          )
        : undefined,
  );
  await screen.findByRole("heading", { name: "Inbox" });
  status = "removed";
  feed.streams[0]?.send(
    committed("one", "2", [
      { name: "workspace.member.removed", payload: { workspaceId: "one", memberId: "owner-one" } },
    ]),
  );
  feed.streams[0]?.unavailable();
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
  expect(fixture.store.read()?.token).toBe("alice");
  await waitFor(() => expect(feed.streams[0]?.request.signal.aborted).toBe(true));
});
it("tells the reader when changes stop arriving, and clears once they resume", async () => {
  let down = false;
  mount(
    "/workspaces/one/tasks",
    memoryStore(session("alice")).store,
    liveWorkspace({ name: () => "Studio" }),
    () =>
      down
        ? response(
            { _tag: "CoreError.Unavailable", reason: { _tag: "ChangeFeedInterrupted" } },
            503,
          )
        : undefined,
  );
  await screen.findByRole("heading", { name: "Tasks" });
  const announcer = screen.getByRole("status");
  expect(announcer).toBeEmptyDOMElement();
  down = true;
  feed.streams[0]?.unavailable();
  // A brief drop, such as a host restart, stays silent.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  expect(announcer).toBeEmptyDOMElement();
  await waitFor(() => expect(announcer).toHaveTextContent("Reconnecting…"), { timeout: 3_000 });
  down = false;
  window.dispatchEvent(new Event("online"));
  await waitFor(() => expect(announcer).toBeEmptyDOMElement());
  expect(screen.getByRole("status")).toBe(announcer);
}, 10_000);

it("points an invited identity to its invitation instead of reporting no access", async () => {
  const fixture = memoryStore(session("alice"));
  mount("/workspaces/one/settings", fixture.store, () =>
    Promise.resolve(
      response({
        memberships: [],
        invitations: [
          {
            details: {
              id: "invitation-one",
              workspaceId: "one",
              recipientId: "alice",
              roleId: "builtin:member",
              inviterMemberId: "owner-one",
              issuedAt: "2026-09-25T12:00:00.000Z",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
            state: { _tag: "Pending" },
            workspaceName: "Fold Studio",
          },
        ],
      }),
    ),
  );
  await screen.findByRole("heading", { name: "You haven’t joined this workspace yet" });
  expect(screen.getByText(/You’ve been invited to Fold Studio/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Your workspaces" }));
  fireEvent.click(await screen.findByRole("button", { name: "Accept invite to Fold Studio" }));
  const dialog = await screen.findByRole("dialog", { name: "Join Fold Studio" });
  expect(within(dialog).getByRole("textbox", { name: "Your name" })).toHaveValue("Alice");
});
/** A group with one thread and its reply, as the host answers them. */
const at = "2026-09-25T12:00:00.000Z";
const author = { _tag: "Member", memberId: "owner-one" };
const message = (id: string, text: string, mentions: ReadonlyArray<string> = []) => ({
  id,
  workspaceId: "one",
  threadId: "t1",
  author,
  via: null,
  publishedAt: at,
  content: { _tag: "Text", text, mentions, revision: 1, editedAt: null },
});
const item = (sequence: number, id: string, text: string) => ({
  activity: {
    id: `activity-${sequence}`,
    workspaceId: "one",
    threadId: "t1",
    sequence,
    occurredAt: at,
    kind: "message.published",
    version: 1,
    subject: `message:${id}`,
    occurrence: `message:${id}`,
    newActivity: true,
    details: { messageId: id },
  },
  message: message(id, text),
});
const thread = {
  id: "t1",
  workspaceId: "one",
  groupId: "g1",
  title: null,
  origin: null,
  createdBy: author,
  createdAt: at,
};
const conversation = (path: string) =>
  path.endsWith("/groups/g1/openings")
    ? [
        {
          thread,
          task: null,
          message: message("m1", "Can you look at the terms?"),
          replies: 1,
          latest: { threadId: "t1", sequence: 2, occurredAt: at },
          readThrough: 2,
          unread: false,
        },
      ]
    : path.endsWith("/threads/t1")
      ? thread
      : path.endsWith("/threads/t1/timeline")
        ? [item(1, "m1", "Can you look at the terms?"), item(2, "m2", "On it.")]
        : undefined;

it("shows a group's stream at its route and an open thread beside it", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    const answer = conversation(path);
    return Promise.resolve(
      response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] }),
    );
  });
  const history = mount(
    "/workspaces/one/groups/g1/threads/t1",
    memoryStore(session("alice")).store,
    fetch,
  );
  await screen.findByRole("navigation", { name: "Workspace" });
  const main = screen.getByRole("main");
  const opening = (await within(main).findByText("Can you look at the terms?")).closest("article");
  const replies = screen.getByRole("button", { name: /1 reply/ });
  expect(replies).toHaveAttribute("aria-expanded", "true");
  const thread = await screen.findByLabelText("Thread", { selector: "aside" });
  await within(thread).findByText("On it.");
  fireEvent.click(within(thread).getByRole("button", { name: "Close thread" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g1"));
  await waitFor(() => expect(screen.queryByLabelText("Thread", { selector: "aside" })).toBeNull());
  expect(replies).toHaveAttribute("aria-expanded", "false");
  // The stream stays mounted while threads open and close beside it.
  expect(within(main).getByText("Can you look at the terms?").closest("article")).toBe(opening);
  fireEvent.click(replies);
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g1/threads/t1"));
});

/** One pending mention of the reader in thread t1, as their inbox lists it. */
const mentioned = () => ({
  notification: {
    id: "n1",
    workspaceId: "one",
    source: { logId: "journal", entryId: "e2" },
    participationId: "p1",
    thread: { threadId: "t1", groupId: "g1", sequence: 2 },
    recipient: { _tag: "Human", id: "alice", memberId: "owner-one" },
    recordedAt: at,
    state: { _tag: "Pending" } as { _tag: string },
  },
  source: {
    ...item(2, "m2", "On it."),
    message: message("m2", "On it.", ["owner-one"]),
  },
});
it("lists the inbox at its route, and opening one marks it seen and shows its thread beside it", async () => {
  const inbox = [mentioned()];
  const markedSeen: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/notifications/inbox"))
      return Promise.resolve(
        response(
          new URL(request.url).searchParams.get("pendingOnly") === "true"
            ? inbox.filter((entry) => entry.notification.state._tag === "Pending")
            : inbox,
        ),
      );
    if (request.method === "POST" && path.endsWith("/notifications/n1/seen")) {
      markedSeen.push(path);
      inbox[0]!.notification.state = { _tag: "Seen", seenAt: at } as { _tag: string };
      feed.streams.at(-1)?.send(notificationsSeen("one", "owner-one", ["n1"]));
      return Promise.resolve(response(inbox[0]!.notification));
    }
    // The reply in the thread mentions the reader, as the notification says.
    const answer = path.endsWith("/threads/t1/timeline")
      ? [
          item(1, "m1", "Can you look at the terms?"),
          {
            ...item(2, "m2", "On it."),
            message: message("m2", "On it.", ["owner-one"]),
          },
        ]
      : conversation(path);
    return Promise.resolve(
      response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] }),
    );
  });
  const history = mount("/workspaces/one/inbox", memoryStore(session("alice")).store, fetch);
  await screen.findByRole("navigation", { name: "Workspace" });
  // Unread opens first.
  const list = await within(screen.getByRole("main")).findByRole("list", {
    name: "Unread notifications",
  });
  await within(list).findByText("On it.");
  expect(within(list).getByText(/mentioned you/)).toBeInTheDocument();
  expect(within(list).getByRole("img", { name: "unread" })).toBeInTheDocument();
  const sidebar = screen.getByRole("navigation", { name: "Workspace" });
  const destination = within(sidebar).getByRole("link", { name: /^Inbox/ });
  expect(destination).toHaveAttribute("aria-current", "page");
  const open = within(list).getByRole("link", { name: /mentioned you$/ });
  // It opens the thread at the message that notified the reader.
  expect(open).toHaveAttribute("href", "/workspaces/one/inbox/groups/g1/threads/t1?at=2");
  fireEvent.click(open);
  await waitFor(() =>
    expect(history.get()).toBe("/workspaces/one/inbox/groups/g1/threads/t1?at=2"),
  );
  // Opening it marks it seen at once.
  await waitFor(() => expect(within(list).queryByRole("img", { name: "unread" })).toBeNull());
  await waitFor(() => expect(markedSeen).toEqual(["/notifications/n1/seen"]));
  const thread = await screen.findByLabelText("Thread", { selector: "aside" });
  await within(thread).findByText("Can you look at the terms?");
  // The message that notified the reader is set apart, and the panel says why it came.
  await waitFor(() =>
    expect(within(thread).getByText("On it.").closest("article")).toHaveAttribute("data-active"),
  );
  expect(
    within(thread).getByText("Can you look at the terms?").closest("article"),
  ).not.toHaveAttribute("data-active");
  await within(thread).findByText(/^Mention · /);
  expect(open).toHaveAttribute("aria-current", "true");
  // The inbox stays the current destination while a thread is open beside it.
  expect(destination).toHaveAttribute("aria-current", "page");
  fireEvent.click(within(thread).getByRole("button", { name: "Close thread" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/inbox"));
  await waitFor(() => expect(screen.queryByLabelText("Thread", { selector: "aside" })).toBeNull());
  // The inbox stays mounted while threads open and close beside it.
  // Nothing unread remains once its thread closes.
  await within(screen.getByRole("main")).findByText("You’re all caught up");
});

it("offers a new group only to those who may create one, and opens the group it creates", async () => {
  const created: Array<unknown> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/groups") {
      created.push(await request.json());
      return response(
        {
          id: "g2",
          workspaceId: "one",
          kind: "Team",
          visibility: "Private",
          name: "Receipts",
          createdBy: "owner-one",
          createdAt: at,
        },
        201,
      );
    }
    if (path.endsWith("/groups/g2/openings")) return response([]);
    return response({ memberships: [membership("one", "Studio")], invitations: [] });
  });
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, fetch, undefined, {
    permissions: ["group.create"],
  });
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" });
  fireEvent.click(await within(sidebar).findByRole("button", { name: "Create group" }));
  const dialog = await screen.findByRole("dialog", { name: "Create group" });
  fireEvent.input(within(dialog).getByRole("textbox", { name: "Group name" }), {
    target: { value: "Receipts" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create group" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g2"));
  // The reader is always a member of a group they create.
  expect(created).toEqual([{ name: "Receipts", memberIds: ["owner-one"], visibility: "Private" }]);
  await screen.findByText("Group created");
});
it("browses public groups from the sidebar, and joining one opens it", async () => {
  const joins: Array<string> = [];
  const lobby = {
    id: "g5",
    workspaceId: "one",
    kind: "Team",
    visibility: "Public",
    name: "Lobby",
    createdBy: "owner-one",
    createdAt: at,
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/groups/public") return response([{ group: lobby, members: 1, joined: false }]);
    if (request.method === "POST" && path === "/groups/g5/join") {
      joins.push(path);
      return response({
        id: "a5",
        workspaceId: "one",
        groupId: "g5",
        memberId: "owner-one",
        admittedAt: at,
        status: "active",
      });
    }
    if (path.endsWith("/groups/g5/openings")) return response([]);
    return response({ memberships: [membership("one", "Studio")], invitations: [] });
  });
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, fetch);
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" });
  // Anyone may browse, even before belonging to any group.
  fireEvent.click(await within(sidebar).findByRole("button", { name: "Browse groups" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups?tab=discover"));
  await screen.findByRole("heading", { name: "Groups" });
  await waitFor(() =>
    expect(within(sidebar).getByRole("link", { name: "Groups" })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
  const list = await screen.findByRole("list", { name: "Public groups" });
  expect(within(list).getByRole("listitem")).toHaveTextContent("1 member");
  fireEvent.click(within(list).getByRole("button", { name: "Join Lobby" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g5"));
  expect(joins).toHaveLength(1);
});
it("shows no new group action to a reader who may not create one", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(response({ memberships: [membership("one", "Studio")], invitations: [] })),
  );
  mount("/workspaces/one", memoryStore(session("alice")).store, fetch);
  await screen.findByRole("navigation", { name: "Workspace" });
  await screen.findByRole("heading", { name: "Inbox" });
  expect(screen.queryByRole("button", { name: "Create group" })).toBeNull();
});

/** Group g1 in the reader's sidebar, as someone who manages its members. */
const managed = {
  group: {
    id: "g1",
    workspaceId: "one",
    kind: "Team",
    visibility: "Private",
    name: "Design",
    createdBy: "owner-one",
    createdAt: at,
  },
  latestActivityAt: null,
  readAt: null,
  newActivity: false,
  following: false,
  pending: 0,
  manageable: true,
  membersRemovable: true,
  renamable: true,
};
it("manages a group's members from its header, and leaving returns to the workspace", async () => {
  const admission = (id: string, memberId: string) => ({
    id,
    workspaceId: "one",
    groupId: "g1",
    memberId,
    admittedAt: at,
    status: "active",
  });
  let roster = [admission("a1", "owner-one"), admission("a2", "ada-one")];
  const changes: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/groups/g1/members" && request.method === "GET")
      return Promise.resolve(response(roster));
    const departure = /\/groups\/g1\/members\/([^/]+)(\/leave)?$/.exec(path);
    if (departure) {
      changes.push(`${departure[2] ? "leave" : "remove"} ${departure[1]}`);
      const ended = roster.find((entry) => entry.id === departure[1])!;
      roster = roster.filter((entry) => entry.id !== departure[1]);
      return Promise.resolve(response({ ...ended, status: "removed" }));
    }
    const answer = conversation(path);
    return Promise.resolve(
      response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] }),
    );
  });
  const history = mount(
    "/workspaces/one/groups/g1",
    memoryStore(session("alice")).store,
    fetch,
    undefined,
    { groups: [managed] },
  );
  fireEvent.click(await screen.findByRole("button", { name: "2 members" }));
  const dialog = await screen.findByRole("dialog", { name: "Group settings" });
  const list = within(dialog).getByRole("list", { name: "Members" });
  await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));
  expect(within(dialog).getByRole("combobox", { name: "Add members" })).toBeInTheDocument();
  // The reader is listed as "You", with no way to remove themselves from the list.
  const [own] = within(list).getAllByRole("listitem");
  expect(own).toHaveTextContent("You");
  expect(within(own!).queryByRole("button")).toBeNull();
  fireEvent.click(within(list).getByRole("button", { name: /^Remove / }));
  await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
  // Leaving is on the General tab.
  fireEvent.click(within(dialog).getByRole("button", { name: "General" }));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Leave group" }));
  await waitFor(() => expect(changes).toEqual(["remove a2", "leave a1"]));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/inbox"));
  expect(changes).toEqual(["remove a2", "leave a1"]);
});

it("drafts a first message to someone new and opens the conversation it starts", async () => {
  const started: Array<unknown> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/threads") {
      started.push(await request.json());
      return response(
        {
          thread: {
            id: "t9",
            workspaceId: "one",
            groupId: "g9",
            title: null,
            origin: null,
            createdBy: author,
            createdAt: at,
          },
          message: message("m9", "Are you free?"),
          task: null,
          activity: { ...item(1, "m9", "Are you free?").activity, threadId: "t9" },
        },
        201,
      );
    }
    if (path.endsWith("/groups/g9/openings")) return response([]);
    return response({ memberships: [membership("one", "Studio")], invitations: [] });
  });
  const history = mount(
    "/workspaces/one/direct?to=ada-one",
    memoryStore(session("alice")).store,
    fetch,
  );
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" });
  // Everyone may start a direct message.
  expect(within(sidebar).getByRole("button", { name: "New message" })).toBeInTheDocument();
  await screen.findByText("Send the first message to start the conversation.");
  const composer = await screen.findByRole("combobox", { name: /^Message / });
  await userEvent.setup().type(composer, "Are you free?");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g9"));
  expect(started).toEqual([{ memberIds: ["ada-one"], text: "Are you free?", mentions: [] }]);
});

it("lists teammates under Direct messages and says when there are no groups", async () => {
  const person = (id: string, name: string, kind = "Human") => ({
    id,
    workspaceId: "one",
    identity: { _tag: kind, id: kind === "Human" ? `${id}@example.test` : id },
    name,
    status: "active",
  });
  const history = mount(
    "/workspaces/one",
    memoryStore(session("alice")).store,
    () =>
      Promise.resolve(response({ memberships: [membership("one", "Studio")], invitations: [] })),
    undefined,
    {
      groups: [],
      members: [
        { ...person("owner-one", "Alice"), identity: { _tag: "Human", id: "alice" } },
        person("ada", "Ada"),
        person("scout", "Scout", "Agent"),
      ],
    },
  );
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" });
  await within(sidebar).findByText("No groups yet");
  // People and agents alike, without the reader; a row opens a first message.
  const ada = await within(sidebar).findByRole("link", { name: "Ada" });
  expect(within(sidebar).getByRole("link", { name: "Scout" })).toHaveAttribute(
    "href",
    "/workspaces/one/direct?to=scout",
  );
  expect(within(sidebar).queryByRole("link", { name: "Alice" })).toBeNull();
  fireEvent.click(ada);
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/direct?to=ada"));
  await waitFor(() =>
    expect(within(sidebar).getByRole("link", { name: "Ada" })).toHaveAttribute(
      "aria-current",
      "page",
    ),
  );
});

it("jumps to a group by name from ⌘K or the sidebar's search", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    if (path === "/groups/g1/members") return Promise.resolve(response([]));
    const answer = conversation(path);
    return Promise.resolve(
      response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] }),
    );
  });
  const history = mount("/workspaces/one", memoryStore(session("alice")).store, fetch, undefined, {
    groups: [managed],
  });
  const sidebar = await screen.findByRole("navigation", { name: "Workspace" });
  await within(sidebar).findByRole("link", { name: "Design" });
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  const dialog = await screen.findByRole("dialog", { name: "Jump to" });
  const field = within(dialog).getByRole("combobox", { name: "Jump to" });
  const user = userEvent.setup();
  await user.type(field, "des");
  expect(
    within(dialog)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Design"]);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/groups/g1"));
  expect(screen.queryByRole("dialog", { name: "Jump to" })).toBeNull();
  // The sidebar's search opens it too.
  fireEvent.click(within(sidebar).getByRole("button", { name: /Find anything/u }));
  expect(await screen.findByRole("dialog", { name: "Jump to" })).toBeInTheDocument();
});

it("renames a group from its settings", async () => {
  let name = "Design",
    expectedName: string | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/groups/g1/rename") {
      ({ name, expectedName } = (await request.json()) as { name: string; expectedName: string });
      return response({ ...managed.group, name });
    }
    if (path === "/groups/g1/members") return response([]);
    const answer = conversation(path);
    return response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] });
  });
  mount("/workspaces/one/groups/g1", memoryStore(session("alice")).store, fetch, undefined, {
    groups: [managed],
  });
  await screen.findByRole("heading", { name: "Design" });
  fireEvent.click(await screen.findByRole("button", { name: "Group settings" }));
  const dialog = await screen.findByRole("dialog", { name: "Group settings" });
  const field = within(dialog).getByRole("textbox", { name: "Group name" });
  expect(field).toHaveValue("Design");
  fireEvent.input(field, { target: { value: "Product design" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(name).toBe("Product design"));
  // It renames from the name the dialog started from, so a rename made meanwhile is not lost.
  expect(expectedName).toBe("Design");
});

it("follows a group from its bell, confirming each change with a toast", async () => {
  let following = false;
  const changes: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && /\/groups\/g1\/(un)?follow$/.test(path)) {
      following = path.endsWith("/follow");
      changes.push(path.split("/").at(-1)!);
      return new Response(null, { status: 204 });
    }
    if (path === "/groups/g1/members") return response([]);
    const answer = conversation(path);
    return response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] });
  });
  mount("/workspaces/one/groups/g1", memoryStore(session("alice")).store, fetch, undefined, {
    groups: () => [{ ...managed, following }],
  });
  await screen.findByRole("heading", { name: "Design" });
  const bell = await screen.findByRole("button", { name: "Follow" });
  expect(bell).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(bell);
  await screen.findByText("Following #Design");
  expect(screen.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  await waitFor(() => expect(screen.getByRole("button", { name: "Following" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Following" }));
  await screen.findByText("Unfollowed #Design");
  expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "false");
  expect(changes).toEqual(["follow", "unfollow"]);
});

it("follows and renames a group from commands typed after /, posting nothing", async () => {
  let following = false;
  const writes: Array<string> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "POST") writes.push(path.split("/").at(-1)!);
    if (request.method === "POST" && /\/groups\/g1\/(un)?follow$/.test(path)) {
      following = path.endsWith("/follow");
      return new Response(null, { status: 204 });
    }
    if (path === "/groups/g1/members") return response([]);
    const answer = conversation(path);
    return response(answer ?? { memberships: [membership("one", "Studio")], invitations: [] });
  });
  mount("/workspaces/one/groups/g1", memoryStore(session("alice")).store, fetch, undefined, {
    groups: () => [{ ...managed, following }],
  });
  await screen.findByRole("heading", { name: "Design" });
  const composer = await screen.findByRole("combobox", { name: "Message #Design" });
  const user = userEvent.setup();
  await user.type(composer, "/fol{Enter}");
  await screen.findByText("Following #Design");
  // Following, the group offers to stop instead.
  await user.type(composer, "/");
  const commands = await screen.findByRole("listbox", { name: "Commands" });
  expect(
    within(commands)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["/unfollowStop following #Design", "/renameRename #Design"]);
  await user.type(composer, "ren{Enter}");
  const dialog = await screen.findByRole("dialog", { name: "Group settings" });
  await waitFor(() =>
    expect(within(dialog).getByRole("textbox", { name: "Group name" })).toHaveFocus(),
  );
  expect(composer).toHaveTextContent("");
  expect(writes).toEqual(["follow"]);
});

/** A host installing an MCP integration, answering Connections's reads, writes, and checks. */
function connectionsHost() {
  const mcp = {
    id: "mcp",
    name: "MCP server",
    auth: ["apiKey", "none"],
    provides: ["tools"],
    requiresSandbox: false,
    settings: {
      type: "object",
      properties: {
        url: { type: "string", title: "Server URL", minLength: 1 },
        keyHeader: { type: "string", title: "Key header", minLength: 1 },
      },
      required: ["url"],
    },
  };
  let created: Record<string, unknown> | undefined;
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  const view = () => ({
    id: "c1",
    integration: "mcp",
    name: created?.["name"],
    settings: created?.["settings"],
    auth: created?.["auth"],
    readiness: { _tag: "Ready" },
    manageable: true,
    createdBy: "owner-one",
    createdAt: at,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/connections/integrations") return response([mcp]);
    if (path === "/connections" && request.method === "GET")
      return response(created === undefined ? [] : [view()]);
    if (path === "/connections" && request.method === "POST") {
      created = (await request.json()) as Record<string, unknown>;
      writes.push({ method: "POST", path, body: created });
      return response(view(), 201);
    }
    if (path === "/connections/c1/check") {
      writes.push({ method: "POST", path, body: undefined });
      return response({ status: "unauthorized", description: "The server refused the key." });
    }
    return response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" },
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active",
          },
          people: 1,
        },
      ],
      invitations: [],
    });
  });
  return { fetch, writes };
}
/** Adds an MCP server with its key from the empty page, which opens its page and checks it. */
async function addMcpServerWithKey() {
  const page = await screen.findByRole("heading", { name: "No connections yet" });
  fireEvent.click(within(page.parentElement!).getByRole("button", { name: "Add connection" }));
  const chooser = await screen.findByRole("dialog", { name: "Add connection" });
  fireEvent.click(within(chooser).getByRole("button", { name: /MCP server/ }));
  const configure = await screen.findByRole("dialog", { name: "Configure connection" });
  fireEvent.input(within(configure).getByRole("textbox", { name: "Server URL" }), {
    target: { value: "https://tools.example.com/mcp" },
  });
  fireEvent.input(within(configure).getByLabelText("API key", { selector: "input" }), {
    target: { value: "sk-tools" },
  });
  fireEvent.click(within(configure).getByRole("button", { name: "Create connection" }));
  await within(screen.getByLabelText("Notifications")).findByText("MCP server created");
  await screen.findByRole("heading", { name: "MCP server" });
  // Creating it checks it, and the page says what the check found.
  await within(screen.getByRole("main")).findByText("Key refused");
  expect(screen.getByText("The server refused the key.")).toBeInTheDocument();
}
const connectionWrites = [
  {
    method: "POST",
    path: "/connections",
    body: {
      integration: "mcp",
      name: "MCP server",
      settings: { url: "https://tools.example.com/mcp" },
      auth: "apiKey",
      apiKey: "sk-tools",
    },
  },
  { method: "POST", path: "/connections/c1/check", body: undefined },
];

it("adds a connection with its key from Connections, opening its page and checking it", async () => {
  const host = connectionsHost();
  const history = mount(
    "/workspaces/one/connections",
    memoryStore(session("alice")).store,
    host.fetch,
    undefined,
    { permissions: ["connection.create"] },
  );
  await addMcpServerWithKey();
  expect(history.get()).toBe("/workspaces/one/connections/c1");
  expect(host.writes).toEqual(connectionWrites);
});

/** A host with two agents, one whose sandbox connection was removed, and their connections. */
function agentsHost() {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner-one" };
  const agent = (id: string, name: string, sandbox: string | null) => ({
    id,
    memberId: `member-${id}`,
    name,
    instructions: "Help the team.",
    harness: { _tag: "Connection", connectionId: "h1" },
    model: { connectionId: "m1", id: "local-model" },
    sandbox: sandbox === null ? null : { connectionId: sandbox },
    readiness:
      sandbox === null
        ? { _tag: "Ready" }
        : { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "sandbox" }] },
    configurable: true,
    usable: true,
    createdBy: "owner-one",
    createdAt: "2026-10-06T12:00:00.000Z",
  });
  const integration = (id: string, name: string, provides: string) => ({
    id,
    name,
    auth: ["none"],
    provides: [provides],
    requiresSandbox: false,
    settings: { type: "object", properties: {} },
  });
  const connection = (id: string, name: string, integrationId: string) => ({
    id,
    name,
    integration: integrationId,
    settings: {},
    auth: "none",
    readiness: { _tag: "Ready" },
    manageable: true,
    createdBy: "owner-one",
    createdAt: "2026-10-06T12:00:00.000Z",
  });
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/agents")
      return response([agent("a1", "Atlas", null), agent("a2", "Review helper", "gone")]);
    if (path === "/connections/integrations")
      return response([
        integration("amends", "amends", "harnesses"),
        integration("openai-compatible", "OpenAI-compatible API", "models"),
      ]);
    if (path === "/connections")
      return response([
        connection("h1", "Amends harness", "amends"),
        connection("m1", "Local models", "openai-compatible"),
      ]);
    if (path === "/connections/m1/models") return response({ listed: [], unlisted: true });
    if (path === "/settings")
      return response({
        workspace,
        canRename: true,
        canReadInvitations: true,
        canInvite: true,
        roles: [],
      });
    return response({
      memberships: [
        {
          workspace,
          member: {
            id: "owner-one",
            workspaceId: "one",
            identity: { _tag: "Human", id: "alice" },
            name: "alice",
            status: "active",
          },
          people: 1,
        },
      ],
      invitations: [],
    });
  });
}
it("lists agents in the sidebar, opens one with its setup, and adds from the sidebar", async () => {
  const history = mount(
    "/workspaces/one/agents",
    memoryStore(session("alice")).store,
    agentsHost(),
    undefined,
    { permissions: ["agent.create"] },
  );
  const sidebar = within(await screen.findByRole("navigation", { name: "Workspace" }));
  await sidebar.findByRole("link", { name: /Atlas/ });
  expect(sidebar.getByRole("link", { name: "Agents" })).toHaveAttribute("aria-current", "page");
  expect(sidebar.getByRole("link", { name: /Review helper, Needs setup$/ })).toBeInTheDocument();
  fireEvent.click(sidebar.getByRole("link", { name: /Review helper/ }));
  await waitFor(() => expect(history.get()).toBe("/workspaces/one/agents/a2"));
  const main = within(screen.getByRole("main"));
  await main.findByText("Its sandbox connection was removed.");
  expect(main.getByRole("button", { name: /^Harness/ })).toHaveTextContent("Amends harness");
  expect(main.getByRole("button", { name: /^Sandbox/ })).toHaveTextContent("Removed connection");
  fireEvent.click(sidebar.getByRole("button", { name: "Add agent" }));
  await screen.findByRole("dialog", { name: "Add agent" });
  expect(history.get()).toBe("/workspaces/one/agents/a2?add=agent");
});
