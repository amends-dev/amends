import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { Breadcrumb } from "@amends/ui/compositions/breadcrumb";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import type { ColorTheme } from "@amends/ui/foundations/color";
import "@amends/ui/foundations/typography/fonts";

function TaskHeader(props: { theme: ColorTheme }) {
  return (
    <main class={colorThemes[props.theme]} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <header style={{ display: "flex", "flex-direction": "column", gap: "0.75rem" }}>
        <Breadcrumb.Root>
          <Breadcrumb.Link href="#tasks">Tasks</Breadcrumb.Link>
          <Breadcrumb.Link href="#september-close">September close</Breadcrumb.Link>
          <Breadcrumb.Current>this task</Breadcrumb.Current>
        </Breadcrumb.Root>
        <Text as="h1" variant="heading">
          Backfill the archived delivery receipts
        </Text>
        <Text as="p" variant="mono" tone="secondary">
          Ada · high · due today · 1 attempt
        </Text>
      </header>
    </main>
  );
}

function Trails(props: { theme: ColorTheme }) {
  return (
    <section
      class={colorThemes[props.theme]}
      aria-label={`${props.theme} breadcrumb examples`}
      style={{ padding: "1.5rem", "min-width": 0 }}
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "1.5rem" }}>
        <Text as="h2" variant="heading">
          {props.theme === "cotton" ? "Cotton" : "Soot"}
        </Text>
        <div>
          <Text as="h3" variant="mono" tone="secondary">
            Root page
          </Text>
          <Breadcrumb.Root>
            <Breadcrumb.Current>Tasks</Breadcrumb.Current>
          </Breadcrumb.Root>
        </div>
        <div>
          <Text as="h3" variant="mono" tone="secondary">
            Settings
          </Text>
          <Breadcrumb.Root>
            <Breadcrumb.Link href="#configure">Configure</Breadcrumb.Link>
            <Breadcrumb.Current>Settings</Breadcrumb.Current>
          </Breadcrumb.Root>
        </div>
        <div>
          <Text as="h3" variant="mono" tone="secondary">
            Task detail
          </Text>
          <Breadcrumb.Root>
            <Breadcrumb.Link href="#tasks">Tasks</Breadcrumb.Link>
            <Breadcrumb.Link href="#september-close">September close</Breadcrumb.Link>
            <Breadcrumb.Current>this task</Breadcrumb.Current>
          </Breadcrumb.Root>
        </div>
        <div style={{ padding: "1rem", "background-color": colorVars.surface.panel }}>
          <Text as="h3" variant="mono" tone="secondary">
            Resource on panel
          </Text>
          <Breadcrumb.Root>
            <Breadcrumb.Link href="#tasks">Tasks</Breadcrumb.Link>
            <Breadcrumb.Link href="#task">Backfill the archived receipts</Breadcrumb.Link>
            <Breadcrumb.Link href="#resources">resources</Breadcrumb.Link>
            <Breadcrumb.Current>ledger/backfill-q1.csv</Breadcrumb.Current>
          </Breadcrumb.Root>
        </div>
      </div>
    </section>
  );
}

function InteractiveTrail() {
  const [activated, setActivated] = createSignal("none");
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Breadcrumb.Root>
        <Breadcrumb.Link
          href="#tasks"
          onClick={(event) => {
            event.preventDefault();
            setActivated("Tasks");
          }}
        >
          Tasks
        </Breadcrumb.Link>
        <Breadcrumb.Link
          href="#september-close"
          onClick={(event) => {
            event.preventDefault();
            setActivated("September close");
          }}
        >
          September close
        </Breadcrumb.Link>
        <Breadcrumb.Current>this task</Breadcrumb.Current>
      </Breadcrumb.Root>
      <Text as="p" role="status">
        Activated: {activated()}
      </Text>
    </main>
  );
}

const meta = {
  title: "Compositions/Breadcrumb",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    docs: {
      description: {
        component:
          "A page-header navigation landmark with native ancestor links, a non-link current page, and decorative slash separators. Children declare the hierarchy; the component supplies list and current-page semantics. Page layout owns placement above the title.",
      },
    },
  },
  args: { theme: "cotton" as ColorTheme },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  render: (args) => <TaskHeader {...args} />,
} satisfies Meta<typeof TaskHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reference = {} satisfies Story;
export const Comparison = {
  render: () => (
    <main
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
      }}
    >
      <For each={["cotton", "soot"] as const}>{(theme) => <Trails theme={theme} />}</For>
    </main>
  ),
} satisfies Story;

export const Narrow = {
  render: (args) => (
    <div style={{ width: "20rem", "max-width": "100%" }}>
      <Trails theme={args.theme} />
    </div>
  ),
} satisfies Story;

export const RightToLeft = {
  render: (args) => (
    <main class={colorThemes[args.theme]} dir="rtl" style={{ padding: "1.5rem" }}>
      <Breadcrumb.Root>
        <Breadcrumb.Link href="#tasks">المهام</Breadcrumb.Link>
        <Breadcrumb.Link href="#task">إغلاق سبتمبر</Breadcrumb.Link>
        <Breadcrumb.Current>هذه المهمة</Breadcrumb.Current>
      </Breadcrumb.Root>
    </main>
  ),
} satisfies Story;

export const Interaction = {
  render: () => <InteractiveTrail />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Breadcrumb" });
    await expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
    await expect(within(nav).getAllByRole("link")).toHaveLength(2);
    await expect(within(nav).getByText("this task")).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("link", { name: "September close" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Activated: September close");
  },
} satisfies Story;
