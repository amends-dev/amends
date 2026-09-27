import { Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { invitationDetail, type SettingsInvitation } from "./member-settings.tsx";
import { SettingsAlert, type SettingsError, type SettingsRole } from "./wording.tsx";
import * as s from "./settings.css.ts";

export interface InviteMemberProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  readonly recipient: string;
  readonly onRecipientChange: (recipient: string) => void;
  /** The roles an invitation may give. */
  readonly roles: readonly SettingsRole[];
  readonly role?: string;
  readonly onRoleChange: (roleId: string) => void;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /**
   * Why creation failed; the draft stays. After `refresh-failed` the invitation exists, so the
   * primary action reloads it instead of creating another.
   */
  readonly error?: SettingsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Inviting one sign-in email with a role; nothing is sent to them. Full screen on phones. */
export function InviteMember(props: InviteMemberProps) {
  const formId = `invite-member-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  const created = () => props.error === "refresh-failed";
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Invite member" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Invite member</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (created()) props.onRefresh?.();
              else if (props.recipient.trim() && props.role && !busy()) props.onCreate();
            }}
          >
            <Field.Root
              hint="Use the exact email they sign in with."
              error={props.error === "invalid" ? "Enter the email they sign in with." : undefined}
            >
              <Field.Label>Sign-in email</Field.Label>
              <Input
                type="email"
                value={props.recipient}
                onInput={(event) => props.onRecipientChange(event.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
                disabled={busy() || created()}
                autofocus
                required
              />
            </Field.Root>
            <Field.Root hint="Valid for seven days. It appears in their workspace picker when they sign in.">
              <Field.Label>Workspace role</Field.Label>
              <Select
                options={props.roles.map((role) => ({ value: role.id, label: role.name }))}
                value={props.role}
                onChange={props.onRoleChange}
                placeholder="Choose a role"
                disabled={busy() || created()}
              />
            </Field.Root>
            <p class={s.note}>No email is sent.</p>
            <Show when={props.error && props.error !== "invalid" && props.error}>
              {(error) => (
                <SettingsAlert
                  action="invite"
                  error={error()}
                  onRefresh={created() ? undefined : props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.phoneHidden} onClick={close} disabled={busy()}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={busy() || (!created() && (!props.recipient.trim() || !props.role))}
          >
            {created() ? (props.refreshing ? "Refreshing…" : "Refresh") : "Create invitation"}
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface InvitationHistoryProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  /** Every invitation, newest first. */
  readonly invitations: readonly SettingsInvitation[];
  /** Asks to revoke a pending invitation. */
  readonly onRevoke?: (id: string) => void;
  /** Opens InviteMember; shown to a reader who may invite. */
  readonly onInvite?: () => void;
}

const statuses = {
  pending: "Pending",
  accepted: "Accepted",
  expired: "Expired",
  revoked: "Revoked",
} as const;

/** Every invitation and where it stands; pending ones may be revoked. Full screen on phones. */
export function InvitationHistory(props: InvitationHistoryProps) {
  return (
    <Modal.Root open={props.open} onClose={() => props.onClose()} aria-label="Invitations">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Invitations</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.historyHeadings}>
            <div class={s.historyHeadingRow}>
              <span class={s.historyHeading} aria-hidden="true">
                Invitations
              </span>
              <span class={s.historyTotal}>{props.invitations.length} total</span>
            </div>
            <Divider />
          </div>
          <Show
            when={props.invitations.length > 0}
            fallback={<p class={s.note}>No invitations yet.</p>}
          >
            <ul class={s.list} aria-label="Invitation history">
              <Keyed each={props.invitations} by={(invitation) => invitation.id}>
                {(invitation) => (
                  <li class={s.history}>
                    <span class={s.historyAddress}>{invitation().recipient}</span>
                    <span class={s.historyDetail}>{invitationDetail(invitation())}</span>
                    <span class={s.historyStatus}>{statuses[invitation().status]}</span>
                    <Show
                      when={
                        invitation().status === "pending" &&
                        invitation().revocable &&
                        props.onRevoke
                      }
                    >
                      {(revoke) => (
                        <Button
                          variant="quiet"
                          class={s.historyRevoke}
                          aria-label={`Revoke invitation for ${invitation().recipient}`}
                          onClick={() => revoke()(invitation().id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </Show>
                  </li>
                )}
              </Keyed>
            </ul>
          </Show>
        </Pane.Body>
        <Modal.Actions>
          <Show when={props.onInvite}>
            {(invite) => (
              <Button class={s.leading} onClick={() => invite()()}>
                Invite people
              </Button>
            )}
          </Show>
          <Button
            class={props.onInvite ? s.phoneHidden : undefined}
            onClick={() => props.onClose()}
          >
            Done
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConfirmRevokeInvitationProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly recipient: string;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: SettingsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms revoking a pending invitation. */
export function ConfirmRevokeInvitation(props: ConfirmRevokeInvitationProps) {
  const close = () => {
    if (!props.pending) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Revoke invitation" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Revoke invitation?</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.recipient}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              This person will no longer be able to join using this invitation.
            </p>
            <Show when={props.error}>
              {(error) => (
                <SettingsAlert
                  action="revoke"
                  error={error()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </div>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={close} disabled={props.pending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={props.pending} onClick={() => props.onConfirm()}>
            Revoke invitation
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
