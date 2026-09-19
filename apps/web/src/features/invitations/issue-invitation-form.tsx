import { Invitation } from "@amends/core/workspace";
import { BuiltinRoles, Role } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import {
  Button,
  Field,
  FormActions,
  FormLayout,
  Notice,
  RadioCardGroup,
  Section,
  TextField,
} from "@amends/ui/components";
import { DateTime, Exit, Schema } from "effect";
import { createSignal, Show } from "solid-js";
import { Invitations } from "../../api/invitations.ts";
import { useCommand, useQuery } from "../../api/hooks.ts";
import { CommandError, QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { Assignments } from "../../api/assignments.ts";
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
  const [roleId, setRoleId] = createSignal(BuiltinRoles.ViewerId);
  const roles = useQuery(() => Assignments.roles(opened().workspace.id));
  const issuance = useCommand(Invitations.makeIssue());
  const [issued, setIssued] = createSignal<Invitation.Record>();
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
        roleId: roleId(),
      },
    });
    if (exit && Exit.isSuccess(exit)) {
      setIssued(exit.value);
      setRecipient("");
    }
  };
  return (
    <Section title="New invitation">
      <QueryView result={roles.result()} retry={roles.refresh} loading="Loading roles…">
        {(choices) => (
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
            <RadioCardGroup
              label="Role"
              disabled={issuance.pending()}
              value={roleId()}
              onChange={(value) => setRoleId(Role.Id.make(value))}
              options={choices()
                .filter(({ role }) => role.id !== BuiltinRoles.OwnerId)
                .map(({ role, assignable }) => ({
                  value: role.id,
                  label: role.name,
                  disabled: !assignable,
                }))}
            />
            <FormActions
              primary={
                <Button
                  type="submit"
                  pending={issuance.pending()}
                  disabled={
                    !recipient().trim() ||
                    !choices().some((choice) => choice.role.id === roleId() && choice.assignable)
                  }
                >
                  issue the invitation
                </Button>
              }
            />
          </FormLayout>
        )}
      </QueryView>
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
