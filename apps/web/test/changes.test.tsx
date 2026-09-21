import { ChangeFeed } from "@amends/core/change-feed";
import { Identity } from "@amends/core/identity";
import { Commit, Entry, Event } from "@amends/core/journal";
import { Notification } from "@amends/core/notification";
import { InvitationFacts, Member, MemberFacts, Workspace } from "@amends/core/workspace";
import { SignIn } from "@amends/gateway/sign-in";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { DateTime, Effect, Schema } from "effect";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import { createSignal, Show } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "@effect/vitest";
import { Changes } from "../src/api/changes.ts";
import { useQuery } from "../src/api/hooks.ts";
import { keys } from "../src/api/keys.ts";
import { Members } from "../src/api/members.ts";
import { Notifications } from "../src/api/notifications.ts";
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
const recordedAt = DateTime.makeUnsafe("2026-09-20T12:00:00.123Z");
const member: Member.Record = {
  id: Member.Id.make("member"),
  workspaceId,
  identity: { _tag: "Human", id: humanId },
  status: "active",
};
const notification: Notification.Record = {
  id: Notification.Id.make("notification"),
  workspaceId,
  source: { logId: Entry.LogId.make("journal"), entryId: Entry.Id.make("source") },
  recipient: member.identity,
  recordedAt,
  state: { _tag: "Pending" },
};
const changed = (
  name: string = MemberFacts.Added.name,
  payload: Schema.Json = { workspaceId, memberId: member.id, identity: member.identity },
  version = 1,
): ChangeFeed.Message => ({
  _tag: "Committed",
  workspaceId,
  commitId: Commit.Id.make("commit"),
  events: [
    {
      id: Entry.Id.make("entry"),
      name,
      version,
      recordedAt,
      provenance: {
        workspaceId,
        performedBy: { _tag: "Identity", identity: member.identity },
        causedBy: null,
        correlationId: Event.CorrelationId.make("test"),
        occurredAt: recordedAt,
      },
      payload,
    },
  ],
});
const encodeMessage = Schema.encodeSync(ChangeFeed.Message);
const encodeMember = Schema.encodeSync(Member.Record);
const encodeNotification = Schema.encodeSync(Notification.Record);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
const transport = vi.fn<typeof globalThis.fetch>();
const registries: AtomRegistry.AtomRegistry[] = [];
const registry = (credential = session) => {
  const value = AtomRegistry.make({ initialValues: [[sessionAtom, credential]] });
  registries.push(value);
  return value;
};
type Connection = {
  request: Request;
  send: (message: ChangeFeed.Message) => void;
  end: () => void;
  cancelled: boolean;
};
const connections: Connection[] = [];
const reads = new Map<string, number>();
const keyOf = (request: Request) =>
  `${request.headers.get("authorization")} ${new URL(request.url).pathname}`;
const installTransport = () =>
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/changes")) {
      let connection: Connection;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          connection = {
            request,
            cancelled: false,
            send: (message) =>
              controller.enqueue(
                new TextEncoder().encode(
                  `event: message\ndata: ${JSON.stringify(encodeMessage(message))}\n\n`,
                ),
              ),
            end: () => controller.close(),
          };
          connections.push(connection);
        },
        cancel() {
          connection.cancelled = true;
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    }
    const key = keyOf(request);
    reads.set(key, (reads.get(key) ?? 0) + 1);
    if (path.endsWith("/members")) return response([encodeMember(member)]);
    if (path.endsWith("/members/member")) return response(encodeMember(member));
    if (path.endsWith("/notifications/notification"))
      return response(encodeNotification(notification));
    if (path.endsWith("/me/workspaces")) return response({ memberships: [], invitations: [] });
    return response([encodeNotification(notification)]);
  });
const count = (path: string, token = session.token) =>
  reads.get(`Bearer ${token} /api${path}`) ?? 0;
const connect = Effect.fnUntraced(function* (store: AtomRegistry.AtomRegistry, id = workspaceId) {
  const index = connections.length;
  const unmount = store.mount(Changes.watch(id));
  yield* Effect.promise(() => waitFor(() => expect(connections.length).toBe(index + 1)));
  const connection = connections[index]!;
  connection.send({ _tag: "Ready", workspaceId: id });
  yield* AtomRegistry.getResult(store, Changes.watch(id));
  return { connection, unmount };
});
beforeEach(() => {
  localStorage.clear();
  saveSession(session);
  reads.clear();
  connections.length = 0;
  transport.mockReset();
  vi.stubGlobal("fetch", transport);
  installTransport();
});
afterEach(() => {
  cleanup();
  registries.splice(0).forEach((store) => store.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("maps facts to frontend keys, deduplicates commits and falls back for new versions or malformed payloads", () => {
  const message = changed();
  if (message._tag !== "Committed") throw new Error("Expected commit");
  const expected = [
    keys.members.list(workspaceId),
    keys.members.get(workspaceId, member.id),
    keys.ownership(workspaceId),
    keys.me.workspaces,
  ];
  expect(Changes.invalidationKeys(message)).toEqual(expected);
  expect(
    Changes.invalidationKeys({ ...message, events: [message.events[0], message.events[0]] }),
  ).toEqual(expected);
  expect(Changes.invalidationKeys(changed(InvitationFacts.Issued.name))).toEqual([
    keys.invitations.list(workspaceId),
    keys.me.workspaces,
  ]);
  for (const input of [
    changed("future.changed"),
    changed(MemberFacts.Added.name, {}, 2),
    changed(MemberFacts.Added.name, {}),
    { _tag: "Ready", workspaceId } as const,
  ]) {
    expect(Changes.invalidationKeys(input)).toEqual([
      keys.workspace(workspaceId),
      keys.me.workspaces,
    ]);
  }
});

it.effect(
  "Ready refreshes mounted workspace list and detail queries, while commits refresh the relevant views",
  () =>
    Effect.gen(function* () {
      const store = registry();
      const otherSession = registry(nextSession);
      const list = Notifications.list(workspaceId, { limit: 10 });
      const detail = Notifications.get(workspaceId, notification.id);
      const members = Members.list(workspaceId);
      const memberDetail = Members.get(workspaceId, member.id);
      const other = Notifications.list(otherWorkspaceId, { limit: 10 });
      store.mount(list);
      store.mount(detail);
      store.mount(members);
      store.mount(memberDetail);
      store.mount(other);
      otherSession.mount(list);
      yield* Effect.all([
        AtomRegistry.getResult(store, list),
        AtomRegistry.getResult(store, detail),
        AtomRegistry.getResult(store, members),
        AtomRegistry.getResult(store, memberDetail),
        AtomRegistry.getResult(store, other),
        AtomRegistry.getResult(otherSession, list),
      ]);
      const { connection } = yield* connect(store);
      yield* Effect.promise(() =>
        waitFor(() => expect(count("/workspaces/workspace-a/notifications/notification")).toBe(2)),
      );
      expect(count("/workspaces/workspace-a/notifications")).toBe(2);
      expect(count("/workspaces/workspace-b/notifications")).toBe(1);
      expect(count("/workspaces/workspace-a/notifications", nextSession.token)).toBe(1);
      expect(connection.request.headers.get("authorization")).toBe("Bearer credential-a");
      expect(connection.request.headers.has("last-event-id")).toBe(false);
      connection.send(changed());
      yield* Effect.promise(() =>
        waitFor(() => expect(count("/workspaces/workspace-a/members/member")).toBe(3)),
      );
      expect(count("/workspaces/workspace-a/members")).toBe(3);
      expect(count("/workspaces/workspace-a/notifications")).toBe(2);
      connection.send(changed("future.changed"));
      yield* Effect.promise(() =>
        waitFor(() => expect(count("/workspaces/workspace-a/notifications")).toBe(3)),
      );
    }),
);

it.effect(
  "reconnects after EOF and refreshes missed changes on Ready, sharing one stream per workspace",
  () =>
    Effect.gen(function* () {
      const store = registry();
      const query = Notifications.list(workspaceId, { limit: 10 });
      store.mount(query);
      yield* AtomRegistry.getResult(store, query);
      const { connection } = yield* connect(store);
      store.mount(Changes.watch(workspaceId));
      yield* Effect.promise(() =>
        waitFor(() => expect(count("/workspaces/workspace-a/notifications")).toBe(2)),
      );
      expect(connections).toHaveLength(1);
      connection.end();
      yield* Effect.promise(() =>
        waitFor(() => expect(connections).toHaveLength(2), { timeout: 3000 }),
      );
      expect(count("/workspaces/workspace-a/notifications")).toBe(2);
      connections[1]!.send({ _tag: "Ready", workspaceId });
      yield* Effect.promise(() =>
        waitFor(() => expect(count("/workspaces/workspace-a/notifications")).toBe(3)),
      );
    }),
);

it.effect("keeps mounted queries unchanged as time passes while the stream is open", () =>
  Effect.gen(function* () {
    vi.useFakeTimers();
    const store = registry();
    const query = Notifications.list(workspaceId, { limit: 10 });
    store.mount(query);
    store.mount(Changes.watch(workspaceId));
    yield* Effect.promise(() => vi.waitFor(() => expect(connections).toHaveLength(1)));
    yield* AtomRegistry.getResult(store, query);
    connections[0]!.send({ _tag: "Ready", workspaceId });
    yield* Effect.promise(() =>
      vi.waitFor(() => expect(count("/workspaces/workspace-a/notifications")).toBe(2)),
    );
    yield* Effect.promise(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(connections).toHaveLength(1);
    expect(count("/workspaces/workspace-a/notifications")).toBe(2);
  }),
);

it.each([
  [401, { _tag: "Api.Unauthorized" }],
  [403, { _tag: "Gateway.NotMember", workspaceId }],
] as const)("stops reconnecting after an authorization response (%s)", async (status, body) => {
  vi.useFakeTimers();
  transport.mockResolvedValue(response(body, status));
  const store = registry();
  const atom = Changes.watch(workspaceId);
  store.mount(atom);
  await vi.waitFor(() => expect(AsyncResult.isFailure(store.get(atom))).toBe(true));
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("closes streams on workspace switches, session replacement and sign-out", async () => {
  function Protected() {
    const sessionScope = useSession();
    const [selected, setSelected] = createSignal(workspaceId);
    function Watch() {
      useQuery(() => Changes.watch(selected()));
      return <p>watching</p>;
    }
    return (
      <Show when={sessionScope.session} fallback={<p>signed out</p>}>
        <button onClick={() => setSelected(otherWorkspaceId)}>switch workspace</button>
        <button onClick={() => sessionScope.replace(nextSession)}>switch session</button>
        <button onClick={() => sessionScope.replace(undefined)}>sign out</button>
        <Watch />
      </Show>
    );
  }
  render(() => (
    <SessionBoundary>
      <Protected />
    </SessionBoundary>
  ));
  await waitFor(() => expect(connections).toHaveLength(1));
  connections[0]!.send({ _tag: "Ready", workspaceId });
  fireEvent.click(screen.getByText("switch workspace"));
  await waitFor(() => expect(connections).toHaveLength(2));
  await waitFor(() => expect(connections[0]!.cancelled).toBe(true));
  expect(connections[1]!.request.url).toContain(otherWorkspaceId);
  connections[1]!.send({ _tag: "Ready", workspaceId: otherWorkspaceId });
  fireEvent.click(screen.getByText("switch session"));
  await waitFor(() => expect(connections).toHaveLength(3));
  await waitFor(() => expect(connections[1]!.cancelled).toBe(true));
  expect(connections[2]!.request.headers.get("authorization")).toBe("Bearer credential-b");
  fireEvent.click(screen.getByText("sign out"));
  await screen.findByText("signed out");
  await waitFor(() => expect(connections[2]!.cancelled).toBe(true));
});

it.effect("rejects a message for a different workspace before invalidating anything", () =>
  Effect.gen(function* () {
    const store = registry();
    const query = Notifications.list(otherWorkspaceId, { limit: 10 });
    store.mount(query);
    yield* AtomRegistry.getResult(store, query);
    const { connection, unmount } = yield* connect(store);
    connection.send({ _tag: "Ready", workspaceId: otherWorkspaceId });
    yield* Effect.promise(() => waitFor(() => expect(connection.cancelled).toBe(true)));
    expect(count("/workspaces/workspace-b/notifications")).toBe(1);
    unmount();
  }),
);
