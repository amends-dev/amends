import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useDirectory,
  useSession,
  useWorkspace,
  type SessionStore,
} from "../src/index.ts";

const alice = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function mount(credential: Session | undefined, fetch: typeof globalThis.fetch) {
  let stored = credential;
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
  function Consumer() {
    const directory = useDirectory();
    const scope = useSession();
    const workspace = useWorkspace(() => "one");
    return (
      <>
        <output aria-label="State">{directory.state()._tag}</output>
        <output aria-label="Workspace">{workspace()?.workspace.name ?? "none"}</output>
        <button onClick={directory.retry}>Retry</button>
        <button onClick={scope.signOut}>Clear</button>
      </>
    );
  }
  render(() => (
    <ClientProvider apiBaseUrl="https://host.test" sessionStore={store} transport={transport}>
      <DirectoryProvider>
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  return store;
}
afterEach(cleanup);
it("exposes signed-out state without requesting a directory", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  mount(undefined, fetch);
  expect(screen.getByLabelText("State")).toHaveTextContent("SignedOut");
  expect(fetch).not.toHaveBeenCalled();
});
it("exposes loading and decoded directory state without a router or UI package", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetch = vi.fn<typeof globalThis.fetch>(() => pending.promise);
  mount(alice, fetch);
  expect(screen.getByLabelText("State")).toHaveTextContent("Loading");
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer alice");
  pending.resolve(
    response({
      memberships: [
        {
          workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
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
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("State")).toHaveTextContent("Ready"));
  expect(screen.getByLabelText("Workspace")).toHaveTextContent("Studio");
});
it("retains credentials after a host failure and exposes retry to the consumer", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValueOnce(response({ memberships: [], invitations: [] }));
  const store = mount(alice, fetch);
  await waitFor(() => expect(screen.getByLabelText("State")).toHaveTextContent("Failed"));
  expect(store.read()).toEqual(alice);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByLabelText("State")).toHaveTextContent("Ready"));
});
it("invalidates rejected credentials without selecting a route or showing a page", async () => {
  const store = mount(alice, () =>
    Promise.resolve(response({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401)),
  );
  await waitFor(() => expect(screen.getByLabelText("State")).toHaveTextContent("SignedOut"));
  expect(store.read()).toBeUndefined();
});
