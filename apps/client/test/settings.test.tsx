import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useSettings,
  type SettingsController,
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
  status: "active",
};
for (const replacement of [false, true])
  it(`cancels pending settings when ${replacement ? "credentials change" : "the feature unmounts"}`, async () => {
    const [shown, setShown] = createSignal(true);
    let session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" }),
      controller!: SettingsController;
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
      controller = useSettings("one", "workspace");
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
    await waitFor(() => expect(controller.data()?.settings.workspace.name).toBe("Studio"));
    const previous = controller;
    controller.send({ kind: "rename", name: "Updated", expectedName: "Studio" });
    controller.send({ kind: "rename", name: "Duplicate", expectedName: "Studio" });
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
    previous.send({ kind: "rename", name: "After cleanup", expectedName: "Studio" });
    expect(previous.data()?.settings.workspace.name).toBe("Studio");
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
  let controller!: SettingsController;
  function Consumer() {
    controller = useSettings("one", "workspace");
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
  await waitFor(() => expect(controller.data()?.settings.workspace.name).toBe("Studio"));
  // A host failure leaves the values current: the same edit can be sent again at once.
  controller.send({ kind: "rename", name: "Atelier", expectedName: "Studio" });
  await waitFor(() => expect(controller.error()).toBe("failed"));
  expect(controller.needsRefresh()).toBe(false);
  // Invalid input fails before any request and does not lock either.
  controller.send({ kind: "remove", memberId: "" });
  await waitFor(() => expect(controller.error()).toBe("invalid"));
  expect(controller.needsRefresh()).toBe(false);
  expect(puts).toHaveLength(1);
  // A conflict means the values are out of date: edits wait for an explicit refresh.
  controller.send({ kind: "rename", name: "Atelier", expectedName: "Studio" });
  await waitFor(() => expect(controller.error()).toBe("changed"));
  expect(controller.needsRefresh()).toBe(true);
  controller.send({ kind: "rename", name: "Again", expectedName: "Studio" });
  expect(puts).toHaveLength(2);
  controller.refresh();
  await waitFor(() => expect(controller.needsRefresh()).toBe(false));
  expect(controller.error()).toBeUndefined();
  expect(controller.revision()).toBe(1);
});
