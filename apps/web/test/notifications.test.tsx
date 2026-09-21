import { Identity } from "@amends/core/identity";
import { Entry } from "@amends/core/journal";
import { Notification } from "@amends/core/notification";
import { Workspace } from "@amends/core/workspace";
import { SignIn } from "@amends/gateway/sign-in";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { DateTime, Effect, Schema } from "effect";
import { AtomRegistry, Reactivity } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "@effect/vitest";
import { ApiClient } from "../src/api/client.ts";
import { useQuery } from "../src/api/hooks.ts";
import { keys } from "../src/api/keys.ts";
import { Notifications } from "../src/api/notifications.ts";
import { QueryView } from "../src/components/query-view.tsx";
import { SessionBoundary, useSession } from "../src/session/boundary.tsx";
import { saveSession, sessionAtom } from "../src/session/session.ts";

const workspaceId = Workspace.Id.make("workspace-a");
const otherWorkspaceId = Workspace.Id.make("workspace-b");
const humanId = Identity.HumanId.make("alice");
const session = SignIn.Session.make({ token: "credential-a", humanId });
const nextSession = SignIn.Session.make({
  token: "credential-b",
  humanId: Identity.HumanId.make("bob"),
});
const record = (id = "notification", recipientId = humanId): Notification.Record => ({
  id: Notification.Id.make(id),
  workspaceId,
  source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make(id) },
  recipient: { _tag: "Human", id: recipientId },
  recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00.123Z"),
  state: { _tag: "Pending" },
});
const saved = record();
const encode = Schema.encodeSync(Notification.Record);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
const transport = vi.fn<typeof globalThis.fetch>();
const registries: AtomRegistry.AtomRegistry[] = [];
const registry = (credential = session) => {
  const store = AtomRegistry.make({ initialValues: [[sessionAtom, credential]] });
  registries.push(store);
  return store;
};
beforeEach(() => {
  localStorage.clear();
  saveSession(session);
  transport.mockReset();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  cleanup();
  registries.splice(0).forEach((store) => store.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.effect(
  "shares equivalent page requests and separates workspace, cursor, filter and page size",
  () =>
    Effect.gen(function* () {
      const delayed = Promise.withResolvers<Response>();
      transport.mockImplementation((input, init) => {
        const request = requestOf(input, init);
        const url = new URL(request.url);
        expect(request.headers.get("authorization")).toBe("Bearer credential-a");
        return url.pathname.includes("workspace-a") &&
          url.searchParams.get("limit") === "2" &&
          url.searchParams.get("pendingOnly") === "false" &&
          !url.searchParams.has("after")
          ? delayed.promise
          : Promise.resolve(response([encode(saved)]));
      });
      const store = registry();
      const first = Notifications.list(workspaceId, { limit: 2 });
      const equivalent = Notifications.list(workspaceId, { limit: 2, pendingOnly: false });
      const next = Notifications.list(workspaceId, { limit: 2, after: saved });
      expect(
        Notifications.list(workspaceId, {
          limit: 2,
          after: { id: saved.id, recordedAt: DateTime.makeUnsafe("2026-09-19T12:00:00.123Z") },
        }),
      ).toBe(next);
      expect(equivalent).toBe(first);
      const queries = [
        first,
        equivalent,
        next,
        Notifications.list(workspaceId, { limit: 2, pendingOnly: true }),
        Notifications.list(workspaceId, { limit: 1 }),
        Notifications.list(otherWorkspaceId, { limit: 2 }),
      ];
      queries.forEach((query) => store.mount(query));
      yield* Effect.promise(() => waitFor(() => expect(transport).toHaveBeenCalledTimes(5)));
      const cursorRequest = transport.mock.calls
        .map(([input, init]) => new URL(requestOf(input, init).url))
        .find((url) => url.searchParams.has("after"));
      expect(JSON.parse(cursorRequest?.searchParams.get("after") ?? "null")).toEqual({
        recordedAt: "2026-09-19T12:00:00.123Z",
        id: saved.id,
      });
      delayed.resolve(response([encode(saved)]));
      expect(yield* AtomRegistry.getResult(store, first)).toEqual([saved]);
    }),
);

it.effect(
  "invalidates inbox pages and individual records only in the selected workspace and session",
  () =>
    Effect.gen(function* () {
      const reads = new Map<string, number>();
      const requestKey = (request: Request) =>
        `${request.headers.get("authorization")} ${request.url}`;
      transport.mockImplementation(async (input, init) => {
        const request = requestOf(input, init);
        const key = requestKey(request);
        reads.set(key, (reads.get(key) ?? 0) + 1);
        return response(
          new URL(request.url).pathname.endsWith("/notification") ? encode(saved) : [encode(saved)],
        );
      });
      const store = registry();
      const otherSession = registry(nextSession);
      const pages = [
        Notifications.list(workspaceId, { limit: 10 }),
        Notifications.list(workspaceId, { limit: 10, pendingOnly: true }),
        Notifications.list(workspaceId, { limit: 10, after: saved }),
      ] as const;
      const detail = Notifications.get(workspaceId, saved.id);
      const otherWorkspace = Notifications.list(otherWorkspaceId, { limit: 10 });
      pages.forEach((query) => store.mount(query));
      store.mount(detail);
      store.mount(otherWorkspace);
      otherSession.mount(pages[0]);
      yield* Effect.promise(() => waitFor(() => expect(reads.size).toBe(6)));
      const invalidate = ApiClient.runtime.fn((changed: ReadonlyArray<string>) =>
        Reactivity.invalidate(changed),
      );
      store.mount(invalidate);
      const refresh = Effect.fnUntraced(function* (key: string) {
        store.set(invalidate, [key]);
        yield* AtomRegistry.getResult(store, invalidate, { suspendOnWaiting: true });
      });
      yield* refresh(keys.notifications.list(workspaceId));
      yield* Effect.promise(() => waitFor(() => expect(transport).toHaveBeenCalledTimes(9)));
      for (const [key, count] of reads) {
        expect(count).toBe(
          key.startsWith("Bearer credential-a") && key.includes("workspace-a/") && key.includes("?")
            ? 2
            : 1,
        );
      }
      yield* refresh(keys.notifications.get(workspaceId, saved.id));
      yield* Effect.promise(() => waitFor(() => expect(transport).toHaveBeenCalledTimes(10)));
      yield* refresh(keys.notifications.all(workspaceId));
      yield* Effect.promise(() => waitFor(() => expect(transport).toHaveBeenCalledTimes(14)));
      for (const [key, count] of reads) {
        expect(count).toBe(
          key.startsWith("Bearer credential-a") && key.includes("workspace-a/") ? 3 : 1,
        );
      }
    }),
);

it.effect("does not poll mounted notification queries as time passes", () =>
  Effect.gen(function* () {
    vi.useFakeTimers();
    transport.mockResolvedValue(response([]));
    const store = registry();
    const query = Notifications.list(workspaceId, { limit: 10 });
    store.mount(query);
    yield* Effect.promise(() => vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1)));
    yield* AtomRegistry.getResult(store, query);
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(transport).toHaveBeenCalledTimes(1);
  }),
);

function Detail() {
  const query = useQuery(() => Notifications.get(workspaceId, saved.id));
  return (
    <>
      <button onClick={query.refresh}>refresh notification</button>
      <QueryView result={query.result()} retry={query.refresh} loading="loading notification">
        {(value) => (
          <p>
            {Notification.Recipient.match(value().recipient, {
              Human: ({ id }) => id,
              Agent: ({ id }) => id,
              Contact: ({ id }) => id,
              Triage: () => "Triage",
            })}
          </p>
        )}
      </QueryView>
    </>
  );
}

it("discards notification data and in-flight reads on session replacement and sign-out", async () => {
  const delayed = Promise.withResolvers<Response>();
  let oldRequest: Request | undefined;
  let oldReads = 0;
  transport.mockImplementation((input, init) => {
    const request = requestOf(input, init);
    if (request.headers.get("authorization") === "Bearer credential-a" && ++oldReads === 2) {
      oldRequest = request;
      return delayed.promise;
    }
    return Promise.resolve(
      response(
        encode(
          record(
            "notification",
            request.headers.get("authorization") === "Bearer credential-a"
              ? humanId
              : nextSession.humanId,
          ),
        ),
      ),
    );
  });
  function Protected() {
    const scope = useSession();
    return (
      <Show when={scope.session} fallback={<p>signed out</p>}>
        <button onClick={() => scope.replace(nextSession)}>switch account</button>
        <button onClick={() => scope.replace(undefined)}>sign out</button>
        <Detail />
      </Show>
    );
  }
  render(() => (
    <SessionBoundary>
      <Protected />
    </SessionBoundary>
  ));
  await screen.findByText("alice");
  fireEvent.click(screen.getByText("refresh notification"));
  await waitFor(() => expect(oldRequest).toBeDefined());
  fireEvent.click(screen.getByText("switch account"));
  expect(screen.queryByText("alice")).toBeNull();
  await screen.findByText("bob");
  await waitFor(() => expect(oldRequest?.signal.aborted).toBe(true));
  delayed.resolve(response(encode(saved)));
  await Promise.resolve();
  expect(screen.queryByText("alice")).toBeNull();
  fireEvent.click(screen.getByText("sign out"));
  await screen.findByText("signed out");
  expect(screen.queryByText("bob")).toBeNull();
  expect(localStorage.getItem("amends.session")).toBeNull();
  expect(transport).toHaveBeenCalledTimes(3);
});

it("suppresses a cached notification when a refresh returns NotFound", async () => {
  let missing = false;
  transport.mockImplementation(async () =>
    missing
      ? response(
          { _tag: "NotificationApplication.NotFound", workspaceId, notificationId: saved.id },
          404,
        )
      : response(encode(saved)),
  );
  render(() => (
    <SessionBoundary>
      <Detail />
    </SessionBoundary>
  ));
  await screen.findByText("alice");
  missing = true;
  fireEvent.click(screen.getByText("refresh notification"));
  await screen.findByText("This notification is no longer available.");
  expect(screen.queryByText("alice")).toBeNull();
  expect(screen.queryByText(/Showing saved data/)).toBeNull();
});
