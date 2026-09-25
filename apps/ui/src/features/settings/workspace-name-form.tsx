import { Field } from "../../compositions/field/index.ts";
import { Input } from "../../primitives/input/index.ts";
import { Button } from "../../primitives/button/index.ts";
import { Column, Row } from "../../primitives/layout/index.ts";
export interface WorkspaceNameFormProps {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (name: string) => void;
  pending?: boolean;
  disabled?: boolean;
}
/** Controlled presentation. The connected feature owns the draft and expected stored name. */
export function WorkspaceNameForm(props: WorkspaceNameFormProps) {
  let input!: HTMLInputElement;
  return (
    <Column
      as="form"
      gap={4}
      aria-label="Workspace name"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.pending && !props.disabled && input.value.trim())
          props.onSubmit(input.value.trim());
      }}
    >
      <Field label="Workspace name" required disabled={props.disabled}>
        {(control) => (
          <Input
            {...control}
            ref={(element) => {
              input = element;
            }}
            name="workspaceName"
            value={props.name}
            readOnly={props.pending}
            onInput={(event) => props.onNameChange(event.currentTarget.value)}
          />
        )}
      </Field>
      <Row>
        <Button
          type="submit"
          pending={props.pending}
          disabled={props.disabled || !props.name.trim()}
        >
          Save name
        </Button>
      </Row>
    </Column>
  );
}
