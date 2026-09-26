import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { Inbox } from "@amends/ui/compositions/inbox";
import preview from "../.storybook/preview.ts";
import meta, { Default } from "../src/compositions/inbox/inbox.stories.tsx";
afterEach(cleanup);

it("lists notifications as cards that mark what is pending, seen, and open", () => {
  render(() => (
    <Inbox.Root aria-label="Inbox" class="consumer">
      <Inbox.Item current>
        <Inbox.Header>
          <Inbox.Unread label="new" />
          <Inbox.Reason>Rae mentioned you · #finance</Inbox.Reason>
          <Inbox.Meta>2h ago</Inbox.Meta>
        </Inbox.Header>
        <Inbox.Quote>Is this refund inside the window?</Inbox.Quote>
        <Inbox.Actions>
          <Inbox.Open href="/thread" aria-current="page">
            Open thread
          </Inbox.Open>
        </Inbox.Actions>
      </Inbox.Item>
      <Inbox.Item seen>
        <Inbox.Note>You can no longer see this thread.</Inbox.Note>
      </Inbox.Item>
    </Inbox.Root>
  ));
  const list = screen.getByRole("list", { name: "Inbox" });
  expect(list).toHaveClass("consumer");
  const [open, seen] = within(list).getAllByRole("listitem");
  expect(open).toHaveAttribute("data-current", "true");
  expect(open).not.toHaveAttribute("data-seen");
  expect(seen).toHaveAttribute("data-seen", "true");
  expect(within(open!).getByRole("img", { name: "new" })).toBeInTheDocument();
  expect(within(open!).getByText(/refund/).tagName).toBe("BLOCKQUOTE");
  const link = within(open!).getByRole("link", { name: "Open thread" });
  expect(link).toHaveAttribute("href", "/thread");
  expect(link).toHaveAttribute("aria-current", "page");
});

it("shows the reference's cards with their links and actions", async () => {
  await definePreview(preview).meta(meta).story(Default).run();
});
