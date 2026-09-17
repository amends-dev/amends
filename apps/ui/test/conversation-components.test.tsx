import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, For } from "solid-js";
import { Message, TaskReference, TurnSummary } from "../src/components/index.ts";

afterEach(cleanup);

it("shows messages from every author with the same readable body, preserving channel metadata", () => {
  const kinds = ["user", "agent", "contact", "system"] as const;
  render(() => (
    <For each={kinds}>
      {(kind) => (
        <Message
          author={kind}
          kind={kind}
          role={kind}
          time="10:30"
          dateTime="2026-09-13T10:30:00Z"
          direction="in"
          delivery="sent by email"
          footer="task created"
        >
          First line{"\n"}Second line
        </Message>
      )}
    </For>
  ));
  const messages = screen.getAllByRole("article");
  expect(messages).toHaveLength(4);
  const bodies = messages.map((message) => within(message).getByText("First line Second line"));
  expect(new Set(bodies.map((body) => body.className)).size).toBe(1);
  for (const message of messages) {
    expect(within(message).getByText("Inbound")).toBeDefined();
    expect(within(message).getByText("sent by email")).toBeDefined();
    expect(within(message).getByText("task created")).toBeDefined();
  }
});

it("mounts execution details on keyboard expansion and keeps them open as a turn finishes", async () => {
  const [status, setStatus] = createSignal("working");
  const details = vi.fn(() => <a href="/session">Open session log</a>);
  render(() => (
    <TurnSummary
      label="turn 1"
      author="Ada"
      time="10:30"
      status={status()}
      tone={status() === "working" ? "running" : "success"}
    >
      {details}
    </TurnSummary>
  ));
  expect(details).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  const link = screen.getByRole("link");
  await user.tab();
  expect(document.activeElement).toBe(link);
  setStatus("done");
  expect(screen.getByRole("button", { name: /turn 1 done/ }).getAttribute("aria-expanded")).toBe(
    "true",
  );
  expect(screen.getByRole("link")).toBe(link);
  await user.click(screen.getByRole("button"));
  expect(screen.queryByRole("link")).toBeNull();
});

it("makes a task reference a keyboard-accessible link with its status and owner", async () => {
  render(() => (
    <TaskReference
      href="/tasks/one"
      title="Backfill the receipts"
      status="held"
      tone="pending"
      owner={{ name: "Ada", kind: "agent" }}
    />
  ));
  const link = screen.getByRole("link", { name: /Backfill the receipts task · held · Ada/ });
  expect(link.getAttribute("href")).toBe("/tasks/one");
  await userEvent.setup().tab();
  expect(document.activeElement).toBe(link);
});
