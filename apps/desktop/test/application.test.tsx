import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { HashRouter } from "@solidjs/router";
import { Session, type SessionStore } from "@amends/client";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { Application } from "../src/application.tsx";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );
  render(() => (
    <Application
      router={HashRouter}
      apiBaseUrl="http://127.0.0.1:8787"
      sessionStore={store}
      transport={transport}
    />
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
  await screen.findByRole("heading", { name: "Sign in" });
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces%2Fone%3Ftab%3Dmembers");
  expect(fetch).not.toHaveBeenCalled();
});
it("composes validated client state with UI and signs out through the desktop router", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(response({ memberships: [], invitations: [] })),
  );
  const store = mount("/workspaces", "alice", fetch);
  await screen.findByRole("heading", { name: "Workspaces" });
  expect(screen.getByRole("link", { name: "Workspaces" })).toHaveAttribute("href", "#/workspaces");
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer alice");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in" });
  expect(store.read()).toBeUndefined();
  expect(window.location.hash).toBe("#/sign-in?returnTo=%2Fworkspaces");
});
it("clears a rejected session and renders the desktop sign-in placeholder", async () => {
  const store = mount("/workspaces/one", "expired", () =>
    Promise.resolve(response({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401)),
  );
  await screen.findByRole("heading", { name: "Sign in" });
  expect(store.read()).toBeUndefined();
  expect(window.location.hash).toContain("returnTo=%2Fworkspaces%2Fone");
});
it("owns its not-found presentation without making an API request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  mount("/missing", undefined, fetch);
  await screen.findByRole("heading", { name: "Page not found" });
  expect(fetch).not.toHaveBeenCalled();
});
