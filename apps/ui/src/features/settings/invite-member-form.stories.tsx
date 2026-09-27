import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Container } from "@amends/ui/primitives/layout";
import { InviteMemberForm } from "./index.ts";
function Specimen(props: { theme?: "cotton" | "soot"; pending?: boolean }) {
  const [recipient, setRecipient] = createSignal(""),
    [role, setRole] = createSignal<string | null>(null);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Container maxWidth="30rem">
        <InviteMemberForm
          recipient={recipient()}
          role={role()}
          roles={[
            { value: "member", label: "Member" },
            { value: "administrator", label: "Administrator" },
          ]}
          onRecipientChange={setRecipient}
          onRoleChange={setRole}
          onSubmit={() => {}}
          pending={props.pending}
        />
      </Container>
    </ThemeProvider>
  );
}
const meta = { title: "Features/Invite member form", render: () => <Specimen /> } satisfies Meta;
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
export const Pending = { render: () => <Specimen pending /> } satisfies Story;
