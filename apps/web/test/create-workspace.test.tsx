import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { Identity } from "@amends/core/identity";
import { SignIn } from "@amends/gateway/sign-in";
import { SessionBoundary } from "../src/session/boundary.tsx";
import { saveSession } from "../src/session/session.ts";
import { CreateWorkspaceButton } from "../src/features/workspaces/create-workspace-button.tsx";
import { WorkspacePicker } from "../src/features/workspaces/workspace-picker.tsx";

const transport = vi.fn<typeof globalThis.fetch>();
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(new URL(String(input), "http://localhost"), init);
const workspace = {
  id: "studio",
  name: "Design studio",
  createdBy: "alice",
  ownerMemberId: "owner",
};

beforeEach(() => {
  localStorage.clear();
  saveSession(SignIn.Session.make({ token: "alice", humanId: Identity.HumanId.make("alice") }));
  transport.mockReset();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("opens a required name form without creating anything and cancels without a request", () => {
  render(() => (
    <SessionBoundary>
      <CreateWorkspaceButton onCreated={vi.fn()} />
    </SessionBoundary>
  ));
  const trigger = screen.getByRole("button", { name: "New workspace" });
  trigger.focus();
  fireEvent.click(trigger);
  const input = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(input.required).toBe(true);
  const submit = screen.getByRole("button", { name: "Create workspace" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.input(input, { target: { value: " \t " } });
  expect(submit.disabled).toBe(true);
  fireEvent.submit(input.closest("form")!);
  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  expect((screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement).value).toBe(
    "",
  );
  expect(transport).not.toHaveBeenCalled();
});

it("submits the trimmed name once, blocks dismissal while pending, then refreshes the named workspace", async () => {
  const pending = Promise.withResolvers<Response>();
  const requests: Request[] = [];
  let created = false;
  transport.mockImplementation(async (input, init) => {
    const request = requestOf(input, init);
    if (request.method === "POST") {
      requests.push(request);
      return pending.promise;
    }
    return response({
      memberships: created
        ? [
            {
              workspace,
              member: {
                id: "owner",
                workspaceId: "studio",
                identity: { _tag: "Human", id: "alice" },
                status: "active",
              },
              people: 1,
            },
          ]
        : [],
      invitations: [],
    });
  });
  const onCreated = vi.fn();
  render(() => (
    <SessionBoundary>
      <WorkspacePicker onSelect={onCreated} />
    </SessionBoundary>
  ));
  await screen.findByText("No workspaces");
  fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
  const input = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
  fireEvent.input(input, { target: { value: "  Design studio  " } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(await requests[0]!.json()).toEqual({ name: "Design studio" });
  expect(input.readOnly).toBe(true);
  const dialog = screen.getByRole("dialog");
  dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
  created = true;
  pending.resolve(response(workspace, 201));
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith("studio"));
  expect(screen.queryByRole("dialog")).toBeNull();
  await screen.findByText("Design studio");
});

it("keeps the name after a failed request and allows a retry", async () => {
  transport
    .mockResolvedValueOnce(response({}, 500))
    .mockResolvedValueOnce(response(workspace, 201));
  const onCreated = vi.fn();
  render(() => (
    <SessionBoundary>
      <CreateWorkspaceButton onCreated={onCreated} />
    </SessionBoundary>
  ));
  fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
  const input = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
  fireEvent.input(input, { target: { value: "Design studio" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByText(
    "The request could not be completed. Check your connection and try again.",
  );
  expect(onCreated).not.toHaveBeenCalled();
  expect(input.value).toBe("Design studio");
  expect(input.readOnly).toBe(false);
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith("studio"));
  expect(transport).toHaveBeenCalledTimes(2);
});
