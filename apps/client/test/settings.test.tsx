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
