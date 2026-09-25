import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import {
  DirectoryProvider,
  Session,
  useDirectory,
  WorkspaceFeedProvider,
  type DirectoryScope,
} from "@amends/client";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
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
it("retains shell, open popup, and appearance controls through directory refresh and recovery", async () => {
  const held = Promise.withResolvers<Response>();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(listing("Studio")))
    .mockImplementationOnce(() => held.promise)
    .mockResolvedValueOnce(json(listing("Renamed studio")));
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
              <WorkspaceFeedProvider workspaceId="one">
                <WorkspaceLayout>Content</WorkspaceLayout>
              </WorkspaceFeedProvider>
            )}
          />
        </MemoryRouter>
      </DirectoryProvider>
    </Application>
  ));
  await screen.findByText("Studio");
  const sidebar = screen.getByRole("complementary", { name: "Workspace sidebar" });
  const trigger = screen.getByRole("button", { name: "Your account: alice" });
  fireEvent.click(trigger);
  const choice = await screen.findByRole("radio", { name: "Soot" });
  fireEvent.click(choice);
  directory.retry();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  held.resolve(json({}, 503));
  await waitFor(() =>
    expect(directory.state()).toMatchObject({ _tag: "Ready", refreshFailed: true }),
  );
  expect(screen.getByRole("complementary", { name: "Workspace sidebar" })).toBe(sidebar);
  expect(screen.getByRole("radio", { name: "Soot" })).toBe(choice);
  expect(choice).toBeChecked();
  directory.retry();
  await screen.findByText("Renamed studio");
  expect(screen.getByRole("button", { name: "Your account: alice" })).toBe(trigger);
  expect(screen.getByRole("radio", { name: "Soot" })).toBe(choice);
});
