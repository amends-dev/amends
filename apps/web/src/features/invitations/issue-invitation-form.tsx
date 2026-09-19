import { Invitation, MemberPermissions } from "@amends/core/workspace";
import type { Permission } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import {
  Button,
  Checkbox,
  Field,
  FormActions,
  FormLayout,
  Notice,
  RadioCardGroup,
  Section,
  TextField,
} from "@amends/ui/components";
import { DateTime, Exit, Schema } from "effect";
import { createSignal, For, Show } from "solid-js";
import { Invitations } from "../../api/invitations.ts";
import { useCommand } from "../../api/hooks.ts";
import { CommandError } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { permissions } from "../members/permission-guide.tsx";
const day = (value: DateTime.Utc) => DateTime.formatIsoDate(value);
export function IssueInvitationForm() {
  const membership = useWorkspace();
  return (
    <Show when={membership().workspace.id} keyed>
      {(workspaceId) => {
        void workspaceId;
        return <IssueForm />;
      }}
    </Show>
  );
}
function IssueForm() {
  const opened = useWorkspace();
  const [recipient, setRecipient] = createSignal("");
  const [days, setDays] = createSignal("7");
  const [granted, setGranted] = createSignal<ReadonlyArray<Permission.Name>>([
    MemberPermissions.Read.name,
  ]);
  const issuance = useCommand(Invitations.makeIssue());
  const [issued, setIssued] = createSignal<Invitation.Record>();
  const toggle = (name: Permission.Name, on: boolean) =>
    setGranted((current) =>
      on ? [...current.filter((n) => n !== name), name] : current.filter((n) => n !== name),
    );
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (issuance.pending()) return;
    setIssued(undefined);
    const address = recipient().trim();
    if (!Schema.is(Identity.HumanId)(address)) return;
    const exit = await issuance.run({
      workspaceId: opened().workspace.id,
      payload: {
        recipientId: address,
        expiresAt: DateTime.add(DateTime.nowUnsafe(), { days: Number(days()) }),
        grants: granted().map((permission) => ({
          permission,
          scope: { _tag: "Workspace" as const, workspaceId: opened().workspace.id },
        })),
      },
    });
    if (exit && Exit.isSuccess(exit)) {
      setIssued(exit.value);
      setRecipient("");
    }
  };
  return (
    <Section title="New invitation">
      <FormLayout onSubmit={(event) => void submit(event)}>
        <Field
          label="Address"
          description="The email they sign in with. One address is one identity."
          required
        >
          <TextField
            type="email"
            autocomplete="off"
            value={recipient()}
            readOnly={issuance.pending()}
            onInput={(event) => setRecipient(event.currentTarget.value)}
          />
        </Field>
        <RadioCardGroup
          label="Expires"
          disabled={issuance.pending()}
          value={days()}
          onChange={setDays}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
          ]}
        />
        <Field label="Permissions" description="Granted with workspace scope when they accept.">
          <div>
            <For each={permissions}>
              {(permission) => (
                <Checkbox
                  label={permission.definition.name}
                  disabled={issuance.pending()}
                  description={permission.description}
                  checked={granted().includes(permission.definition.name)}
                  onChange={(event) =>
                    toggle(permission.definition.name, event.currentTarget.checked)
                  }
                />
              )}
            </For>
          </div>
        </Field>
        <FormActions
          primary={
            <Button type="submit" pending={issuance.pending()} disabled={!recipient().trim()}>
              issue the invitation
            </Button>
          }
        />
      </FormLayout>
      <Show when={issued()}>
        {(invitation) => (
          <Notice live="polite">
            Issued an invitation for {invitation().details.recipientId}. Expires{" "}
            {day(invitation().details.expiresAt)}.
          </Notice>
        )}
      </Show>
      <CommandError result={issuance.result()} />
    </Section>
  );
}
