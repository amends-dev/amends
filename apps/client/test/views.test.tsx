import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useGroupConversation,
  useGroupMembers,
  useGroupPeople,
  useMentionCandidates,
  useThreadConversation,
  useWorkspaceGroups,
  useWorkspacePeople,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };
const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 12, minute)).toISOString();

const member = (id: string, identity: { _tag: string; id: string }, name?: string) => ({
  id,
  workspaceId: "one",
  identity,
  status: "active",
  ...(name ? { name } : {}),
});
const members = [
  member("owner", { _tag: "Human", id: "alice" }, "Alice"),
  member("ada", { _tag: "Human", id: "ada@example.test" }),
  member("scout", { _tag: "Agent", id: "scout" }, "Scout"),
];
const listing = {
  memberships: [
    {
      workspace: { id: "one", name: "Studio", createdBy: "alice", ownerMemberId: "owner" },
      member: members[0],
      people: 3,
    },
  ],
  invitations: [],
};
const listItem = (group: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  group,
  latestActivityAt: null,
  caughtUpAt: null,
  newActivity: false,
  following: false,
  pending: 0,
  manageable: true,
  membersRemovable: true,
  renamable: true,
  ...extra,
});
const groups = [
  listItem(
    {
      id: "g1",
      workspaceId: "one",
      kind: "Team",
      visibility: "Public",
      name: "Design",
      createdBy: "owner",
      createdAt: at(0),
    },
    { pending: 2, following: true },
  ),
  listItem({
    id: "g2",
    workspaceId: "one",
    kind: "Direct",
    memberIds: ["ada", "owner"],
    createdBy: "owner",
    createdAt: at(0),
  }),
];
const author = (memberId: string) => ({ _tag: "Member", memberId });
const message = (
  id: string,
  threadId: string,
  by: string,
  text: string,
  mentions: string[] = [],
) => ({
  id,
  workspaceId: "one",
  threadId,
  author: author(by),
  text,
  mentions,
  publishedAt: at(1),
});
const openings = [
  {
    thread: {
      id: "t1",
      workspaceId: "one",
      groupId: "g1",
      createdBy: author("ada"),
      createdAt: at(1),
    },
    message: message("m1", "t1", "ada", "Can [@Scout](member:scout) check the terms?", ["scout"]),
    replies: 2,
    latest: { threadId: "t1", sequence: 3, occurredAt: at(3) },
    readThrough: 1,
    unread: true,
  },
];
const activity = (sequence: number, kind: string, subject: string, details: unknown) => ({
  id: `activity-${sequence}`,
  workspaceId: "one",
  threadId: "t1",
  sequence,
  occurredAt: at(sequence),
  kind,
  subject,
  occurrence: subject,
  newActivity: true,
  details,
});
const participant = (id: string, memberId: string) => ({
  id,
  workspaceId: "one",
  threadId: "t1",
  participant: { _tag: "Member", memberId },
  joinedAt: at(1),
  joinedAtSequence: 1,
});
const timeline = [
  {
    activity: activity(1, "message.published", "message:m1", { messageId: "m1" }),
    message: message("m1", "t1", "ada", "Can [@Scout](member:scout) check the terms?", ["scout"]),
  },
  {
    activity: activity(2, "participation.followed", "thread-participation:p1", {
      participationId: "p1",
    }),
    participant: participant("p1", "owner"),
  },
  {
    activity: activity(3, "participation.ended", "thread-participation:p2", {
      participationId: "p2",
      reason: "group-left",
    }),
    participant: participant("p2", "ada"),
  },
  {
    activity: activity(4, "message.published", "message:m2", { messageId: "m2" }),
    message: message("m2", "t1", "scout", "All clear."),
  },
];
const roster = ["owner", "ada"].map((memberId, index) => ({
  id: `a${index}`,
  workspaceId: "one",
  groupId: "g1",
  memberId,
  admittedAt: at(0),
  status: "active",
}));

function fixture(options: { readonly stream?: () => Response } = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/me/workspaces") return Promise.resolve(json(listing));
    if (path === "/workspaces/one/members") return Promise.resolve(json(members));
    if (path === "/workspaces/one/groups") return Promise.resolve(json(groups));
    if (path === "/workspaces/one/groups/g1/members") return Promise.resolve(json(roster));
    if (path === "/workspaces/one/groups/g1/openings")
      return Promise.resolve(options.stream?.() ?? json(openings));
    if (path === "/workspaces/one/threads/t1/timeline") return Promise.resolve(json(timeline));
    return Promise.resolve(json({}, 404));
  });
  const [focus, setFocus] = createSignal<number>();
  const views = {} as {
    groups: ReturnType<typeof useWorkspaceGroups>;
    stream: ReturnType<typeof useGroupConversation>;
    thread: ReturnType<typeof useThreadConversation>;
    candidates: ReturnType<typeof useMentionCandidates>;
    people: ReturnType<typeof useGroupPeople>;
    workspace: ReturnType<typeof useWorkspacePeople>;
  };
  function Consumer() {
    views.groups = useWorkspaceGroups("one");
    views.stream = useGroupConversation("one", "g1");
    views.thread = useThreadConversation("one", "t1", focus);
    views.candidates = useMentionCandidates("one", "g1");
    views.people = useGroupPeople("one", useGroupMembers("one", "g1"));
    views.workspace = useWorkspacePeople("one");
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
  return { views, fetch, setFocus };
}

it("names teams by name and direct groups by their other people", async () => {
  const { views } = fixture();
  await waitFor(() => expect(views.groups.all()).toHaveLength(2));
  await waitFor(() => expect(views.groups.directs()[0]?.name).toBe("ada@example.test"));
  expect(views.groups.teams()).toEqual([
    expect.objectContaining({
      id: "g1",
      kind: "team",
      name: "Design",
      visibility: "public",
      pending: 2,
    }),
  ]);
  expect(views.groups.directs()[0]).toMatchObject({ id: "g2", kind: "direct", memberIds: ["ada"] });
  expect(views.groups.directWith(["ada"])?.id).toBe("g2");
  expect(views.groups.directWith(["ada", "scout"])).toBeUndefined();
});

it("shows a group's threads with their authors, mentions, and replies", async () => {
  const { views } = fixture();
  expect(views.stream.status()).toBe("loading");
  await waitFor(() => expect(views.stream.entries()).toHaveLength(1));
  await waitFor(() => expect(views.stream.entries()[0]?.author.name).toBe("ada@example.test"));
  expect(views.stream.status()).toBeUndefined();
  expect(views.stream.entries()[0]).toMatchObject({
    kind: "message",
    id: "t1",
    at: new Date(at(1)),
    text: "Can [@Scout](member:scout) check the terms?",
    mentions: [{ id: "scout", name: "Scout" }],
    thread: { replies: 2, unread: true, typing: [] },
  });
});

it("says a group is unavailable once its stream is gone, and failed otherwise", async () => {
  const gone = fixture({
    stream: () => json({ _tag: "ThreadApplication.GroupNotFound", groupId: "g1" }, 404),
  });
  await waitFor(() => expect(gone.views.stream.status()).toBe("unavailable"));
  cleanup();
  const failed = fixture({ stream: () => json({}, 503) });
  await waitFor(() => expect(failed.views.stream.status()).toBe("failed"));
});

it("shows a thread's messages and notes, naming the reader as themself", async () => {
  const { views, setFocus } = fixture();
  await waitFor(() => expect(views.thread.entries()).toHaveLength(4));
  await waitFor(() =>
    expect(views.thread.entries()[3]).toMatchObject({ author: { name: "Scout" } }),
  );
  expect(views.thread.entries().map((entry) => entry.kind)).toEqual([
    "message",
    "note",
    "note",
    "message",
  ]);
  expect(views.thread.entries()[1]).toMatchObject({ change: "followed", who: "Alice", self: true });
  expect(views.thread.entries()[2]).toMatchObject({
    change: "left-group",
    who: "ada@example.test",
    self: false,
  });
  expect(views.thread.entries()[3]).toMatchObject({ author: { name: "Scout", agent: true } });
  setFocus(4);
  expect(views.thread.focusId()).toBe("m2");
  setFocus(2);
  expect(views.thread.focusId()).toBeUndefined();
});

it("offers the group's other members to mention, and the rest of the workspace to add", async () => {
  const { views } = fixture();
  await waitFor(() =>
    expect(views.candidates()).toEqual([{ id: "ada", name: "ada@example.test", agent: false }]),
  );
  await waitFor(() => expect(views.people.roster()).toHaveLength(2));
  expect(views.people.roster().map((entry) => [entry.name, entry.you, entry.removable])).toEqual([
    ["Alice", true, false],
    ["ada@example.test", false, true],
  ]);
  expect(views.people.candidates()).toEqual([{ id: "scout", name: "Scout", agent: true }]);
  expect(views.workspace().map((person) => person.id)).toEqual(["ada", "scout"]);
});
