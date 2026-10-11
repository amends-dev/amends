import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useCreateWorkspace,
  suggestedName,
  useDirectory,
  type CreateWorkspaceController,
  type DirectoryScope,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const workspace = { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" };
const listing = {
  memberships: [
    {
      workspace,
      member: {
        id: "owner",
        workspaceId: "one",
        identity: { _tag: "Human", id: "alice" },
        name: "alice",
        status: "active",
      },
      people: 1,
    },
  ],
  invitations: [],
};
function fixture() {
  const calls: Array<{ request: Request; resolve: (value: Response) => void }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const deferred = Promise.withResolvers<Response>();
    calls.push({ request: new Request(input, init), resolve: deferred.resolve });
    return deferred.promise;
  });
  let stored: Session | undefined = Schema.decodeSync(Session)({
    token: "alice",
    account: { id: "alice", email: "alice@example.com" },
  });
  const listeners = new Set<() => void>();
  const store: SessionStore = {
    read: () => stored,
    write: (value) => {
      stored = value;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const [shown, setShown] = createSignal(true);
  let controller!: CreateWorkspaceController;
  let directory!: DirectoryScope;
  function Consumer() {
    controller = useCreateWorkspace();
    return null;
  }
  function Directory() {
    directory = useDirectory();
    return (
      <Show when={shown()}>
        <Consumer />
      </Show>
    );
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
        <Directory />
      </DirectoryProvider>
    </ClientProvider>
  ));
  const at = async (index: number) => {
    await waitFor(() => expect(calls.length).toBeGreaterThan(index));
    return calls[index]!;
  };
  return {
    calls,
    at,
    store,
    get controller() {
      return controller;
    },
    get directory() {
      return directory;
    },
    hide: () => setShown(false),
    replace: () => {
      stored = Schema.decodeSync(Session)({
        token: "bob",
        account: { id: "bob", email: "bob@example.com" },
      });
      listeners.forEach((fn) => fn());
    },
    ready: async () => {
      (await at(0)).resolve(json({ memberships: [], invitations: [] }));
      await waitFor(() => expect(directory.state()._tag).toBe("Ready"));
      controller.setMemberName("Alice");
    },
  };
}
it("validates and trims the name, blocks duplicate submissions, and refreshes before readiness", async () => {
  const f = fixture();
  await f.ready();
  f.controller.submit("  ");
  expect(f.controller.state()).toMatchObject({ error: "invalid-name" });
  expect(f.calls).toHaveLength(1);
  f.controller.submit("  Studio  ");
  f.controller.submit("Other");
  f.controller.setName("ignored");
  const creation = await f.at(1);
  expect(creation.request.method).toBe("POST");
  expect(await creation.request.json()).toEqual({ name: "Studio", memberName: "Alice" });
  expect(creation.request.headers.get("authorization")).toBe("Bearer alice");
  expect(creation.request.headers.get("idempotency-key")).toBeTruthy();
  creation.resolve(json(workspace, 201));
  const refresh = await f.at(2);
  expect(f.controller.state()).toMatchObject({ _tag: "Created", pending: true });
  expect(f.directory.state()).toMatchObject({ _tag: "Ready", refreshing: true });
  refresh.resolve(json(listing));
  await waitFor(() => expect(f.controller.state()).toMatchObject({ _tag: "Ready", workspace }));
  expect(f.directory.state()).toMatchObject({ listing: { memberships: [{ workspace }] } });
  expect(f.calls).toHaveLength(3);
});
it("requires the creator's name, sends it trimmed, and a new key when it changes", async () => {
  const f = fixture();
  await f.ready();
  f.controller.setMemberName("   ");
  f.controller.submit("Studio");
  expect(f.controller.state()).toMatchObject({ error: "invalid-member-name" });
  f.controller.setMemberName("x".repeat(81));
  f.controller.submit("Studio");
  expect(f.controller.state()).toMatchObject({ error: "invalid-member-name" });
  expect(f.calls).toHaveLength(1);
  f.controller.setMemberName("  Alice Liddell  ");
  f.controller.submit("Studio");
  const first = await f.at(1);
  expect(await first.request.json()).toEqual({ name: "Studio", memberName: "Alice Liddell" });
  first.resolve(json({}, 503));
  await waitFor(() => expect(f.controller.state()).toMatchObject({ error: "request-failed" }));
  f.controller.setMemberName("Alice");
  f.controller.submit();
  const second = await f.at(2);
  expect(await second.request.json()).toEqual({ name: "Studio", memberName: "Alice" });
  expect(second.request.headers.get("idempotency-key")).not.toBe(
    first.request.headers.get("idempotency-key"),
  );
});
it("reuses the creation key after an uncertain response and changes it for a new submitted name", async () => {
  const f = fixture();
  await f.ready();
  f.controller.submit("Studio");
  const first = await f.at(1);
  first.resolve(json({}, 503));
  await waitFor(() => expect(f.controller.state()).toMatchObject({ error: "request-failed" }));
  f.controller.submit();
  const retry = await f.at(2);
  expect(retry.request.headers.get("idempotency-key")).toBe(
    first.request.headers.get("idempotency-key"),
  );
  retry.resolve(json({}, 503));
  await waitFor(() => expect(f.controller.state()).toMatchObject({ pending: false }));
  f.controller.submit("Other");
  expect((await f.at(3)).request.headers.get("idempotency-key")).not.toBe(
    first.request.headers.get("idempotency-key"),
  );
});
it("retries only the directory after creation succeeds, retaining the validated page and result", async () => {
  const f = fixture();
  await f.ready();
  f.controller.submit("Studio");
  (await f.at(1)).resolve(json(workspace, 201));
  (await f.at(2)).resolve(json({}, 503));
  await waitFor(() =>
    expect(f.controller.state()).toMatchObject({
      _tag: "Created",
      pending: false,
      refreshFailed: true,
    }),
  );
  expect(f.directory.state()).toMatchObject({ _tag: "Ready", refreshFailed: true });
  f.controller.submit("Duplicate");
  f.controller.retryRefresh();
  f.controller.retryRefresh();
  const retry = await f.at(3);
  expect(retry.request.method).toBe("GET");
  retry.resolve(json(listing));
  await waitFor(() => expect(f.controller.state()._tag).toBe("Ready"));
  expect(f.calls.filter((c) => c.request.method === "POST")).toHaveLength(1);
});
it("clears rejected credentials on creation", async () => {
  const f = fixture();
  await f.ready();
  f.controller.submit("Studio");
  (await f.at(1)).resolve(json({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401));
  await waitFor(() => expect(f.store.read()).toBeUndefined());
});
it.each(["hide", "replace"] as const)("ignores late creation after %s", async (action) => {
  const f = fixture();
  await f.ready();
  const old = f.controller;
  old.submit("Studio");
  const request = await f.at(1);
  f[action]();
  await waitFor(() => expect(request.request.signal.aborted).toBe(true));
  request.resolve(json(workspace, 201));
  old.submit("Obsolete");
  old.retryRefresh();
  expect(old.state()._tag).toBe("Form");
  if (action === "replace") expect(f.store.read()?.token).toBe("bob");
});
it("suggests a name from an email identity, and none from anything else", () => {
  expect(suggestedName("ada.lovelace@example.com")).toBe("Ada Lovelace");
  expect(suggestedName("jo_mercer+work@example.com")).toBe("Jo Mercer Work");
  expect(suggestedName("alice")).toBe("");
  expect(suggestedName(undefined)).toBe("");
  expect(suggestedName(`${"a".repeat(81)}@example.com`)).toBe("");
});
