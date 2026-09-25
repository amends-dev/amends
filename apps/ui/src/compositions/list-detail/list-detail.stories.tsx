import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, Show } from "solid-js";
import { ListDetail } from "./index.ts";
function Specimen(props: { narrow?: boolean }) {
  const [selected, setSelected] = createSignal(true);
  return (
    <ThemeProvider theme="cotton">
      <Column style={{ padding: "1rem", "max-width": props.narrow ? "20rem" : "65rem" }}>
        <ListDetail.Root selected={selected()}>
          <ListDetail.List>
            <Button onClick={() => setSelected(true)}>Open member</Button>
          </ListDetail.List>
          <Show when={selected()}>
            <ListDetail.Detail aria-label="Member details">
              <Column>
                <ListDetail.Back
                  href="#members"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelected(false);
                  }}
                >
                  Back to members
                </ListDetail.Back>
                <Text as="h2" variant="heading">
                  Member details
                </Text>
              </Column>
            </ListDetail.Detail>
          </Show>
        </ListDetail.Root>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/ListDetail", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Wide = {} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
