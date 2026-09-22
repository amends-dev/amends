import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import {
  IssueInvitationForm,
  type InvitationRoles,
  type IssueInvitationResult,
} from "../src/invitations/index.ts";
import { draft, issued, roles } from "../stories/invitations/fixtures.ts";

afterEach(cleanup);
const submitButton = () => screen.getByRole("button", { name: "issue the invitation" });

it("uses supplied role capabilities, validates the address, and submits one typed draft", async () => {
  const onSubmit = vi.fn(issued);
  render(() => (
    <IssueInvitationForm
      roles={{
        _tag: "Ready",
        choices: [
          { id: "reviewer", label: "Reviewer", assignable: true },
          { id: "custom", label: "Custom role", assignable: false },
        ],
      }}
      onRetryRoles={() => {}}
      onSubmit={onSubmit}
    />
  ));
  expect(screen.getByRole("radio", { name: "Reviewer" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Custom role" })).toBeDisabled();
  expect(submitButton()).toBeDisabled();
  const address = screen.getByRole("textbox", { name: "Address" });
  fireEvent.input(address, { target: { value: "invalid" } });
  fireEvent.click(submitButton());
  expect(screen.getByText("Enter a valid email address.")).toBeVisible();
  expect(address).toHaveFocus();
  expect(address).toHaveAttribute("aria-invalid", "true");
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.input(address, { target: { value: "avery@example.com" } });
  fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
  fireEvent.click(submitButton());
  await screen.findByText(/Issued an invitation for avery@example.com/);
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    recipientId: "avery@example.com",
    roleId: "reviewer",
    expiresInDays: 30,
  });
  expect(address).toHaveValue("");
});

it("locks a pending draft, rejects duplicate submissions, and preserves it after failure for retry", async () => {
  const completion = Promise.withResolvers<IssueInvitationResult>();
  const onSubmit = vi
    .fn<typeof issued>()
    .mockImplementationOnce(() => completion.promise)
    .mockImplementation(issued);
  render(() => (
    <IssueInvitationForm
      roles={roles}
      initialDraft={draft}
      onRetryRoles={() => {}}
      onSubmit={onSubmit}
    />
  ));
  const address = screen.getByRole("textbox", { name: "Address" });
  address.focus();
  const form = address.closest("form");
  if (!form) throw new Error("Missing form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(address).toHaveAttribute("readonly");
  expect(address).toHaveFocus();
  expect(screen.getByRole("radio", { name: "30 days" })).toBeDisabled();
  expect(submitButton()).toHaveAttribute("aria-busy", "true");
  completion.resolve({ _tag: "Failed", message: "The workspace was busy. Try again." });
  await screen.findByText("The workspace was busy. Try again.");
  expect(address).toHaveValue(draft.recipientId);
  expect(address).not.toHaveAttribute("readonly");
  fireEvent.submit(form);
  await screen.findByText(/Issued an invitation/);
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("The workspace was busy. Try again.")).toBeNull();
  expect(address).toHaveValue("");
});

it("preserves the mounted draft across refresh and disables a role that becomes unavailable", () => {
  const [state, setState] = createSignal<InvitationRoles>(roles);
  const onSubmit = vi.fn(issued);
  render(() => (
    <IssueInvitationForm
      roles={state()}
      initialDraft={draft}
      onRetryRoles={() => {}}
      onSubmit={onSubmit}
    />
  ));
  const address = screen.getByRole("textbox", { name: "Address" });
  setState({ ...roles, refreshing: true });
  expect(screen.getByText("Refreshing…")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Address" })).toBe(address);
  setState({ ...roles, refreshError: "Offline" });
  expect(screen.getByText(/Showing saved data. Offline/)).toBeVisible();
  expect(address).toHaveValue(draft.recipientId);
  setState({
    _tag: "Ready",
    choices: [
      { id: "viewer", label: "Viewer", assignable: false },
      { id: "reviewer", label: "Reviewer", assignable: true },
    ],
  });
  expect(submitButton()).toBeDisabled();
  const form = address.closest("form");
  if (!form) throw new Error("Missing form");
  fireEvent.submit(form);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: "Viewer" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Reviewer" }));
  expect(submitButton()).not.toBeDisabled();
  expect(address).toHaveValue(draft.recipientId);
});

it("handles loading, unavailable roles and retry without showing stale choices", () => {
  const [state, setState] = createSignal<InvitationRoles>({ _tag: "Loading" });
  const retry = vi.fn();
  render(() => (
    <IssueInvitationForm
      roles={state()}
      initialDraft={draft}
      onRetryRoles={retry}
      onSubmit={issued}
    />
  ));
  expect(screen.getByText("Loading roles…")).toBeVisible();
  expect(screen.queryByRole("textbox")).toBeNull();
  setState(roles);
  expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
  setState({ _tag: "Unavailable", message: "Access was removed." });
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it("does not invent an assignable role when the choices are empty", () => {
  render(() => (
    <IssueInvitationForm
      roles={{ _tag: "Ready", choices: [] }}
      initialDraft={draft}
      onRetryRoles={() => {}}
      onSubmit={issued}
    />
  ));
  expect(screen.getByText(/No roles are available/)).toBeVisible();
  expect(submitButton()).toBeDisabled();
});

it("catches a rejected callback and lets the person retry with their draft intact", async () => {
  const onSubmit = vi
    .fn<typeof issued>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(issued);
  render(() => (
    <IssueInvitationForm
      roles={roles}
      initialDraft={draft}
      onRetryRoles={() => {}}
      onSubmit={onSubmit}
    />
  ));
  fireEvent.click(submitButton());
  await screen.findByText(/The request could not be completed/);
  expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
  fireEvent.click(submitButton());
  await screen.findByText(/Issued an invitation/);
});

it("a cancelled operation retains the draft and a disposed instance cannot alter its replacement", async () => {
  const completion = Promise.withResolvers<IssueInvitationResult>();
  const onSubmit = vi
    .fn<typeof issued>()
    .mockResolvedValueOnce({ _tag: "Cancelled" })
    .mockImplementationOnce(() => completion.promise);
  const first = render(() => (
    <IssueInvitationForm
      roles={roles}
      initialDraft={draft}
      onRetryRoles={() => {}}
      onSubmit={onSubmit}
    />
  ));
  fireEvent.click(submitButton());
  await waitFor(() => expect(submitButton()).not.toHaveAttribute("aria-busy", "true"));
  expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(draft.recipientId);
  fireEvent.click(submitButton());
  first.unmount();
  render(() => (
    <IssueInvitationForm
      roles={roles}
      initialDraft={{ recipientId: "new@example.com" }}
      onRetryRoles={() => {}}
      onSubmit={issued}
    />
  ));
  completion.resolve({ _tag: "Issued", recipientId: draft.recipientId, expiresOn: "2026-09-28" });
  await Promise.resolve();
  expect(screen.queryByText(/Issued an invitation/)).toBeNull();
  expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue("new@example.com");
});
