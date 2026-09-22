import { Button, Composer, Notice, Section, SectionStack, Text } from "@amends/ui/components";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

const meta = {
  title: "Foundations/Existing UI",
  parameters: {
    docs: {
      description: {
        component:
          "The workshop uses the existing @amends/ui fonts, tokens, styles, and components.",
      },
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controls: Story = {
  render: () => (
    <SectionStack>
      <Section title="Shared controls">
        <Text>Every feature composes these same controls and theme tokens.</Text>
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button pending>Working</Button>
        <Button disabled>Unavailable</Button>
      </Section>
      <Notice tone="danger">A recoverable error stays close to the action.</Notice>
    </SectionStack>
  ),
};
export const Conversation: Story = {
  render: () => {
    const [draft, setDraft] = createSignal("");
    const [message, setMessage] = createSignal("");
    return (
      <SectionStack>
        <Composer
          label="Message"
          description="A local interaction with no backend connection."
          value={draft()}
          onChange={setDraft}
          onSubmit={() => {
            setMessage(draft());
            setDraft("");
          }}
        />
        <Text role="status">{message() ? `Sent: ${message()}` : "No message sent."}</Text>
      </SectionStack>
    );
  },
};
