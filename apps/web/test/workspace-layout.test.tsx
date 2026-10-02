import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import {
  DirectoryProvider,
  Session,
  useDirectory,
  ChangeFeedProvider,
  type DirectoryScope,
} from "@amends/client";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Application } from "../src/application.tsx";
import { WorkspaceLayout } from "../src/workspace-layout.tsx";
import { withChangeFeed } from "./change-feed.ts";
afterEach(cleanup);
const listing = (name: string) => ({
  memberships: [
    {
      workspace: { id: "one", name, createdBy: "alice", ownerMemberId: "owner" },
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
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
it("retains the shell and an open account menu through directory refresh and recovery", async () => {
  const held = Promise.withResolvers<Response>();
  const directoryReads = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(listing("Studio")))
    .mockImplementationOnce(() => held.promise)
    .mockResolvedValueOnce(json(listing("Renamed studio")));
  // The layout also reads the workspace's agents, whose status its sidebar and cards show.
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) =>
    new URL(new Request(input, init).url).pathname.endsWith("/agents")
      ? new Promise<Response>(() => {})
      : directoryReads(input, init),
  );
  let directory!: DirectoryScope;
  function Probe() {
    directory = useDirectory();
    return null;
  }
  const history = createMemoryHistory();
  history.set({ value: "/workspaces/one", replace: true, scroll: false });
  render(() => (
    <Application
      apiBaseUrl="https://host.test"
      sessionStore={{
        read: () => Schema.decodeSync(Session)({ token: "alice", identity: "alice" }),
        write: () => {},
        subscribe: () => () => {},
      }}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, withChangeFeed(fetch).fetch)),
      )}
    >
      <DirectoryProvider>
        <Probe />
        <MemoryRouter history={history}>
          <Route
            path="/workspaces/:workspaceId"
            component={() => (
              <ChangeFeedProvider workspaceId="one">
                <WorkspaceLayout>Content</WorkspaceLayout>
              </ChangeFeedProvider>
            )}
          />
        </MemoryRouter>
      </DirectoryProvider>
    </Application>
  ));
  await screen.findByText("Studio");
  const sidebar = screen.getByRole("navigation", { name: "Workspace" });
  const trigger = screen.getByRole("button", { name: "Account: alice" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const choice = await screen.findByRole("menuitemradio", { name: "System" });
  expect(choice).toHaveAttribute("aria-checked", "true");
  directory.retry();
  await waitFor(() => expect(directoryReads).toHaveBeenCalledTimes(2));
  held.resolve(json({}, 503));
  await waitFor(() =>
    expect(directory.state()).toMatchObject({ _tag: "Ready", refreshFailed: true }),
  );
  expect(screen.getByRole("navigation", { name: "Workspace" })).toBe(sidebar);
  expect(screen.getByRole("menuitemradio", { name: "System" })).toBe(choice);
  directory.retry();
  await screen.findByText("Renamed studio");
  expect(screen.getByRole("button", { name: "Account: alice" })).toBe(trigger);
  expect(screen.getByRole("menuitemradio", { name: "System" })).toBe(choice);
});
