import {
  invitationIntent,
  formatInstant,
  invitationStatus,
  type SettingsData,
} from "@amends/client";
import { InviteMemberForm } from "@amends/ui/features/settings";
import { ItemList } from "@amends/ui/compositions/item-list";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Status } from "@amends/ui/primitives/status";
import { Divider } from "@amends/ui/primitives/divider";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createSignal, For, Show } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { settingsMessage, useSettingsScope } from "./settings.tsx";
export function InviteForm() {
  const value = useSettingsScope(),
    [recipient, setRecipient] = createSignal(""),
    [role, setRole] = createSignal<string | null>(null);
  let intent: ReturnType<typeof invitationIntent> | undefined;
  createEffect(() => {
    if (value.saved()) {
      setRecipient("");
      setRole(null);
      intent = undefined;
    }
  });
  return (
    <Show when={value.data()}>
      {(data) => (
        <Column gap={4}>
          <Divider.Root>
            <Divider.Label as="h2">New invite</Divider.Label>
            <Divider.Line />
          </Divider.Root>
          <Show
            when={data().settings.canInvite}
            fallback={
              <Text tone="secondary">You don’t have permission to create invitations.</Text>
            }
          >
            <InviteMemberForm
              recipient={recipient()}
              role={role()}
              roles={data()
                .settings.roles.filter((choice) => choice.assignable)
                .map((choice) => ({ value: choice.role.id, label: choice.role.name }))}
              onRecipientChange={setRecipient}
              onRoleChange={setRole}
              pending={value.pending()}
              disabled={value.needsRefresh()}
              onSubmit={(recipientId, roleId) => {
                if (intent?.recipientId !== recipientId || intent.roleId !== roleId)
                  intent = invitationIntent(recipientId, roleId);
                value.send(intent);
              }}
            />
          </Show>
        </Column>
      )}
    </Show>
  );
}
function InvitationRow(props: { invitation: SettingsData["invitations"][number] }) {
  const value = useSettingsScope(),
    [open, setOpen] = createSignal(false);
  const role = () =>
    value
      .data()
      ?.settings.roles.find((choice) => choice.role.id === props.invitation.details.roleId);
  const status = () => invitationStatus(props.invitation);
  createEffect(() => {
    if (value.saved()) setOpen(false);
  });
  return (
    <ItemList.Item>
      <ItemList.Row>
        <ItemList.Content>
          <ItemList.Title>{props.invitation.details.recipientId}</ItemList.Title>
          <ItemList.Description>
            {role()?.role.name ?? props.invitation.details.roleId} · Expires{" "}
            {formatInstant(props.invitation.details.expiresAt)}
          </ItemList.Description>
          <ItemList.Description>
            Created {formatInstant(props.invitation.details.issuedAt)}
          </ItemList.Description>
        </ItemList.Content>
        <ItemList.Actions>
          <Status.Root
            tone={status() === "Pending" ? "pending" : status() === "Accepted" ? "success" : "idle"}
          >
            <Status.Indicator />
            <Status.Label>{status()}</Status.Label>
          </Status.Root>
          <Show when={props.invitation.state._tag === "Pending" && role()?.assignable}>
            <Dialog.Root
              open={open()}
              onOpenChange={(next) => {
                if (!value.pending()) setOpen(next);
              }}
            >
              <Dialog.Trigger
                variant="ghost"
                tone="danger"
                disabled={value.pending() || value.needsRefresh()}
              >
                Revoke
              </Dialog.Trigger>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>Revoke invitation</Dialog.Title>
                  <Dialog.Description>
                    {props.invitation.details.recipientId} will no longer be able to join with this
                    invitation.
                  </Dialog.Description>
                </Dialog.Header>
                <Dialog.Body>
                  <Show when={open() && value.error()}>
                    <Text role="alert" tone="danger">
                      {settingsMessage(value.error())}
                    </Text>
                  </Show>
                </Dialog.Body>
                <Dialog.Footer>
                  <Dialog.Close variant="secondary" disabled={value.pending()}>
                    Cancel
                  </Dialog.Close>
                  <Button
                    tone="danger"
                    pending={value.pending()}
                    disabled={value.needsRefresh()}
                    onClick={() =>
                      value.send({ kind: "revoke", invitationId: props.invitation.details.id })
                    }
                  >
                    Confirm revoke
                  </Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Root>
          </Show>
        </ItemList.Actions>
      </ItemList.Row>
    </ItemList.Item>
  );
}
export function InvitationHistory() {
  const value = useSettingsScope();
  const invitations = keyed(
    () => value.data()?.invitations.toReversed() ?? [],
    (invitation) => invitation.details.id,
  );
  return (
    <Show when={value.data()}>
      {(data) => (
        <Show
          when={data().settings.canReadInvitations}
          fallback={
            <Text tone="secondary">You don’t have permission to view invitation history.</Text>
          }
        >
          <Column gap={3}>
            <Divider.Root>
              <Divider.Label as="h2">Invites</Divider.Label>
              <Divider.Note>{data().invitations.length} in total</Divider.Note>
              <Divider.Line />
              <Divider.Note>single use</Divider.Note>
            </Divider.Root>
            <Show
              when={data().invitations.length}
              fallback={<Text tone="secondary">No invitations yet.</Text>}
            >
              <ItemList.Root aria-label="Invitation history">
                <For each={invitations.ids()}>
                  {(id) => (
                    <Show when={invitations.get(id)}>
                      {(invitation) => <InvitationRow invitation={invitation()} />}
                    </Show>
                  )}
                </For>
              </ItemList.Root>
            </Show>
          </Column>
        </Show>
      )}
    </Show>
  );
}
