import {
  Button,
  Field,
  FormActions,
  FormLayout,
  Notice,
  RadioCardGroup,
  Section,
  Text,
  TextField,
} from "@amends/ui/components";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";

export interface InvitationRoleChoice {
  readonly id: string;
  readonly label: string;
  readonly assignable: boolean;
}
export type InvitationRoles =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Unavailable"; readonly message: string }
  | {
      readonly _tag: "Ready";
      readonly choices: ReadonlyArray<InvitationRoleChoice>;
      readonly refreshing?: boolean;
      readonly refreshError?: string;
    };
export interface InvitationDraft {
  readonly recipientId: string;
  readonly roleId: string;
  readonly expiresInDays: 7 | 30;
}
export type IssueInvitationResult =
  | { readonly _tag: "Issued"; readonly recipientId: string; readonly expiresOn: string }
  | { readonly _tag: "Failed"; readonly message: string }
  | { readonly _tag: "Cancelled" };
export interface IssueInvitationFormProps {
  readonly roles: InvitationRoles;
  /** Initial selection only. Availability always comes from roles, never a role name. */
  readonly defaultRoleId?: string;
  /** Seed a newly mounted draft; later updates do not overwrite edits. */
  readonly initialDraft?: Partial<InvitationDraft>;
  readonly onRetryRoles: () => void;
  /** The integration owns the request, authorization, timestamp conversion, and error explanation. */
  readonly onSubmit: (draft: InvitationDraft) => Promise<IssueInvitationResult>;
}

/** A reusable interaction with no session, routing, transport, or backend-service dependency. */
export function IssueInvitationForm(props: IssueInvitationFormProps) {
  const [recipient, setRecipient] = createSignal(props.initialDraft?.recipientId ?? "");
  const [roleId, setRoleId] = createSignal(props.initialDraft?.roleId ?? props.defaultRoleId ?? "");
  const [days, setDays] = createSignal<7 | 30>(props.initialDraft?.expiresInDays ?? 7);
  const [pending, setPending] = createSignal(false);
  const [result, setResult] = createSignal<IssueInvitationResult>();
  const [addressError, setAddressError] = createSignal<string>();
  const available = createMemo(() => (props.roles._tag === "Ready" ? props.roles : undefined));
  const allowed = () =>
    available()?.choices.some((choice) => choice.id === roleId() && choice.assignable) ?? false;
  const failure = () => {
    const current = result();
    return current?._tag === "Failed" ? current.message : undefined;
  };
  const issued = () => {
    const current = result();
    return current?._tag === "Issued" ? current : undefined;
  };
  let address: HTMLInputElement | undefined;
  let active = true;
  onCleanup(() => {
    active = false;
  });
  createEffect(() => {
    if (!roleId()) setRoleId(available()?.choices.find((choice) => choice.assignable)?.id ?? "");
  });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (pending() || !allowed()) return;
    if (!recipient().trim() || !address?.validity.valid) {
      setAddressError("Enter a valid email address.");
      address?.focus();
      return;
    }
    const draft: InvitationDraft = {
      recipientId: recipient().trim(),
      roleId: roleId(),
      expiresInDays: days(),
    };
    setAddressError(undefined);
    setResult(undefined);
    setPending(true);
    try {
      const outcome = await props.onSubmit(draft);
      if (!active) return;
      setResult(outcome);
      if (outcome._tag === "Issued") setRecipient("");
    } catch {
      if (active)
        setResult({
          _tag: "Failed",
          message: "The request could not be completed. Check your connection and try again.",
        });
    } finally {
      if (active) setPending(false);
    }
  };
  return (
    <Section title="New invitation">
      <Show when={props.roles._tag === "Loading"}>
        <Text role="status">Loading roles…</Text>
      </Show>
      <Show when={props.roles._tag === "Unavailable" ? props.roles.message : undefined}>
        {(message) => (
          <Notice tone="danger" live="polite">
            {message()}{" "}
            <Button variant="secondary" onClick={props.onRetryRoles}>
              try again
            </Button>
          </Notice>
        )}
      </Show>
      <Show when={available()}>
        {(roles) => (
          <>
            <Show when={roles().refreshError}>
              {(message) => (
                <Notice tone="danger" live="polite">
                  Showing saved data. {message()}{" "}
                  <Button variant="secondary" onClick={props.onRetryRoles}>
                    try again
                  </Button>
                </Notice>
              )}
            </Show>
            <FormLayout noValidate onSubmit={(event) => void submit(event)}>
              <Field
                label="Address"
                description="The email they sign in with. One address is one identity."
                required
                error={addressError()}
              >
                <TextField
                  ref={(element) => {
                    address = element;
                  }}
                  type="email"
                  autocomplete="off"
                  value={recipient()}
                  readOnly={pending()}
                  onInput={(event) => {
                    setRecipient(event.currentTarget.value);
                    setAddressError(undefined);
                  }}
                />
              </Field>
              <RadioCardGroup
                label="Expires"
                disabled={pending()}
                value={String(days())}
                onChange={(value) => setDays(value === "30" ? 30 : 7)}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                ]}
              />
              <Show
                when={roles().choices.length > 0}
                fallback={
                  <Notice>
                    No roles are available to assign. Refresh or ask someone with invitation access.
                  </Notice>
                }
              >
                <RadioCardGroup
                  label="Role"
                  disabled={pending()}
                  value={roleId()}
                  onChange={setRoleId}
                  options={roles().choices.map((choice) => ({
                    value: choice.id,
                    label: choice.label,
                    disabled: !choice.assignable,
                  }))}
                />
                <Show when={!allowed()}>
                  <Notice>Select a role you can assign before issuing an invitation.</Notice>
                </Show>
              </Show>
              <FormActions
                primary={
                  <Button
                    type="submit"
                    pending={pending()}
                    disabled={!recipient().trim() || !allowed()}
                  >
                    issue the invitation
                  </Button>
                }
              />
            </FormLayout>
            <Show when={roles().refreshing}>
              <Text variant="caption" role="status">
                Refreshing…
              </Text>
            </Show>
          </>
        )}
      </Show>
      <Show when={issued()}>
        {(invitation) => (
          <Notice live="polite">
            Issued an invitation for {invitation().recipientId}. Expires {invitation().expiresOn}.
          </Notice>
        )}
      </Show>
      <Show when={failure()}>
        {(message) => (
          <Notice tone="danger" live="polite">
            {message()}
          </Notice>
        )}
      </Show>
    </Section>
  );
}
