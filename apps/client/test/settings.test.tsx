import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useWorkspaceSettings,
  type WorkspaceSettingsView,
  type SessionStore,
} from "../src/index.ts";
afterEach(cleanup);
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
const owner = {
  id: "owner",
  workspaceId: "one",
  identity: { _tag: "Human", id: "alice" },
  name: "alice",
  status: "active",
};
for (const replacement of [false, true])
  it(`cancels pending settings when ${replacement ? "credentials change" : "the feature unmounts"}`, async () => {
    const [shown, setShown] = createSignal(true);
    let session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" }),
      view!: WorkspaceSettingsView;
    const listeners = new Set<() => void>();
    const store: SessionStore = {
      read: () => session,
      write: () => {},
      subscribe: (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    };
    const held = Promise.withResolvers<Response>();
    let mutation: Request | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
      const request = new Request(input, init),
        path = new URL(request.url).pathname;
      if (request.method === "PUT") {
        mutation = request;
        return held.promise;
      }
      if (path.endsWith("/settings"))
        return Promise.resolve(
          json({
            workspace,
            canRename: true,
            canReadInvitations: true,
            canInvite: true,
            roles: [],
          }),
        );
      if (path.endsWith("/ownership"))
        return Promise.resolve(
          json({ workspace, owner, ownerAssignmentId: "grant", canTransfer: true, candidates: [] }),
        );
      return Promise.resolve(json({ memberships: [], invitations: [] }));
    });
    function Consumer() {
      view = useWorkspaceSettings("one", "workspace");
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
          <Show when={shown()}>
            <Consumer />
          </Show>
        </DirectoryProvider>
      </ClientProvider>
    ));
    await waitFor(() => expect(view.workspace()?.name).toBe("Studio"));
    const previous = view;
    view.rename.setName("Updated");
    view.rename.save();
    view.rename.setName("Duplicate");
    view.rename.save();
    await waitFor(() => expect(mutation).toBeDefined());
    expect(await mutation!.clone().json()).toEqual({ name: "Updated", expectedName: "Studio" });
    expect(
      fetch.mock.calls.filter(([input, init]) => new Request(input, init).method === "PUT"),
    ).toHaveLength(1);
    if (replacement) {
      session = Schema.decodeSync(Session)({ token: "bob", identity: "bob" });
      listeners.forEach((fn) => fn());
    } else setShown(false);
    await waitFor(() => expect(mutation!.signal.aborted).toBe(true));
    held.resolve(json({ ...workspace, name: "Updated" }));
    previous.rename.setName("After cleanup");
    previous.rename.save();
    expect(previous.workspace()?.name).toBe("Studio");
    expect(
      fetch.mock.calls.filter(([input, init]) => new Request(input, init).method === "PUT"),
    ).toHaveLength(1);
  });

it("retries at once after a failed request or invalid input, and waits for a refresh after a conflict", async () => {
  const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
  const puts: Array<Request> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    if (request.method === "PUT") {
      puts.push(request);
      return Promise.resolve(
        puts.length === 1
          ? new Response("Host unavailable", { status: 503 })
          : new Response(
              JSON.stringify({ _tag: "WorkspaceSettings.Changed", workspaceId: "one" }),
              {
                status: 409,
                headers: { "content-type": "application/json" },
              },
            ),
      );
    }
    if (path.endsWith("/settings"))
      return Promise.resolve(
        json({ workspace, canRename: true, canReadInvitations: true, canInvite: true, roles: [] }),
      );
    if (path.endsWith("/ownership"))
      return Promise.resolve(
        json({ workspace, owner, ownerAssignmentId: "grant", canTransfer: true, candidates: [] }),
      );
    return Promise.resolve(json({ memberships: [], invitations: [] }));
  });
  let view!: WorkspaceSettingsView;
  function Consumer() {
    view = useWorkspaceSettings("one", "workspace");
    return null;
  }
  render(() => (
    <ClientProvider
      apiBaseUrl="https://host.test"
      sessionStore={{ read: () => session, write: () => {}, subscribe: () => () => {} }}
      transport={FetchHttpClient.layer.pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      )}
    >
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  await waitFor(() => expect(view.workspace()?.name).toBe("Studio"));
  // A host failure leaves the values current: the same edit can be sent again at once.
  view.rename.setName("Atelier");
  view.rename.save();
  await waitFor(() => expect(view.failure()).toEqual({ action: "rename", error: "failed" }));
  expect(view.stale()).toBe(false);
  // Invalid input fails before any request and does not lock either.
  view.remove("");
  await waitFor(() => expect(view.failure()).toEqual({ action: "remove", error: "invalid" }));
  expect(view.stale()).toBe(false);
  expect(puts).toHaveLength(1);
  // A conflict means the values are out of date: edits wait for an explicit refresh.
  view.rename.save();
  await waitFor(() => expect(view.failure()).toEqual({ action: "rename", error: "changed" }));
  expect(view.stale()).toBe(true);
  view.rename.setName("Again");
  view.rename.save();
  expect(puts).toHaveLength(2);
  view.refresh();
  await waitFor(() => expect(view.stale()).toBe(false));
  expect(view.failure()).toBeUndefined();
  // The draft survives the refresh, made against the name now shown.
  expect(view.rename.name()).toBe("Again");
});
