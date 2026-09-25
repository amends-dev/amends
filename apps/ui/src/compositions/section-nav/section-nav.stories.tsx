import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { SectionNav } from "./index.ts";
function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean }) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Column style={{ padding: "1rem", "max-width": props.narrow ? "15rem" : "40rem" }}>
        <SectionNav.Root aria-label="Settings sections">
          <SectionNav.Link href="#workspace" aria-current="page">
            Workspace
          </SectionNav.Link>
          <SectionNav.Link href="#members">Members</SectionNav.Link>
          <SectionNav.Link href="#invites">Invites</SectionNav.Link>
        </SectionNav.Root>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/SectionNav", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <>
      <Specimen />
      <Specimen theme="soot" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("link", { name: "Workspace" })[0]).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
