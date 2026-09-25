import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useSession,
  useSettings,
  type SessionScope,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejected = () => json({ _tag: "Api.Unauthorized", message: "Unauthorized" }, 401);
const session = (token: string) => Schema.decodeSync(Session)({ token, identity: token });
const listing = { memberships: [], invitations: [] };

function mount(fetch: typeof globalThis.fetch, stored: { value: Session | undefined }) {
  const store: SessionStore = {
    read: () => stored.value,
    write: (next) => {
      stored.value = next;
    },
    subscribe: () => () => {},
  };
  let scope!: SessionScope;
  function Consumer() {
    scope = useSession();
    useSettings("one", "workspace");
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
        <Consumer />
      </DirectoryProvider>
    </ClientProvider>
  ));
  return {
    get scope() {
      return scope;
    },
  };
}

it("signs out when any request is rejected, without the operation handling it", async () => {
  const stored = { value: session("alice") as Session | undefined };
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    return Promise.resolve(path.endsWith("/settings") ? rejected() : json(listing));
  });
  const mounted = mount(fetch, stored);
  await waitFor(() => expect(stored.value).toBeUndefined());
  expect(mounted.scope.session).toBeUndefined();
});

it("keeps a newer credential another window stored when an older one is rejected", async () => {
  const stored = { value: session("alice") as Session | undefined };
  const held = Promise.withResolvers<Response>();
  let first = true;
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/me/workspaces" && first) {
      first = false;
      expect(request.headers.get("authorization")).toBe("Bearer alice");
      return held.promise;
    }
    return Promise.resolve(json(listing));
  });
  const mounted = mount(fetch, stored);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  // Another window signs in before this one hears about it, then the old token is rejected.
  stored.value = session("bob");
  held.resolve(rejected());
  await waitFor(() => expect(mounted.scope.session?.token).toBe("bob"));
  expect(stored.value?.token).toBe("bob");
  // The adopted credential validates on its own.
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([input, init]) => new Request(input, init).headers.get("authorization") === "Bearer bob",
      ),
    ).toBe(true),
  );
});
