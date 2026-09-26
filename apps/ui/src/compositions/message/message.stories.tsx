import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { ParentProps } from "solid-js";
import { expect, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Column } from "@amends/ui/primitives/layout";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Message } from "@amends/ui/compositions/message";

function Frame(
  props: ParentProps<{ theme?: "cotton" | "soot"; width?: string; rtl?: boolean; panel?: boolean }>,
) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        gap={0}
        style={{
          padding: "1.5rem 1.875rem",
          "max-width": props.width ?? "38rem",
          background: props.panel ? colorVars.surface.panel : undefined,
        }}
      >
        {props.children}
      </Column>
    </ThemeProvider>
  );
}
function Entry(props: {
  id: string;
  who: string;
  initials: string;
  kind?: "human" | "agent";
  time: string;
  text: string;
  replies?: { count: string; note: string; current?: boolean; unread?: boolean } | "none";
  density?: "comfortable" | "compact";
}) {
  return (
    <Message.Root aria-labelledby={`${props.id}-author`} density={props.density}>
      <Message.Avatar>
        <Avatar.Root kind={props.kind ?? "human"} decorative>
          <Avatar.Fallback>{props.initials}</Avatar.Fallback>
        </Avatar.Root>
      </Message.Avatar>
      <Message.Content>
        <Message.Header>
          <Message.Author id={`${props.id}-author`}>{props.who}</Message.Author>
          <Message.Time datetime="2026-09-22T09:14:00Z" title="Monday 22 September 2026, 09:14">
            {props.time}
          </Message.Time>
        </Message.Header>
        <Message.Body>{props.text}</Message.Body>
        {props.replies === "none" ? (
          <Message.Replies href="#thread">
            <Message.ReplyNote>reply in thread</Message.ReplyNote>
          </Message.Replies>
        ) : props.replies ? (
          <Message.Replies href="#thread" aria-current={props.replies.current ? "page" : undefined}>
            {props.replies.unread ? <Message.Unread label="unread" /> : null}
            <Message.ReplyCount>{props.replies.count}</Message.ReplyCount>
            <Message.ReplyNote>{props.replies.note}</Message.ReplyNote>
          </Message.Replies>
        ) : null}
      </Message.Content>
    </Message.Root>
  );
}
/** The Agent messages reference's stream entries. */
function Reference(props: { theme?: "cotton" | "soot"; width?: string; rtl?: boolean }) {
  return (
    <Frame {...props}>
      <Entry
        id="terms"
        who="Jo Mercer"
        initials="JM"
        time="09:14"
        text="Can you look at the supplier terms when you get a moment? I will send the contract after the close."
        replies="none"
      />
      <Entry
        id="script"
        who="Jo Mercer"
        initials="JM"
        time="13:58"
        text="Explain the reconcile script to me — what is it actually comparing?"
        replies={{ count: "3 replies", note: "last at 14:05", unread: true }}
      />
      <Message.Root aria-labelledby="mention-author">
        <Message.Avatar>
          <Avatar.Root kind="human" decorative>
            <Avatar.Fallback>RA</Avatar.Fallback>
          </Avatar.Root>
        </Message.Avatar>
        <Message.Content>
          <Message.Header>
            <Message.Author id="mention-author">Rae Ashworth</Message.Author>
            <Message.Time datetime="2026-09-22T15:02:00Z">15:02</Message.Time>
          </Message.Header>
          <Message.Body>
            <Message.Mention>@Ada</Message.Mention> can you check the totals with{" "}
            <Message.Mention>@Jo Mercer</Message.Mention> before the close?
          </Message.Body>
        </Message.Content>
      </Message.Root>
      <Entry
        id="hello"
        who="Jo Mercer"
        initials="JM"
        time="16:20"
        text="How are you?"
        replies={{ count: "1 reply", note: "last at 16:22", current: true }}
      />
    </Frame>
  );
}
const long =
  "Totals disagree on four rows.\n\n  1. Invoice-date rule\n  2. Currency rounding\n\nhttps://example.test/a-very-long-link-without-any-spaces-that-still-has-to-wrap-inside-the-column";
function States(props: { theme?: "cotton" | "soot"; panel?: boolean }) {
  return (
    <Frame {...props} width="25rem">
      <Entry id="agent" who="Ada" initials="a" kind="agent" time="15:31" text="Heads up." />
      <Entry
        id="long"
        who="Rae Ashworth-Montgomery"
        initials="RA"
        time="15:36"
        text={long}
        replies={{ count: "12 replies", note: "last at 18:02" }}
      />
      <Entry
        id="compact"
        who="Jo Mercer"
        initials="JM"
        time="16:20"
        text="A reply in the thread panel."
        density="compact"
      />
    </Frame>
  );
}

const meta = { title: "Compositions/Message", render: () => <Reference /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("article", { name: "Jo Mercer" })).toHaveLength(3);
    await expect(
      canvas.getByRole("link", { name: "unread 3 replies last at 14:05" }),
    ).toBeVisible();
    const open = canvas.getByRole("link", { name: "1 reply last at 16:22" });
    await expect(open).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("link", { name: "reply in thread" })).toHaveAttribute(
      "href",
      "#thread",
    );
  },
} satisfies Story;
export const AllStates = {
  render: () => (
    <>
      <States />
      <States panel />
    </>
  ),
} satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <Reference theme="soot" />
      <States theme="soot" />
      <States theme="soot" panel />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Reference width="20rem" /> } satisfies Story;
export const RTL = { render: () => <Reference rtl /> } satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Reference width="20rem" />
    </div>
  ),
} satisfies Story;
