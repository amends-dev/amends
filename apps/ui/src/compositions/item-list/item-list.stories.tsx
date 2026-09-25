import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { For, createSignal } from "solid-js";
import { ItemList } from "@amends/ui/compositions/item-list";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import "@amends/ui/foundations/typography/fonts";

function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }) {
  const [opened, setOpened] = createSignal("");
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column gap={4} style={{ padding: "1.5rem", "max-width": props.narrow ? "16rem" : "35rem" }}>
        <ItemList.Root aria-label="Your workspaces">
          <For
            each={[
              "Home",
              "Mercier & Co",
              "A workspace with a very long name that still needs to remain readable",
            ]}
          >
            {(name) => (
              <ItemList.Item>
                <ItemList.Link
                  href="#workspace"
                  onClick={(e) => {
                    e.preventDefault();
                    setOpened(name);
                  }}
                >
                  <WorkspaceMark decorative>{name.slice(0, 1)}</WorkspaceMark>
                  <ItemList.Content>
                    <ItemList.Title>{name}</ItemList.Title>
                    <ItemList.Description>3 members · Owner</ItemList.Description>
                  </ItemList.Content>
                  <span aria-hidden="true">›</span>
                </ItemList.Link>
              </ItemList.Item>
            )}
          </For>
        </ItemList.Root>
        <ItemList.Root variant="outline" aria-label="Workspace actions">
          <ItemList.Item>
            <ItemList.Link
              href="#create"
              onClick={(e) => {
                e.preventDefault();
                setOpened("Create");
              }}
            >
              <WorkspaceMark decorative>+</WorkspaceMark>
              <ItemList.Content>
                <ItemList.Title>New workspace</ItemList.Title>
                <ItemList.Description>A shared place for your work.</ItemList.Description>
              </ItemList.Content>
            </ItemList.Link>
          </ItemList.Item>
        </ItemList.Root>
        <output aria-label="Opened">{opened()}</output>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/ItemList", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <>
      <Specimen />
      <Specimen theme="soot" />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
export const EnlargedRTL = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Specimen narrow rtl />
    </div>
  ),
} satisfies Story;
export const Activation = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Home 3 members · Owner" });
    await expect(link).toHaveAttribute("href", "#workspace");
    await userEvent.click(link);
    await expect(canvas.getByLabelText("Opened")).toHaveTextContent("Home");
    await userEvent.click(canvas.getByRole("link", { name: /New workspace/ }));
    await expect(canvas.getByLabelText("Opened")).toHaveTextContent("Create");
  },
} satisfies Story;
