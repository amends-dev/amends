import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { RegistryContext } from "@effect/atom-solid";
import { Member, Workspace } from "@amends/core/workspace";
import { Identity } from "@amends/core/identity";
import { SignIn } from "@amends/gateway/sign-in";
import type { WorkspaceDirectory } from "@amends/gateway/directory";
import { Effect, Exit } from "effect";
import { AtomRegistry } from "effect/unstable/reactivity";
import { createSignal, Show, useContext } from "solid-js";
import { Members } from "../src/api/members.ts";
import { Invitations } from "../src/api/invitations.ts";
import { Me } from "../src/api/me.ts";
import { useCommand, useQuery } from "../src/api/hooks.ts";
import { QueryView, CommandError } from "../src/components/query-view.tsx";
import { SessionBoundary, useSession } from "../src/session/boundary.tsx";
import { saveSession, sessionAtom } from "../src/session/session.ts";
import { WorkspaceContext } from "../src/workspace/context.tsx";
import { WorkspaceBoundary } from "../src/workspace/boundary.tsx";
import { MemberDetails } from "../src/features/members/member-details.tsx";
import { InvitationList } from "../src/features/invitations/invitation-list.tsx";
import { IssueInvitationForm } from "../src/features/invitations/issue-invitation-form.tsx";
import { WorkspacePicker } from "../src/features/workspaces/workspace-picker.tsx";

const workspaceId = Workspace.Id.make("workspace-a");
const otherWorkspaceId = Workspace.Id.make("workspace-b");
const humanId = Identity.HumanId.make("reader@example.com");
const session = SignIn.Session.make({ token: "credential-a", humanId });
const member = (
  id: string,
  workspace = workspaceId,
  status: Member.Status = "active",
): Member.Record =>
  Member.Record.make({
    id: Member.Id.make(id),
    workspaceId: workspace,
    identity: { _tag: "Human", id: Identity.HumanId.make(`${id}@example.com`) },
    status,
  });
const membership: WorkspaceDirectory.Membership = {
  workspace: {
    id: workspaceId,
    createdBy: humanId,
    name: "Test workspace",
    ownerMemberId: Member.Id.make("owner"),
  },
  member: member("reader"),
  activeMemberCount: 3,
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
const pendingResponse = () => {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const invitation = {
  details: {
    id: "invitation",
    workspaceId,
    inviterMemberId: "owner",
    recipientId: humanId,
    roleId: "builtin:viewer",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  },
  state: { _tag: "Pending" },
};
const transport = vi.fn<typeof globalThis.fetch>();
const stubFetch = (handler: typeof globalThis.fetch) => {
  transport.mockImplementation(handler);
  vi.stubGlobal("fetch", transport);
};
const registries: AtomRegistry.AtomRegistry[] = [];
const registry = () => {
  const value = AtomRegistry.make({ initialValues: [[sessionAtom, session]] });
  registries.push(value);
  return value;
};
beforeEach(() => {
  localStorage.clear();
  saveSession(session);
});
afterEach(() => {
  cleanup();
  registries.splice(0).forEach((value) => value.dispose());
  vi.unstubAllGlobals();
});

describe("query identity and refresh", () => {
  it("shares an in-flight read and keeps workspaces separate", async () => {
    const delayed = pendingResponse();
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init);
      expect(request.headers.get("authorization")).toBe("Bearer credential-a");
      return request.url.includes("workspace-a")
        ? delayed.promise
        : Promise.resolve(response([member("other", otherWorkspaceId)]));
    });
    stubFetch(fetch);
    const store = registry();
    const first = Members.list(workspaceId);
    const second = Members.list(workspaceId);
    expect(second).toBe(first);
    store.mount(first);
    store.mount(second);
    store.mount(Members.list(otherWorkspaceId));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    delayed.resolve(response([member("first")]));
    const a = await Effect.runPromise(AtomRegistry.getResult(store, first));
    const b = await Effect.runPromise(
      AtomRegistry.getResult(store, Members.list(otherWorkspaceId)),
    );
    expect(a[0]?.id).toBe("first");
    expect(b[0]?.id).toBe("other");
  });

  it("refreshes all removal effects in the affected workspace, only after success", async () => {
    const reads = new Map<string, number>();
    let failRemoval = true;
    stubFetch(
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestOf(input, init);
        const path = new URL(request.url).pathname;
        if (request.method === "DELETE")
          return failRemoval
            ? response(
                { _tag: "MemberApplication.OwnerProtected", workspaceId, memberId: "target" },
                409,
              )
            : response(member("target", workspaceId, "removed"));
        reads.set(path, (reads.get(path) ?? 0) + 1);
        if (path.endsWith("/me/workspaces")) return response({ memberships: [], invitations: [] });
        if (path.endsWith("/invitations")) return response([]);
        if (path.endsWith("/members/target")) return response(member("target"));
        return response([]);
      }),
    );
    const store = registry();
    const queries = [
      Members.list(workspaceId),
      Members.get(workspaceId, Member.Id.make("target")),
      Invitations.list(workspaceId),
      Me.workspaces(),
      Members.list(otherWorkspaceId),
    ];
    queries.forEach((query) => store.mount<unknown>(query));
    await waitFor(() => expect(reads.size).toBe(5));
    const command = Members.makeRemove();
    store.mount(command);
    const input = { workspaceId, memberId: Member.Id.make("target") };
    store.set(command, input);
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(
          AtomRegistry.getResult(store, command, { suspendOnWaiting: true }),
        ),
      ),
    ).toBe(true);
    expect([...reads.values()]).toEqual([1, 1, 1, 1, 1]);
    failRemoval = false;
    store.set(command, input);
    await Effect.runPromise(AtomRegistry.getResult(store, command, { suspendOnWaiting: true }));
    await waitFor(() => expect(reads.get("/api/workspaces/workspace-a/invitations")).toBe(2));
    for (const [path, count] of reads) expect(count).toBe(path.includes("workspace-b") ? 1 : 2);
  });
});

function RemoveControl(props: { id: string; onSuccess?: () => void }) {
  const command = useCommand(Members.makeRemove());
  const run = async () => {
    const exit = await command.run({ workspaceId, memberId: Member.Id.make(props.id) });
    if (exit && Exit.isSuccess(exit)) props.onSuccess?.();
  };
  return (
    <section>
      <button onClick={() => void run()}>remove {props.id}</button>
      <span>
        {props.id}: {command.pending() ? "pending" : "idle"}
      </span>
      <CommandError result={command.result()} />
    </section>
  );
}
it("isolates simultaneous commands and prevents a duplicate submission within an owner", async () => {
  const first = pendingResponse();
  const second = pendingResponse();
  const requests: Request[] = [];
  stubFetch(
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init);
      requests.push(request);
      return request.url.endsWith("/first") ? first.promise : second.promise;
    }),
  );
  render(() => (
    <SessionBoundary>
      <RemoveControl id="first" />
      <RemoveControl id="second" />
    </SessionBoundary>
  ));
  fireEvent.click(screen.getByText("remove first"));
  fireEvent.click(screen.getByText("remove first"));
  fireEvent.click(screen.getByText("remove second"));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.every((request) => !request.signal.aborted)).toBe(true);
  expect(screen.getByText("first: pending")).toBeTruthy();
  expect(screen.getByText("second: pending")).toBeTruthy();
  first.resolve(
    response({ _tag: "MemberApplication.OwnerProtected", workspaceId, memberId: "first" }, 409),
  );
  await screen.findByText("first: idle");
  expect(screen.getByText("second: pending")).toBeTruthy();
  second.resolve(response(member("second", workspaceId, "removed")));
  await screen.findByText("second: idle");
  expect(
    screen.getAllByText("The current owner cannot be removed. Transfer ownership first."),
  ).toHaveLength(1);
});

it("embeds details without a router and ignores an old response after the ID changes", async () => {
  const delayed = pendingResponse();
  const requests: Request[] = [];
  stubFetch(
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init);
      requests.push(request);
      return request.url.endsWith("/first")
        ? delayed.promise
        : Promise.resolve(response(member("second")));
    }),
  );
  const [id, setId] = createSignal(Member.Id.make("first"));
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <MemberDetails memberId={id()} />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  await waitFor(() => expect(requests).toHaveLength(1));
  setId(Member.Id.make("second"));
  await screen.findByText("second@example.com");
  await waitFor(() => expect(requests[0]?.signal.aborted).toBe(true));
  delayed.resolve(response(member("first")));
  await Promise.resolve();
  expect(screen.queryByText("first@example.com")).toBeNull();
});

it("keeps invitation drafts and saved data through a failed refresh", async () => {
  let fail = false;
  stubFetch(
    vi.fn(async () => {
      if (fail) throw new TypeError("offline");
      return response([]);
    }),
  );
  function Refresh() {
    const query = useQuery(() => Invitations.list(workspaceId));
    return <button onClick={query.refresh}>refresh</button>;
  }
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <Refresh />
        <InvitationList />
        <IssueInvitationForm />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  await screen.findByText("No invitations yet");
  const input = screen.getByRole("textbox", { name: "Address" }) as HTMLInputElement;
  fireEvent.input(input, { target: { value: "draft@example.com" } });
  fail = true;
  fireEvent.click(screen.getByText("refresh"));
  await screen.findByText(/Showing saved data/);
  expect(screen.getByText("No invitations yet")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Address" })).toBe(input);
  expect(input.value).toBe("draft@example.com");
});

it("disposes requests, cached data, and delayed callbacks when credentials change", async () => {
  const delayed = pendingResponse();
  const requests: Request[] = [];
  const onSuccess = vi.fn();
  const stores: AtomRegistry.AtomRegistry[] = [];
  stubFetch(
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init);
      requests.push(request);
      if (request.method === "DELETE") return delayed.promise;
      return Promise.resolve(
        response([
          member(request.headers.get("authorization") === "Bearer credential-a" ? "old" : "new"),
        ]),
      );
    }),
  );
  function Protected() {
    const scope = useSession();
    stores.push(useContext(RegistryContext));
    const query = useQuery(() => Members.list(workspaceId));
    return (
      <>
        <button
          onClick={() => scope.replace(SignIn.Session.make({ token: "credential-b", humanId }))}
        >
          replace session
        </button>
        <RemoveControl id="target" onSuccess={onSuccess} />
        <QueryView result={query.result()} retry={query.refresh} loading="loading">
          {(members) => <p>{members()[0]?.identity.id}</p>}
        </QueryView>
      </>
    );
  }
  render(() => (
    <SessionBoundary>
      <Protected />
    </SessionBoundary>
  ));
  await screen.findByText("old@example.com");
  fireEvent.click(screen.getByText("remove target"));
  await waitFor(() => expect(requests.some((request) => request.method === "DELETE")).toBe(true));
  fireEvent.click(screen.getByText("replace session"));
  expect(screen.queryByText("old@example.com")).toBeNull();
  await screen.findByText("new@example.com");
  expect(stores).toHaveLength(2);
  expect(stores[0]).not.toBe(stores[1]);
  await waitFor(() =>
    expect(requests.find((request) => request.method === "DELETE")?.signal.aborted).toBe(true),
  );
  delayed.resolve(response(member("target")));
  await Promise.resolve();
  expect(onSuccess).not.toHaveBeenCalled();
});

it("ends unauthorized sessions and distinguishes directory failures from ended membership", async () => {
  let status = 500;
  stubFetch(
    vi.fn(async () =>
      status === 200
        ? response({
            memberships: [
              {
                workspace: membership.workspace,
                member: member("reader", workspaceId, "removed"),
                people: 3,
              },
            ],
            invitations: [],
          })
        : response(status === 401 ? { _tag: "Api.Unauthorized", message: "expired" } : {}, status),
    ),
  );
  function Access() {
    const scope = useSession();
    return (
      <Show when={scope.session} fallback={<p>signed out</p>}>
        <WorkspaceBoundary
          workspaceId={workspaceId}
          loading={<p>loading</p>}
          error={(_, retry) => <button onClick={retry}>loading failed; retry</button>}
          unavailable={() => <p>membership ended</p>}
        >
          <p>protected</p>
        </WorkspaceBoundary>
      </Show>
    );
  }
  const mounted = render(() => (
    <SessionBoundary>
      <Access />
    </SessionBoundary>
  ));
  await screen.findByText("loading failed; retry");
  expect(screen.queryByText("membership ended")).toBeNull();
  status = 200;
  fireEvent.click(screen.getByText("loading failed; retry"));
  await screen.findByText("membership ended");
  expect(screen.queryByText("protected")).toBeNull();
  mounted.unmount();
  status = 401;
  render(() => (
    <SessionBoundary>
      <Access />
    </SessionBoundary>
  ));
  await screen.findByText("signed out");
  expect(localStorage.getItem("amends.session")).toBeNull();
});

it("keeps a pending row command alive when refreshed records have the same domain ID", async () => {
  const delayed = pendingResponse();
  let reads = 0;
  let request: Request | undefined;
  stubFetch(
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const current = requestOf(input, init);
      if (current.method === "POST") {
        request = current;
        return delayed.promise;
      }
      reads++;
      return Promise.resolve(response([invitation]));
    }),
  );
  function Refresh() {
    const query = useQuery(() => Invitations.list(workspaceId));
    return <button onClick={query.refresh}>refresh rows</button>;
  }
  render(() => (
    <SessionBoundary>
      <WorkspaceContext.Provider value={() => membership}>
        <Refresh />
        <InvitationList />
      </WorkspaceContext.Provider>
    </SessionBoundary>
  ));
  const button = await screen.findByRole("button", { name: "revoke" });
  fireEvent.click(button);
  await waitFor(() => expect(request).toBeDefined());
  fireEvent.click(screen.getByText("refresh rows"));
  await waitFor(() => expect(reads).toBe(2));
  expect(screen.getByRole("button", { name: "revoke" })).toBe(button);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(request?.signal.aborted).toBe(false);
  delayed.resolve(response(invitation));
  await waitFor(() => expect(button.getAttribute("aria-busy")).not.toBe("true"));
});

it("reports invitation acceptance while the directory removes the accepted invitation", async () => {
  let accepted = false;
  const select = vi.fn();
  stubFetch(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init);
      if (request.method === "POST") {
        accepted = true;
        return response(member("reader"));
      }
      return response({ memberships: [], invitations: accepted ? [] : [invitation] });
    }),
  );
  render(() => (
    <SessionBoundary>
      <WorkspacePicker onSelect={select} />
    </SessionBoundary>
  ));
  fireEvent.click(await screen.findByRole("button", { name: "accept" }));
  await waitFor(() => expect(select).toHaveBeenCalledWith(workspaceId));
  await waitFor(() => expect(screen.queryByRole("button", { name: "accept" })).toBeNull());
});

it("suppresses previously readable data when the server denies a refresh", async () => {
  let denied = false;
  stubFetch(
    vi.fn(async () =>
      denied
        ? response({ _tag: "MemberApplication.NotFound", workspaceId, memberId: "target" }, 404)
        : response(member("target")),
    ),
  );
  function Record() {
    const query = useQuery(() => Members.get(workspaceId, Member.Id.make("target")));
    return (
      <>
        <button onClick={query.refresh}>refresh member</button>
        <QueryView result={query.result()} retry={query.refresh} loading="loading">
          {(value) => <p>{value().identity.id}</p>}
        </QueryView>
      </>
    );
  }
  render(() => (
    <SessionBoundary>
      <Record />
    </SessionBoundary>
  ));
  await screen.findByText("target@example.com");
  denied = true;
  fireEvent.click(screen.getByText("refresh member"));
  await screen.findByText("This member is no longer available.");
  expect(screen.queryByText("target@example.com")).toBeNull();
  expect(screen.queryByText(/Showing saved data/)).toBeNull();
});
