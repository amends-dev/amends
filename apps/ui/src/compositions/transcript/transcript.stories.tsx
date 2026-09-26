import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, For, type ParentProps } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Button } from "@amends/ui/primitives/button";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Row } from "@amends/ui/primitives/layout";
import { Message } from "@amends/ui/compositions/message";
import { Shell } from "@amends/ui/compositions/shell";
import { Transcript } from "@amends/ui/compositions/transcript";
import { IconMarkClose } from "@amends/icons";

interface Post {
  readonly id: number;
  readonly day: string;
  readonly time: string;
  readonly text: string;
  readonly replies?: string;
}
const texts = [
  "Can you look at the supplier terms when you get a moment?",
  "Explain the reconcile script to me — what is it actually comparing?",
  "The September close is still open and the receipts question is unanswered.",
  "How are you?",
];
const post = (id: number): Post => ({
  id,
  day: ["Monday", "Tuesday", "Wednesday", "Thursday"][Math.floor(Math.abs(id) / 4) % 4]!,
  time: `${String(9 + (Math.abs(id) % 8)).padStart(2, "0")}:${String((Math.abs(id) * 7) % 60).padStart(2, "0")}`,
  text: texts[Math.abs(id) % texts.length]!,
  replies: id % 3 === 0 ? `${(Math.abs(id) % 4) + 1} replies` : undefined,
});
function Entry(props: { post: Post; density?: "comfortable" | "compact"; focused?: boolean }) {
  return (
    <Transcript.Entry focused={props.focused}>
      <Message.Root aria-labelledby={`post-${props.post.id}`} density={props.density}>
        <Message.Avatar>
          <Avatar.Root kind="human" decorative>
            <Avatar.Fallback>JM</Avatar.Fallback>
          </Avatar.Root>
        </Message.Avatar>
        <Message.Content>
          <Message.Header>
            <Message.Author id={`post-${props.post.id}`}>Jo Mercer</Message.Author>
            <Message.Time datetime="2026-09-22T09:14:00Z">{props.post.time}</Message.Time>
          </Message.Header>
          <Message.Body>{props.post.text}</Message.Body>
          {props.post.replies && props.density !== "compact" ? (
            <Message.Replies href="#thread">
              <Message.ReplyCount>{props.post.replies}</Message.ReplyCount>
              <Message.ReplyNote>last at 14:05</Message.ReplyNote>
            </Message.Replies>
          ) : null}
        </Message.Content>
      </Message.Root>
    </Transcript.Entry>
  );
}
/** Entries with a day seam before each new day. */
function Entries(props: {
  posts: ReadonlyArray<Post>;
  density?: "comfortable" | "compact";
  focus?: number;
}) {
  return (
    <For each={props.posts}>
      {(item, index) => (
        <>
          {index() === 0 || props.posts[index() - 1]!.day !== item.day ? (
            <Transcript.Day>{item.day}</Transcript.Day>
          ) : null}
          <Entry post={item} density={props.density} focused={props.focus === item.id} />
        </>
      )}
    </For>
  );
}
function Scroller(props: ParentProps<{ theme?: "cotton" | "soot" }>) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div
        data-testid="scroller"
        style={{ height: "26rem", overflow: "auto", padding: "0 1.875rem", "max-width": "38rem" }}
      >
        {props.children}
      </div>
    </ThemeProvider>
  );
}
/** A stream that opens at its newest entry, grows at both ends, and keeps the reader's place. */
function Live(props: { theme?: "cotton" | "soot" }) {
  const [posts, setPosts] = createSignal(Array.from({ length: 8 }, (_, index) => post(index)));
  let earlier = 0;
  return (
    <>
      <Row gap={2} style={{ padding: "1rem 1.875rem" }}>
        <Button
          variant="secondary"
          onClick={() => setPosts((all) => [...all, post(all.at(-1)!.id + 1)])}
        >
          Add newest
        </Button>
      </Row>
      <Scroller theme={props.theme}>
        <Transcript.Root aria-label="Messages">
          <Transcript.Earlier>
            <Button
              variant="ghost"
              onClick={() => {
                const from = --earlier * 6;
                setPosts((all) => [
                  ...Array.from({ length: 6 }, (_, index) => post(from - 6 + index)),
                  ...all,
                ]);
              }}
            >
              Show earlier
            </Button>
          </Transcript.Earlier>
          <Transcript.Items>
            <Entries posts={posts()} />
          </Transcript.Items>
        </Transcript.Root>
      </Scroller>
    </>
  );
}
/** The Agent messages reference's thread panel, in the shell's inspector. */
function Panel(props: { theme?: "cotton" | "soot" }) {
  const [open, setOpen] = createSignal(true);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Shell.Root style={{ height: "36rem" }}>
        <Shell.Body>
          <Shell.Main>
            <Shell.Content>
              <Button variant="secondary" onClick={() => setOpen(true)}>
                Open thread
              </Button>
            </Shell.Content>
          </Shell.Main>
        </Shell.Body>
        <Shell.Inspector title="Thread" open={open()} onOpenChange={setOpen}>
          <Shell.InspectorHeader>
            <Shell.InspectorHeading>
              <Shell.InspectorTitle>Thread</Shell.InspectorTitle>
              <Shell.InspectorMeta>2 messages · 1 reply</Shell.InspectorMeta>
            </Shell.InspectorHeading>
            <IconButton
              aria-label="Close thread"
              shape="circle"
              size="compact"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              <IconMarkClose />
            </IconButton>
          </Shell.InspectorHeader>
          <Shell.InspectorBody>
            <Transcript.Root aria-label="Thread messages">
              <Transcript.Items>
                <Entries posts={[post(12), post(13), post(14)]} density="compact" />
              </Transcript.Items>
              <Transcript.Status>Jo Mercer is typing…</Transcript.Status>
            </Transcript.Root>
          </Shell.InspectorBody>
        </Shell.Inspector>
      </Shell.Root>
    </ThemeProvider>
  );
}

/**
 * Opened at an entry the reader came to see, as from a notification: its earlier page loads
 * first, then the view opens at it, set apart, and another entry can take the focus.
 */
function Focused(props: { theme?: "cotton" | "soot" }) {
  const [posts, setPosts] = createSignal(
    Array.from({ length: 10 }, (_, index) => post(index + 10)),
  );
  const [focus, setFocus] = createSignal(4);
  // The focused entry is older than the first page; it arrives with the earlier one.
  queueMicrotask(() =>
    setPosts((all) => [...Array.from({ length: 10 }, (_, index) => post(index)), ...all]),
  );
  return (
    <>
      <Row gap={2} style={{ padding: "1rem 1.875rem" }}>
        <Button variant="secondary" onClick={() => setFocus(15)}>
          Focus another
        </Button>
      </Row>
      <Scroller theme={props.theme}>
        <Transcript.Root aria-label="Messages">
          <Transcript.Items>
            <Entries posts={posts()} focus={focus()} />
          </Transcript.Items>
        </Transcript.Root>
      </Scroller>
    </>
  );
}
const meta = { title: "Compositions/Transcript", render: () => <Live /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByTestId("scroller");
    const list = within(canvas.getByRole("region", { name: "Messages" }));
    await expect(list.getAllByRole("listitem").length).toBeGreaterThan(8);
    // Opens at the newest entry.
    await waitFor(() =>
      expect(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight).toBeLessThan(2),
    );
    // Earlier entries arrive above without moving what the reader sees.
    scroller.scrollTop = 0;
    await waitFor(() => expect(scroller.scrollTop).toBe(0));
    const first = list.getAllByRole("article")[0]!;
    const before = first.getBoundingClientRect().top;
    await userEvent.click(canvas.getByRole("button", { name: "Show earlier" }));
    await waitFor(() =>
      expect(Math.abs(first.getBoundingClientRect().top - before)).toBeLessThan(2),
    );
    // At the newest end, the view follows new entries.
    scroller.scrollTop = scroller.scrollHeight;
    await userEvent.click(canvas.getByRole("button", { name: "Add newest" }));
    await waitFor(() =>
      expect(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight).toBeLessThan(2),
    );
  },
} satisfies Story;
export const Soot = { render: () => <Live theme="soot" /> } satisfies Story;
/** Whether an element sits within the scroller's visible area. */
const visible = (scroller: HTMLElement, element: Element) => {
  const view = scroller.getBoundingClientRect(),
    box = element.getBoundingClientRect();
  return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
};
export const FocusedEntry = {
  render: () => <Focused />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const scroller = canvas.getByTestId("scroller");
    const list = within(canvas.getByRole("region", { name: "Messages" }));
    const entry = (id: number) =>
      list
        .getAllByRole("article")
        .find((article) => article.getAttribute("aria-labelledby") === `post-${id}`)!;
    // It opens at the focused entry, not at the newest end, and sets it apart.
    await waitFor(() => expect(list.getAllByRole("article")).toHaveLength(20));
    await waitFor(() => expect(visible(scroller, entry(4))).toBe(true));
    await expect(entry(4).closest("li")).toHaveAttribute("data-focused", "true");
    await expect(
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
    ).toBeGreaterThan(24);
    // Focusing another entry brings it into view.
    await userEvent.click(canvas.getByRole("button", { name: "Focus another" }));
    await waitFor(() => expect(visible(scroller, entry(15))).toBe(true));
    await expect(entry(4).closest("li")).not.toHaveAttribute("data-focused");
  },
} satisfies Story;
export const FocusedEntrySoot = { render: () => <Focused theme="soot" /> } satisfies Story;
export const ThreadPanel = { render: () => <Panel /> } satisfies Story;
export const ThreadPanelSoot = { render: () => <Panel theme="soot" /> } satisfies Story;
