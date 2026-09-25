import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { PageHeader } from "@amends/ui/compositions/page-header";
import { SegmentedControl } from "@amends/ui/compositions/segmented-control";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";

function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean }) {
  const [section, setSection] = createSignal("members");
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div
        style={{
          padding: props.narrow ? "1rem 1.125rem" : "1.5rem 1.875rem",
          "max-width": props.narrow ? "24rem" : "70rem",
        }}
      >
        <Column gap={6}>
          <PageHeader.Root>
            <PageHeader.Crumbs>Configure / Settings</PageHeader.Crumbs>
            <PageHeader.Heading>
              <PageHeader.Title>People</PageHeader.Title>
              <PageHeader.Actions>
                <Button>Invite somebody</Button>
              </PageHeader.Actions>
            </PageHeader.Heading>
            <PageHeader.Meta>5 active · 1 removed · acting as Jo Mercer (owner)</PageHeader.Meta>
          </PageHeader.Root>
          <SegmentedControl.Root
            aria-label="Settings sections"
            value={section()}
            onValueChange={setSection}
          >
            <SegmentedControl.Item value="members">People</SegmentedControl.Item>
            <SegmentedControl.Item value="invites">Invites</SegmentedControl.Item>
            <SegmentedControl.Item value="workspace">Workspace</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text tone="secondary">Page content starts at the same inline edge.</Text>
        </Column>
      </div>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/PageHeader", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Settings = {} satisfies Story;
export const Phone = { render: () => <Specimen narrow /> } satisfies Story;
export const Soot = { render: () => <Specimen theme="soot" /> } satisfies Story;
