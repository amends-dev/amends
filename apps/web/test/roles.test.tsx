import { afterEach, beforeEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { AssignmentFacts, BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { SignIn } from "@amends/gateway/sign-in";
import { SessionBoundary } from "../src/session/boundary.tsx";
import { saveSession } from "../src/session/session.ts";
import { WorkspaceContext } from "../src/workspace/context.tsx";
import { IssueInvitationForm } from "../src/features/invitations/issue-invitation-form.tsx";
import { MemberAccess } from "../src/features/members/member-access.tsx";
import { Changes } from "../src/api/changes.ts";
import { useQuery } from "../src/api/hooks.ts";

const workspaceId = Workspace.Id.make("workspace");
const ownerId = Member.Id.make("owner");
const memberId = Member.Id.make("member");
const humanId = Identity.HumanId.make("alice");
const membership = {
  workspace: { id: workspaceId, name: "Studio", createdBy: humanId, ownerMemberId: ownerId },
  member: Member.Record.make({
    id: ownerId,
    workspaceId,
    identity: { _tag: "Human", id: humanId },
    status: "active",
  }),
  activeMemberCount: 2,
};
const roles = [BuiltinRoles.ViewerId, BuiltinRoles.AdministratorId, BuiltinRoles.OwnerId].map(
  (id) => ({
    role: { id, workspaceId, name: BuiltinRoles.nameOf(id), permissions: [] },
    assignable: id !== BuiltinRoles.OwnerId,
  }),
);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const transport = vi.fn<typeof globalThis.fetch>();
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
beforeEach(() => {
  localStorage.clear();
  saveSession(SignIn.Session.make({ token: "alice", humanId }));
  transport.mockReset();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("invitations submit one selected role without raw permission grants", async () => {
  const submitted: unknown[] = [];
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    if (request.method === "GET") return response(roles);
    const body = await request.json();
    submitted.push(body);
    return response(
      {
        details: {
          ...body,
          id: "invite",
          workspaceId,
          inviterMemberId: ownerId,
          issuedAt: "2026-01-01T00:00:00Z",
        },
        state: { _tag: "Pending" },
      },
      201,
    );
  });
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <IssueInvitationForm />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  const address = await screen.findByRole("textbox", { name: "Address" });
  fireEvent.input(address, { target: { value: "bob@example.com" } });
  fireEvent.click(screen.getByRole("radio", { name: "Administrator" }));
  expect(screen.queryByRole("radio", { name: "Owner" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "issue the invitation" }));
  await waitFor(() => expect(submitted).toHaveLength(1));
  expect(submitted[0]).toEqual({
    recipientId: "bob@example.com",
    roleId: BuiltinRoles.AdministratorId,
    expiresAt: expect.any(String),
  });
  await screen.findByText(/Issued an invitation for bob@example.com/);
});

it("role changes use the assignment IDs refreshed by SSE after a stale-change rejection", async () => {
  const submitted: unknown[] = [];
  let assignmentId = "first";
  let reads = 0;
  const feed = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    if (new URL(request.url).pathname.endsWith("/changes"))
      return new Response(new ReadableStream<Uint8Array>({ start: feed.resolve }), {
        headers: { "content-type": "text/event-stream" },
      });
    if (request.method === "GET") {
      reads++;
      return response({
        assignments: [
          {
            id: assignmentId,
            workspaceId,
            memberId,
            status: "active",
            source: {
              _tag: "Role",
              roleId: BuiltinRoles.ViewerId,
              scope: { _tag: "Workspace", workspaceId },
            },
          },
        ],
        roles,
        canManage: true,
      });
    }
    submitted.push(await request.json());
    assignmentId = "newer";
    return response({ _tag: "AssignmentApplication.Changed", memberId }, 409);
  });
  function LiveAccess() {
    useQuery(() => Changes.watch(workspaceId));
    return <MemberAccess memberId={memberId} />;
  }
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <LiveAccess />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  const events = await feed.promise;
  await screen.findByRole("radio", { name: "Administrator" });
  const initialReads = reads;
  events.enqueue(
    new TextEncoder().encode(
      `event: message\ndata: ${JSON.stringify({ _tag: "Ready", workspaceId })}\n\n`,
    ),
  );
  await waitFor(() => expect(reads).toBeGreaterThan(initialReads));
  await waitFor(() => expect(screen.queryByText("Refreshing…")).toBeNull());
  fireEvent.click(await screen.findByRole("radio", { name: "Administrator" }));
  fireEvent.click(screen.getByRole("button", { name: "Change role" }));
  await screen.findByText(/Their roles changed since you loaded them/);
  expect(submitted[0]).toEqual({
    memberId,
    roleId: BuiltinRoles.AdministratorId,
    expectedAssignmentIds: ["first"],
  });
  const readsBeforeCommit = reads;
  const recordedAt = "2026-09-20T12:00:00.000Z";
  events.enqueue(
    new TextEncoder().encode(
      `event: message\ndata: ${JSON.stringify({
        _tag: "Committed",
        workspaceId,
        commitId: "access-changed",
        events: [
          {
            id: "assignment-revoked",
            name: AssignmentFacts.Revoked.name,
            version: AssignmentFacts.Revoked.version,
            recordedAt,
            provenance: {
              workspaceId,
              performedBy: { _tag: "Identity", identity: membership.member.identity },
              causedBy: null,
              correlationId: "access-change",
              occurredAt: recordedAt,
            },
            payload: { workspaceId, assignmentId: "first" },
          },
        ],
      })}\n\n`,
    ),
  );
  await waitFor(() => expect(reads).toBeGreaterThan(readsBeforeCommit));
  await waitFor(() => expect(screen.queryByText("Refreshing…")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Change role" }));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted[1]).toEqual({
    memberId,
    roleId: BuiltinRoles.AdministratorId,
    expectedAssignmentIds: ["newer"],
  });
});
