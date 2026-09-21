import { afterEach, beforeEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { BuiltinRoles } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import { Member, Workspace } from "@amends/core/workspace";
import { SignIn } from "@amends/gateway/sign-in";
import { Assignments } from "../src/api/assignments.ts";
import { Me } from "../src/api/me.ts";
import { useQuery } from "../src/api/hooks.ts";
import { valueOf } from "../src/api/errors.ts";
import { SessionBoundary } from "../src/session/boundary.tsx";
import { saveSession } from "../src/session/session.ts";
import { WorkspaceContext } from "../src/workspace/context.tsx";
import { TransferOwnership } from "../src/features/workspaces/transfer-ownership.tsx";

const workspaceId = Workspace.Id.make("workspace");
const humanId = Identity.HumanId.make("alice@example.com");
const ownerId = Member.Id.make("alice");
const recipientId = Member.Id.make("bob");
const owner = Member.Record.make({
  id: ownerId,
  workspaceId,
  identity: { _tag: "Human", id: humanId },
  status: "active",
});
const recipient = Member.Record.make({
  id: recipientId,
  workspaceId,
  identity: { _tag: "Human", id: Identity.HumanId.make("bob@example.com") },
  status: "active",
});
const workspace = { id: workspaceId, name: "Studio", createdBy: humanId, ownerMemberId: ownerId };
const membership = { workspace, member: owner, activeMemberCount: 2 };
const initial = {
  workspace,
  owner,
  ownerAssignmentId: "owner-original",
  canTransfer: true,
  candidates: [recipient],
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
const transport = vi.fn<typeof globalThis.fetch>();

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

function ObservedAccess() {
  const roles = useQuery(() => Assignments.roles(workspaceId));
  const directory = useQuery(Me.workspaces);
  return (
    <>
      <span>
        can assign:{" "}
        {valueOf(roles.result())
          ?.filter(({ assignable }) => assignable)
          .map(({ role }) => role.name)
          .join(", ")}
      </span>
      <span>
        directory owner: {valueOf(directory.result())?.memberships[0]?.workspace.ownerMemberId}
      </span>
    </>
  );
}

it("reviews the selected recipient, allows cancellation, and refreshes ownership and delegation after transfer", async () => {
  let transferred = false;
  const submitted: unknown[] = [];
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    const currentWorkspace = transferred ? { ...workspace, ownerMemberId: recipientId } : workspace;
    if (request.method === "POST") {
      submitted.push(await request.json());
      transferred = true;
      return response({ ...workspace, ownerMemberId: recipientId });
    }
    if (request.url.endsWith("/ownership"))
      return response(
        transferred
          ? {
              workspace: currentWorkspace,
              owner: recipient,
              ownerAssignmentId: "owner-new",
              canTransfer: false,
              candidates: [],
            }
          : initial,
      );
    if (request.url.endsWith("/roles"))
      return response(
        [BuiltinRoles.ViewerId, BuiltinRoles.AdministratorId].map((id) => ({
          role: { id, workspaceId, name: BuiltinRoles.nameOf(id), permissions: [] },
          assignable: !transferred || id === BuiltinRoles.ViewerId,
        })),
      );
    if (request.url.endsWith("/me/workspaces"))
      return response({
        memberships: [{ workspace: currentWorkspace, member: owner, people: 2 }],
        invitations: [],
      });
    throw new Error(`Unexpected request: ${request.url}`);
  });
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <TransferOwnership />
        <ObservedAccess />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  await screen.findByText("can assign: Viewer, Administrator");
  const review = await screen.findByRole("button", { name: "Review transfer" });
  expect((review as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: "bob@example.com" }));
  fireEvent.click(review);
  await screen.findByRole("alertdialog", { name: "Transfer ownership" });
  expect(submitted).toEqual([]);
  expect(
    screen.getByText("bob@example.com will become the owner. You will become an Administrator."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(submitted).toEqual([]);
  fireEvent.click(review);
  fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
  await screen.findByText(
    "Ownership transferred to bob@example.com. You are now an Administrator.",
  );
  expect(submitted).toEqual([
    { memberId: recipientId, expectedOwnerAssignmentId: "owner-original" },
  ]);
  await screen.findByText("can assign: Viewer");
  await screen.findByText("directory owner: bob");
  expect(screen.queryByRole("button", { name: "Review transfer" })).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("a stale transfer stays visible until cancelled and refresh supplies a new authority snapshot", async () => {
  let assignmentId = "owner-original";
  const submitted: unknown[] = [];
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    if (request.method === "GET") return response({ ...initial, ownerAssignmentId: assignmentId });
    submitted.push(await request.json());
    assignmentId = "owner-returned";
    return response({ _tag: "OwnershipApplication.Changed", workspaceId }, 409);
  });
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <TransferOwnership />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  fireEvent.click(await screen.findByRole("radio", { name: "bob@example.com" }));
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
  await screen.findByText(/Ownership changed after you opened this form/);
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh ownership" }));
  await waitFor(() =>
    expect(
      transport.mock.calls.filter(([input, init]) => requestOf(input, init).method === "GET"),
    ).toHaveLength(2),
  );
  await waitFor(() => expect(screen.queryByText("Refreshing…")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Review transfer" }));
  expect(screen.queryByText(/Ownership changed after you opened this form/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
  await waitFor(() => expect(submitted).toHaveLength(2));
  expect(submitted).toEqual([
    { memberId: recipientId, expectedOwnerAssignmentId: "owner-original" },
    { memberId: recipientId, expectedOwnerAssignmentId: "owner-returned" },
  ]);
});

it("non-owners receive an ownership display without transfer controls", async () => {
  transport.mockResolvedValue(response({ ...initial, canTransfer: false, candidates: [] }));
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <TransferOwnership />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  await screen.findByText("Current owner: alice@example.com");
  expect(screen.queryByRole("button", { name: "Review transfer" })).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
});
