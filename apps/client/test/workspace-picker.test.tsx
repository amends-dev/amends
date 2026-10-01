import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal } from "solid-js";
import {
  ClientProvider,
  DirectoryProvider,
  Session,
  useWorkspaceAccess,
  useWorkspacePicker,
  type WorkspaceAccess,
  type WorkspacePickerController,
  type SessionStore,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const membership = (id: string, name: string, status = "active", owner = true) => ({
  workspace: { id, name, createdBy: "alice", ownerMemberId: owner ? `alice-${id}` : "someone" },
  member: {
    id: `alice-${id}`,
    workspaceId: id,
    identity: { _tag: "Human", id: "ada.lovelace@example.com" },
    status,
  },
  people: 3,
});
const invitation = (workspaceId: string, workspaceName?: string) => ({
  details: {
    id: `invitation-${workspaceId}`,
    workspaceId,
    recipientId: "ada.lovelace@example.com",
    roleId: "builtin:member",
    inviterMemberId: "owner",
    issuedAt: "2026-09-25T12:00:00.000Z",
    expiresAt: "2026-10-02T12:00:00.000Z",
  },
  state: { _tag: "Pending" },
  ...(workspaceName ? { workspaceName } : {}),
});
const listing = {
  memberships: [
    membership("one", "Studio"),
    membership("two", "Guild", "active", false),
    membership("old", "Former", "removed"),
  ],
  invitations: [invitation("fold", "Fold Studio"), invitation("quiet")],
};
const joinedMember = {
  id: "alice-fold",
  workspaceId: "fold",
  identity: { _tag: "Human", id: "ada.lovelace@example.com" },
  status: "active",
};
const joinedListing = {
  memberships: [...listing.memberships, membership("fold", "Fold Studio", "active", false)],
  invitations: [invitation("quiet")],
};

function fixture() {
  const calls: Array<{ request: Request; resolve: (value: Response) => void }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const deferred = Promise.withResolvers<Response>();
    calls.push({ request: new Request(input, init), resolve: deferred.resolve });
    return deferred.promise;
  });
  const stored = Schema.decodeSync(Session)({
    token: "ada",
    identity: "ada.lovelace@example.com",
  });
  const store: SessionStore = { read: () => stored, write: () => {}, subscribe: () => () => {} };
  const [workspaceId, setWorkspaceId] = createSignal("fold");
  let picker!: WorkspacePickerController;
  let access!: () => WorkspaceAccess;
  function Consumer() {
    picker = useWorkspacePicker();
    access = useWorkspaceAccess(workspaceId);
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
  const at = async (index: number) => {
    await waitFor(() => expect(calls.length).toBeGreaterThan(index));
    return calls[index]!;
  };
  return {
    calls,
    at,
    setWorkspaceId,
    get picker() {
      return picker;
    },
    get access() {
      return access();
    },
    ready: async () => {
      (await at(0)).resolve(json(listing));
      await waitFor(() => expect(picker.workspaces()).toHaveLength(2));
    },
  };
}

it("lists active memberships with their size and ownership, and pending invitations", async () => {
  const f = fixture();
  await f.ready();
  expect(f.picker.workspaces()).toEqual([
    { id: "one", name: "Studio", memberCount: 3, owner: true },
    { id: "two", name: "Guild", memberCount: 3, owner: false },
  ]);
  expect(f.picker.invitations()).toEqual([
    {
      id: "invitation-fold",
      workspaceId: "fold",
      workspaceName: "Fold Studio",
      expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    },
    {
      id: "invitation-quiet",
      workspaceId: "quiet",
      workspaceName: undefined,
      expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    },
  ]);
  expect(f.picker.suggestedName()).toBe("Ada Lovelace");
  expect(f.picker.refreshFailed()).toBe(false);
});

it("accepts under a trimmed name, one attempt at a time, and reloads the directory", async () => {
  const f = fixture();
  await f.ready();
  f.picker.accept("invitation-fold", "  Ada  ");
  f.picker.accept("invitation-quiet");
  expect(f.picker.accepting()).toEqual({
    invitationId: "invitation-fold",
    pending: true,
    error: undefined,
    joined: false,
  });
  const accept = await f.at(1);
  expect(accept.request.method).toBe("POST");
  expect(new URL(accept.request.url).pathname).toBe(
    "/workspaces/fold/invitations/invitation-fold/accept",
  );
  expect(await accept.request.json()).toEqual({ name: "Ada" });
  accept.resolve(json(joinedMember));
  (await f.at(2)).resolve(json(joinedListing));
  await waitFor(() =>
    expect(f.picker.accepting()).toMatchObject({ pending: false, joined: true, error: undefined }),
  );
  expect(f.picker.workspaces().map((workspace) => workspace.id)).toEqual(["one", "two", "fold"]);
  expect(f.picker.invitations().map((entry) => entry.id)).toEqual(["invitation-quiet"]);
  expect(f.calls).toHaveLength(3);
});

it("reports a refused invitation and sends no name when none is given", async () => {
  const f = fixture();
  await f.ready();
  f.picker.accept("invitation-quiet", "   ");
  const accept = await f.at(1);
  expect(await accept.request.json()).toEqual({});
  accept.resolve(
    json({ _tag: "InvitationService.NotFound", invitationId: "invitation-quiet" }, 404),
  );
  await waitFor(() =>
    expect(f.picker.accepting()).toMatchObject({ error: "gone", joined: false, pending: false }),
  );
});

it("retries only the reload once joined, and settles when a later reload drops the invitation", async () => {
  const f = fixture();
  await f.ready();
  f.picker.accept("invitation-fold");
  (await f.at(1)).resolve(json(joinedMember));
  (await f.at(2)).resolve(json({}, 503));
  await waitFor(() =>
    expect(f.picker.accepting()).toMatchObject({ error: "refresh-failed", joined: true }),
  );
  expect(f.picker.refreshFailed()).toBe(true);
  f.picker.accept("invitation-fold", "Ada");
  const retry = await f.at(3);
  expect(retry.request.method).toBe("GET");
  retry.resolve(json({}, 503));
  await waitFor(() =>
    expect(f.picker.accepting()).toMatchObject({ error: "refresh-failed", pending: false }),
  );
  f.picker.retry();
  (await f.at(4)).resolve(json(joinedListing));
  await waitFor(() => expect(f.picker.accepting()).toMatchObject({ error: undefined }));
  expect(f.picker.refreshFailed()).toBe(false);
  expect(f.calls.filter((call) => call.request.method === "POST")).toHaveLength(1);
});

it("explains why a workspace cannot be opened", async () => {
  const f = fixture();
  expect(f.access).toEqual({ reason: "unknown" });
  await f.ready();
  expect(f.access).toEqual({ reason: "invited", workspaceName: "Fold Studio" });
  f.setWorkspaceId("old");
  expect(f.access).toEqual({ reason: "removed", workspaceName: "Former" });
  f.setWorkspaceId("missing");
  expect(f.access).toEqual({ reason: "unknown" });
});
