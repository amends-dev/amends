import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { ParentProps } from "solid-js";
import { expect, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Inbox } from "@amends/ui/compositions/inbox";

function Frame(props: ParentProps<{ theme?: "cotton" | "soot"; width?: string; rtl?: boolean }>) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column gap={0} style={{ padding: "1.5rem 1.875rem", "max-width": props.width ?? "38rem" }}>
        {props.children}
      </Column>
    </ThemeProvider>
  );
}
function Card(props: {
  reason: string;
  meta: string;
  text?: string;
  seen?: boolean;
  current?: boolean;
}) {
  return (
    <Inbox.Item seen={props.seen} current={props.current}>
      <Inbox.Header>
        {props.seen ? null : <Inbox.Unread label="new" />}
        <Inbox.Reason>{props.reason}</Inbox.Reason>
        <Inbox.Meta>{props.meta}</Inbox.Meta>
      </Inbox.Header>
      {props.text === undefined ? (
        <Inbox.Note>You can no longer see this thread.</Inbox.Note>
      ) : (
        <Inbox.Quote>{props.text}</Inbox.Quote>
      )}
      {props.text === undefined ? null : (
        <Inbox.Actions>
          <Inbox.Open href="#thread" aria-current={props.current ? "page" : undefined}>
            Open thread
          </Inbox.Open>
          {props.seen ? null : <Button variant="secondary">Mark seen</Button>}
        </Inbox.Actions>
      )}
    </Inbox.Item>
  );
}
const long =
  "Totals disagree on four rows, all on the invoice-date rule. Can you check them before the close? Currency rounding explains the rest, and https://example.test/a-very-long-link-without-any-spaces-that-still-has-to-wrap stays inside the card.";
/** The Home reference's "Needs you" cards, as an inbox: pending, open, seen, and unavailable. */
function Reference(props: { theme?: "cotton" | "soot"; width?: string; rtl?: boolean }) {
  return (
    <Frame {...props}>
      <Inbox.Root aria-label="Inbox">
        <Card
          reason="Rae mentioned you · #finance"
          meta="2h ago"
          text="Is this refund inside the 30-day window, or an exception?"
        />
        <Card reason="Jo replied · #finance" meta="09:14" text={long} current />
        <Card
          reason="Ada started a thread · #design"
          meta="Yesterday"
          text="New icons are in."
          seen
        />
        <Card reason="Rae mentioned you · a group you left" meta="Monday" seen />
      </Inbox.Root>
    </Frame>
  );
}
const meta = { title: "Compositions/Inbox", render: () => <Reference /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "Inbox" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    await expect(canvas.getAllByRole("img", { name: "new" })).toHaveLength(2);
    const links = canvas.getAllByRole("link", { name: "Open thread" });
    await expect(links).toHaveLength(3);
    await expect(links[1]).toHaveAttribute("aria-current", "page");
    await expect(canvas.getAllByRole("button", { name: "Mark seen" })).toHaveLength(2);
    await expect(canvas.getByText("You can no longer see this thread.")).toBeVisible();
  },
} satisfies Story;
export const Comparison = { render: () => <Reference theme="soot" /> } satisfies Story;
export const Narrow = { render: () => <Reference width="20rem" /> } satisfies Story;
export const RTL = { render: () => <Reference rtl /> } satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Reference width="20rem" />
    </div>
  ),
} satisfies Story;
