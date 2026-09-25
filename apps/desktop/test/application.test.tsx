import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { HashRouter } from "@solidjs/router";
import { Session, type SessionStore } from "@amends/client";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { Application } from "../src/application.tsx";
import { ApplicationRoutes } from "../src/routes.tsx";
import { committed, withChangeFeed } from "./change-feed.ts";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let feed: ReturnType<typeof withChangeFeed>;
/** Change-feed requests reach controllable streams; `fetch` sees every other request. */
function mount(path: string, token: string | undefined, fetch: typeof globalThis.fetch) {
  window.history.replaceState(null, "", `/#${path}`);
  let stored = token ? Schema.decodeSync(Session)({ token, identity: token }) : undefined;
  const store: SessionStore = {
    read: () => stored,
    write: (next) => {
      stored = next;
    },
    subscribe: () => () => {},
  };
  feed = withChangeFeed(fetch);
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, feed.fetch)),
  );
  render(() => (
    <Application apiBaseUrl="http://127.0.0.1:8787" sessionStore={store} transport={transport}>
      <HashRouter>
        <ApplicationRoutes />
      </HashRouter>
    </Application>
  ));
  return store;
}
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});
it("uses hash routes for guest redirects and keeps the intended workspace", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  mount("/workspaces/one?tab=members", undefined, fetch);
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
  expect(screen.getByRole("main")).toHaveFocus();
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
});
it("composes validated client state with UI and signs out through the desktop router", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(response({ memberships: [], invitations: [] })),
  );
  const store = mount("/workspaces", "alice", fetch);
  await screen.findByRole("heading", { name: "Where are you working?" });
  expect(screen.getByRole("link", { name: /New workspace/ })).toHaveAttribute(
    "href",
    "#/workspaces/new",
  );
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer alice");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(store.read()).toBeUndefined();
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces");
});
it("clears a rejected session and renders the desktop sign-in form", async () => {
  const store = mount("/workspaces/one", "expired", () =>
    Promise.resolve(response({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401)),
  );
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(store.read()).toBeUndefined();
  expect(window.location.hash).toContain("returnTo=%2Fworkspaces%2Fone");
});
it("owns its not-found presentation without making an API request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  mount("/missing", undefined, fetch);
  await screen.findByRole("heading", { name: "Nothing at this address" });
  expect(fetch).not.toHaveBeenCalled();
});

async function submitEmail() {
  fireEvent.input(await screen.findByRole("textbox", { name: "Email" }), {
    target: { value: "jo@mercier.co" },
  });
  fireEvent.submit(screen.getByRole("form"));
  return screen.findByRole("textbox", { name: "Six-digit code" });
}
it("signs in from the desktop page and resumes the workspace query through hash routing", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(response({ token: "jo@mercier.co", identity: "jo@mercier.co" }))
    .mockResolvedValue(
      response({
        memberships: [
          {
            workspace: {
              id: "one",
              name: "Desktop workspace",
              createdBy: "jo@mercier.co",
              ownerMemberId: "owner-one",
            },
            member: {
              id: "owner-one",
              workspaceId: "one",
              identity: { _tag: "Human", id: "jo@mercier.co" },
              status: "active",
            },
            people: 1,
          },
        ],
        invitations: [],
      }),
    );
  const store = mount("/workspaces/one?tab=members", undefined, fetch);
  const code = await submitEmail();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(code).toHaveFocus();
  fireEvent.input(code, { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Home" });
  expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toHaveTextContent(
    "Desktop workspace",
  );
  expect(window.location.hash).toBe("#/workspaces/one?tab=members");
  expect(store.read()?.token).toBe("jo@mercier.co");
  expect(new Headers(fetch.mock.calls[2]?.[1]?.headers).get("authorization")).toBe(
    "Bearer jo@mercier.co",
  );
});
it("keeps a new credential through directory failure and safely resumes after retry", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockResolvedValueOnce(response({ token: "jo@mercier.co", identity: "jo@mercier.co" }))
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValue(response({ memberships: [], invitations: [] }));
  const store = mount("/sign-in?returnTo=%2F%2Fevil.invalid", undefined, fetch);
  fireEvent.input(await submitEmail(), { target: { value: "001234" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Can’t reach your workspace host" });
  expect(store.read()?.token).toBe("jo@mercier.co");
  expect(window.location.hash).toContain("#/sign-in");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: "Where are you working?" });
  expect(window.location.hash).toBe("#/workspaces");
});

it("opens creation from the picker and enters the created workspace through hash routes", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
  const listing = {
    memberships: [
      {
        workspace,
        member: {
          id: "owner",
          workspaceId: "one",
          identity: { _tag: "Human", id: "alice" },
          status: "active",
        },
        people: 1,
      },
    ],
    invitations: [],
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ memberships: [], invitations: [] }))
    .mockResolvedValueOnce(response(workspace, 201))
    .mockResolvedValueOnce(response(listing));
  mount("/workspaces", "alice", fetch);
  fireEvent.click(await screen.findByRole("link", { name: /New workspace/ }));
  const input = await screen.findByRole("textbox", { name: "Workspace name" });
  expect(window.location.hash).toBe("#/workspaces/new");
  fireEvent.input(input, { target: { value: "Studio" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByRole("heading", { name: "Home" });
  expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toHaveTextContent(
    "Studio",
  );
  expect(window.location.hash).toBe("#/workspaces/one");
  fireEvent.click(screen.getByRole("button", { name: "Your account: alice" }));
  fireEvent.click(await screen.findByRole("link", { name: "Switch workspace" }));
  expect(await screen.findByRole("link", { name: "Studio 1 member · Owner" })).toHaveAttribute(
    "href",
    "#/workspaces/one",
  );
});

it("navigates workspace sections with persistent chrome and retains appearance after sign-out", async () => {
  const listing = {
    memberships: [
      {
        workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
        member: {
          id: "owner",
          workspaceId: "one",
          identity: { _tag: "Human", id: "alice" },
          status: "active",
        },
        people: 1,
      },
    ],
    invitations: [],
  };
  mount("/workspaces/one", "alice", () => Promise.resolve(response(listing)));
  await screen.findByRole("heading", { name: "Home" });
  expect(screen.getByText("Workspace / Home")).toBeInTheDocument();
  expect(screen.getByRole("main", { name: "Home" }).querySelector("h1, h2")).toBeNull();
  const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
  fireEvent.click(screen.getByRole("link", { name: "Triage" }));
  await screen.findByRole("heading", { name: "Triage" });
  expect(screen.getByText("Workspace / Triage")).toBeInTheDocument();
  expect(window.location.hash).toBe("#/workspaces/one/triage");
  expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toBe(sidebar);
  fireEvent.click(screen.getByRole("button", { name: "Your account: alice" }));
  const dark = await screen.findByRole("radio", { name: "Soot" });
  fireEvent.click(dark);
  expect(dark).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in to amends" });
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces%2Fone%2Ftriage");
  expect(
    document.querySelector(
      colorThemes.soot
        .split(" ")
        .map((name) => `.${name}`)
        .join(""),
    ),
  ).not.toBeNull();
});

it("redirects the Settings entry to its workspace section and keeps sidebar selection on descendants", async () => {
  const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
  const member = {
    id: "owner",
    workspaceId: "one",
    identity: { _tag: "Human", id: "alice" },
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
  mount("/workspaces/one/settings", "alice", fetch);
  await screen.findByRole("textbox", { name: "Workspace name" });
  expect(window.location.hash).toBe("#/workspaces/one/settings/workspace");
  expect(
    screen.getByRole("navigation", { name: "Workspace" }).querySelector("a[aria-current=page]"),
  ).toHaveTextContent("Settings");
  expect(screen.getByRole("radio", { name: "Workspace" })).toBeChecked();
  fireEvent.change(screen.getByRole("radio", { name: "People" }), { target: { checked: true } });
  await waitFor(() => expect(window.location.hash).toBe("#/workspaces/one/settings/members"));
  expect(screen.getByRole("radio", { name: "People" })).toBeChecked();
});

it("keeps a workspace current through its change feed over the desktop host connection", async () => {
  let name = "Studio";
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    const workspace = { id: "one", name, createdBy: "jo", ownerMemberId: "owner-one" };
    const member = {
      id: "owner-one",
      workspaceId: "one",
      identity: { _tag: "Human", id: "jo" },
      status: "active",
    };
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
  mount("/workspaces/one/settings/workspace", "jo", fetch);
  await screen.findByRole("textbox", { name: "Workspace name" });
  const stream = feed.streams[0];
  expect(stream?.request.url).toBe("http://127.0.0.1:8787/workspaces/one/changes");
  expect(stream?.request.headers.get("authorization")).toBe("Bearer jo");
  name = "Atelier";
  stream?.send(
    committed("one", "2", [
      { name: "workspace.renamed", payload: { workspaceId: "one", previousName: "Studio", name } },
    ]),
  );
  await waitFor(() =>
    expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toHaveTextContent(
      "Atelier",
    ),
  );
  expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveValue("Atelier");
  expect(window.location.hash).toBe("#/workspaces/one/settings/workspace");
});

it("explains an unavailable workspace under the account header and returns to the picker", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(response({ memberships: [], invitations: [] })),
  );
  const store = mount("/workspaces/missing/settings", "jo", fetch);
  await screen.findByRole("heading", { name: "That workspace is closed to you" });
  expect(screen.getByText("No access")).toBeInTheDocument();
  expect(screen.getByText("jo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Your workspaces" }));
  await screen.findByRole("heading", { name: "Where are you working?" });
  expect(window.location.hash).toBe("#/workspaces");
  expect(store.read()?.token).toBe("jo");
});
