import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Message } from "@amends/ui/compositions/message";
import { Transcript } from "@amends/ui/compositions/transcript";
import preview from "../.storybook/preview.ts";
import meta, { Default } from "../src/compositions/message/message.stories.tsx";
afterEach(cleanup);

it("names an entry by its author and keeps the text as written", () => {
  const text = "First line\n\n  indented second";
  render(() => (
    <Message.Root aria-labelledby="author" density="compact" class="consumer">
      <Message.Avatar>
        <Avatar.Root kind="human" decorative>
          <Avatar.Fallback>JM</Avatar.Fallback>
        </Avatar.Root>
      </Message.Avatar>
      <Message.Content>
        <Message.Header>
          <Message.Author id="author">Jo Mercer</Message.Author>
          <Message.Time datetime="2026-09-22T09:14:00.000Z" title="22 September 2026, 09:14">
            09:14
          </Message.Time>
        </Message.Header>
        <Message.Body>{text}</Message.Body>
        <Message.Replies href="/thread" aria-current="page">
          <Message.ReplyCount>3 replies</Message.ReplyCount>
          <Message.ReplyNote>last at 14:05</Message.ReplyNote>
        </Message.Replies>
      </Message.Content>
    </Message.Root>
  ));
  const entry = screen.getByRole("article", { name: "Jo Mercer" });
  expect(entry).toHaveAttribute("data-density", "compact");
  expect(entry).toHaveClass("consumer");
  const time = within(entry).getByText("09:14");
  expect(time.tagName).toBe("TIME");
  expect(time).toHaveAttribute("datetime", "2026-09-22T09:14:00.000Z");
  expect(time).toHaveAttribute("title", "22 September 2026, 09:14");
  expect(within(entry).getByText(/First line/).textContent).toBe(text);
  const link = within(entry).getByRole("link", { name: "3 replies last at 14:05" });
  expect(link).toHaveAttribute("href", "/thread");
  expect(link).toHaveAttribute("aria-current", "page");
});

it("orders a transcript as a list of day seams and entries under its name", () => {
  render(() => (
    <Transcript.Root aria-label="Messages">
      <Transcript.Earlier>
        <button type="button">Show earlier</button>
      </Transcript.Earlier>
      <Transcript.Items>
        <Transcript.Day>Monday</Transcript.Day>
        <Transcript.Entry>First</Transcript.Entry>
        <Transcript.Note>
          Ada followed this thread
          <Transcript.NoteTime datetime="2026-09-22T09:20:00.000Z">09:20</Transcript.NoteTime>
        </Transcript.Note>
        <Transcript.Entry>Second</Transcript.Entry>
      </Transcript.Items>
    </Transcript.Root>
  ));
  const region = screen.getByRole("region", { name: "Messages" });
  const items = within(within(region).getByRole("list")).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "Monday",
    "First",
    "Ada followed this thread09:20",
    "Second",
  ]);
  expect(within(items[2]!).getByText("09:20")).toHaveAttribute(
    "datetime",
    "2026-09-22T09:20:00.000Z",
  );
  expect(within(region).getByRole("button", { name: "Show earlier" })).toBeInTheDocument();
});

it("links an opening to its thread and marks the open one", async () => {
  await definePreview(preview).meta(meta).story(Default).run();
});
