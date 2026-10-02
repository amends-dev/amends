import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useDirectMessages,
  useGroupMembers,
  useGroupPeople,
  useWorkspaceGroups,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const session = Schema.decodeSync(Session)({ token: "alice", identity: "alice" });
const store: SessionStore = { read: () => session, write: () => {}, subscribe: () => () => {} };
const at = (minute: number) => new Date(Date.UTC(2026, 8, 25, 12, minute)).toISOString();

const member = (id: string, name: string, kind = "Human") => ({
  id,
  workspaceId: "one",
  identity: { _tag: kind, id: kind === "Human" ? `${id}@example.test` : id },
  name,
  status: "active",
});
const members = [
  member("owner", "Alice"),
  member("ada", "Ada"),
  member("zed", "Zed"),
  member("bea", "Bea"),
  member("scout", "Scout", "Agent"),
];
const listing = {
  memberships: [
    {
      workspace: {
        id: "one",
        name: "Studio",
        createdBy: "owner@example.test",
        ownerMemberId: "owner",
      },
      member: members[0],
      people: 4,
    },
  ],
  invitations: [],
};
const item = (group: Record<string, unknown>, latest?: number) => ({
  group: { workspaceId: "one", createdBy: "owner", createdAt: at(0), ...group },
  latestActivityAt: latest === undefined ? null : at(latest),
  readAt: null,
  newActivity: false,
  following: false,
  pending: 0,
  manageable: true,
  membersRemovable: true,
  renamable: true,
});
// In the host's order, which is by group ID.
const groups = [
  item({ id: "d1", kind: "Direct", memberIds: ["ada", "owner"] }, 5),
  item({ id: "d2", kind: "Direct", memberIds: ["bea", "owner", "scout"] }, 9),
  item({ id: "g1", kind: "Team", visibility: "Private", name: "Alpha" }),
  item({ id: "general", kind: "Team", visibility: "Public", name: "general" }),
];
const roster = ["owner", "ada", "scout"].map((memberId, index) => ({
  id: `a${index}`,
  workspaceId: "one",
  groupId: "general",
  memberId,
  admittedAt: at(0),
  status: "active",
}));

function fixture(suggestions?: number) {
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const path = new URL(new Request(input, init).url).pathname;
    if (path === "/me/workspaces") return Promise.resolve(json(listing));
    if (path === "/workspaces/one/members") return Promise.resolve(json(members));
    if (path === "/workspaces/one/groups") return Promise.resolve(json(groups));
    if (path === "/workspaces/one/groups/general/members") return Promise.resolve(json(roster));
    return Promise.resolve(json({}, 404));
  });
  const views = {} as {
    groups: ReturnType<typeof useWorkspaceGroups>;
    directs: ReturnType<typeof useDirectMessages>;
    general: ReturnType<typeof useGroupMembers>;
    people: ReturnType<typeof useGroupPeople>;
  };
  function Consumer() {
    views.groups = useWorkspaceGroups("one");
    views.directs = useDirectMessages("one", suggestions);
    views.general = useGroupMembers("one", "general");
    views.people = useGroupPeople("one", views.general);
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
  return views;
}

it("lists the general group first, then teams by name, and conversations by latest activity", async () => {
  const views = fixture();
  await waitFor(() => expect(views.groups.all()).toHaveLength(4));
  expect(views.groups.teams().map((entry) => [entry.name, entry.general])).toEqual([
    ["general", true],
    ["Alpha", false],
  ]);
  await waitFor(() => expect(views.groups.directs()[1]?.name).toBe("Ada"));
  expect(views.groups.directs().map((entry) => entry.id)).toEqual(["d2", "d1"]);
});

it("follows conversations with teammates, people and agents, not yet messaged one to one", async () => {
  const views = fixture();
  await waitFor(() => expect(views.directs()).toHaveLength(5));
  // Ada has a conversation of her own; Bea and Scout share only a group one.
  expect(views.directs().map((entry) => [entry.kind, entry.name])).toEqual([
    ["conversation", "Bea, Scout"],
    ["conversation", "Ada"],
    ["teammate", "Bea"],
    ["teammate", "Scout"],
    ["teammate", "Zed"],
  ]);
  expect(views.directs()[2]).toMatchObject({ id: "bea", memberIds: ["bea"], pending: 0 });
});

it("suggests only a few teammates", async () => {
  const views = fixture(2);
  await waitFor(() => expect(views.directs()).toHaveLength(4));
  expect(views.directs().map((entry) => entry.name)).toEqual(["Bea, Scout", "Ada", "Bea", "Scout"]);
});

it("offers no leaving the general group, and removes nobody from it", async () => {
  const views = fixture();
  await waitFor(() => expect(views.people.roster()).toHaveLength(3));
  expect(views.general.general()).toBe(true);
  expect(views.general.own()?.memberId).toBe("owner");
  expect(views.general.leavable()).toBe(false);
  expect(views.people.roster().map((entry) => [entry.name, entry.removable])).toEqual([
    ["Alice", false],
    ["Ada", false],
    ["Scout", false],
  ]);
});
