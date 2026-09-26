import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, Show, type ParentProps } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Composer } from "@amends/ui/compositions/composer";

function Frame(
  props: ParentProps<{ theme?: "cotton" | "soot"; width?: string; rtl?: boolean; panel?: boolean }>,
) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        gap={5}
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
/** A composer that records what it sends, with an optional failure after sending. */
function Writing(props: {
  label: string;
  placeholder: string;
  send: string;
  note: string;
  density?: "comfortable" | "compact";
  initial?: string;
  failure?: string;
  pending?: boolean;
}) {
  const [draft, setDraft] = createSignal(props.initial ?? "");
  const [sent, setSent] = createSignal<ReadonlyArray<string>>([]);
  const id = props.label.replaceAll(" ", "-").toLowerCase();
  return (
    <>
      <Composer.Root
        density={props.density}
        onSend={() => {
          if (!draft().trim()) return;
          setSent((all) => [...all, draft()]);
          setDraft("");
        }}
      >
        <Composer.Frame>
          <Composer.Input
            aria-label={props.label}
            aria-describedby={props.failure ? `${id}-error` : `${id}-note`}
            aria-invalid={props.failure ? "true" : undefined}
            placeholder={props.placeholder}
            value={draft()}
            onInput={setDraft}
          />
          <Composer.Actions>
            <Button
              type="submit"
              variant="primary"
              disabled={!draft().trim()}
              pending={props.pending}
            >
              {props.send}
            </Button>
          </Composer.Actions>
        </Composer.Frame>
        <Show
          when={props.failure}
          fallback={<Composer.Note id={`${id}-note`}>{props.note}</Composer.Note>}
        >
          {(failure) => <Composer.Error id={`${id}-error`}>{failure()}</Composer.Error>}
        </Show>
      </Composer.Root>
      <output data-testid={`${id}-sent`}>{sent().join("|")}</output>
    </>
  );
}
const page = {
  label: "Message Design",
  placeholder: "Message #Design",
  send: "Send",
  note: "Starts a new thread in Design.",
};
const thread = {
  label: "Reply",
  placeholder: "Reply in this thread",
  send: "Reply",
  note: "Replying here stays in this thread.",
  density: "compact" as const,
};
function Reference(props: { theme?: "cotton" | "soot"; width?: string; rtl?: boolean }) {
  return (
    <>
      <Frame {...props}>
        <Writing {...page} />
      </Frame>
      <Frame {...props} width="25rem" panel>
        <Writing {...thread} />
      </Frame>
    </>
  );
}
function States(props: { theme?: "cotton" | "soot" }) {
  return (
    <Frame {...props}>
      <Writing {...page} label="Sending" initial="Can you look at the terms?" pending />
      <Writing
        {...page}
        label="Failed"
        initial="Can you look at the terms?"
        failure="We couldn’t send this. Try again when the host is reachable."
      />
      <Writing
        {...page}
        label="Long"
        initial={
          "Totals disagree on four rows.\n\n  1. Invoice-date rule\n  2. Currency rounding\n  3. Refunds\n  4. Fees\n\nhttps://example.test/a-very-long-link-without-any-spaces-that-still-has-to-wrap"
        }
      />
    </Frame>
  );
}

const meta = { title: "Compositions/Composer", render: () => <Reference /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message Design" });
    const send = canvas.getAllByRole("button", { name: "Send" })[0]!;
    await expect(send).toBeDisabled();
    await expect(input).toHaveAccessibleDescription("Starts a new thread in Design.");
    // Shift+Enter starts a new line; Enter sends.
    await userEvent.type(input, "First line{Shift>}{Enter}{/Shift}second");
    await expect(input).toHaveValue("First line\nsecond");
    await expect(send).toBeEnabled();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByTestId("message-design-sent")).toHaveTextContent("First line second");
    await expect(input).toHaveValue("");
    // The button sends too.
    await userEvent.type(input, "Again");
    await userEvent.click(send);
    await expect(canvas.getByTestId("message-design-sent").textContent).toBe(
      "First line\nsecond|Again",
    );
  },
} satisfies Story;
export const AllStates = { render: () => <States /> } satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <Reference theme="soot" />
      <States theme="soot" />
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
export const Docked = {
  render: () => (
    <ThemeProvider theme="cotton">
      <div
        style={{ height: "24rem", overflow: "auto", padding: "0 1.875rem", "max-width": "38rem" }}
      >
        <Column gap={4}>
          {Array.from({ length: 12 }, (_, index) => (
            <p style={{ margin: 0 }}>Earlier message {index + 1}</p>
          ))}
        </Column>
        <Composer.Dock>
          <Writing {...page} />
        </Composer.Dock>
      </div>
    </ThemeProvider>
  ),
} satisfies Story;
