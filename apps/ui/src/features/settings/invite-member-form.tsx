import { Field } from "../../compositions/field/index.ts";
import { Input } from "../../primitives/input/index.ts";
import { Select, type SelectOption } from "../../primitives/select/index.ts";
import { Button } from "../../primitives/button/index.ts";
import { Column, Row } from "../../primitives/layout/index.ts";
import { Text } from "../../primitives/text/index.ts";
export interface InviteMemberFormProps {
  recipient: string;
  role: string | null;
  roles: ReadonlyArray<SelectOption>;
  onRecipientChange: (value: string) => void;
  onRoleChange: (value: string | null) => void;
  onSubmit: (recipient: string, role: string) => void;
  pending?: boolean;
  disabled?: boolean;
}
/** Identity syntax belongs to the configured host; the local host uses a sign-in email. */
export function InviteMemberForm(props: InviteMemberFormProps) {
  let input!: HTMLInputElement;
  return (
    <Column
      as="form"
      gap={4}
      aria-label="Invite member"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.pending && !props.disabled && input.value.trim() && props.role)
          props.onSubmit(input.value.trim(), props.role);
      }}
    >
      <Field
        label="Recipient"
        required
        disabled={props.disabled}
        description="The exact email or identity they use to sign in."
      >
        {(control) => (
          <Input
            {...control}
            ref={(element) => {
              input = element;
            }}
            name="recipient"
            value={props.recipient}
            readOnly={props.pending}
            onInput={(event) => props.onRecipientChange(event.currentTarget.value)}
          />
        )}
      </Field>
      <Field label="Role" required disabled={props.disabled || props.pending}>
        {(control) => (
          <Select
            {...control}
            name="role"
            options={props.roles}
            value={props.role}
            onChange={props.onRoleChange}
          />
        )}
      </Field>
      <Text tone="secondary">
        Valid for seven days. The invitation appears in the recipient’s workspace picker when they
        sign in. No email is sent.
      </Text>
      <Row>
        <Button
          type="submit"
          pending={props.pending}
          disabled={props.disabled || !props.recipient.trim() || !props.role}
        >
          Create invitation
        </Button>
      </Row>
    </Column>
  );
}
