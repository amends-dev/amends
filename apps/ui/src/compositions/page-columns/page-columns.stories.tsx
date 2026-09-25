import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Divider } from "@amends/ui/primitives/divider";
import { Text } from "@amends/ui/primitives/text";
import { PageColumns } from "./index.ts";

function Specimen(props: { narrow?: boolean }) {
  return (
    <ThemeProvider theme="cotton">
      <Column style={{ padding: "1rem", "max-width": props.narrow ? "34rem" : "70rem" }}>
        <PageColumns.Root>
          <PageColumns.Primary>
            <Column gap={3}>
              <Divider.Root>
                <Divider.Label as="h2">Invites</Divider.Label>
                <Divider.Line />
              </Divider.Root>
              <Text>Invitation history stays in the primary column.</Text>
            </Column>
          </PageColumns.Primary>
          <PageColumns.Aside aria-label="New invitation">
            <Column gap={3}>
              <Divider.Root>
                <Divider.Label as="h2">New invite</Divider.Label>
                <Divider.Line />
              </Divider.Root>
              <Text>The form stays visible when the columns stack.</Text>
            </Column>
          </PageColumns.Aside>
        </PageColumns.Root>
      </Column>
    </ThemeProvider>
  );
}

const meta = { title: "Compositions/PageColumns", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Wide = {} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
